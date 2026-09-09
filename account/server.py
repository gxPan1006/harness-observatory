"""Private Google account storage. Bind loopback; never serve the SQLite file."""
from contextlib import contextmanager
import base64, hashlib, json, os, secrets, sqlite3, time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
import requests
from google.oauth2 import id_token
from google.auth.transport.requests import Request

ORIGIN = os.getenv('ACCOUNT_ORIGIN', 'https://ai-cognit.com')
CALLBACK = os.getenv('GOOGLE_REDIRECT_URI', 'https://cloud.ai-cognit.com/auth/google/callback')
DB = Path(os.getenv('ACCOUNT_DB', '/var/lib/harness-observatory/accounts/accounts.sqlite3'))
CLIENT = os.getenv('GOOGLE_CLIENT_ID', '')
SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
COOKIE = '__Secure-harness_session'
FLOW = '__Secure-harness_flow'
EMPTY = {'saved':[], 'read':[], 'following':[], 'notes':{}, 'lastVisit':''}

def hashed(value): return hashlib.sha256(value.encode()).hexdigest()
@contextmanager
def connect():
    con=sqlite3.connect(DB, timeout=15);con.row_factory=sqlite3.Row
    try:
        with con:yield con
    finally:con.close()

def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, sub TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS flows (state TEXT PRIMARY KEY, browser TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS tickets (token TEXT PRIMARY KEY, browser TEXT NOT NULL, sub TEXT NOT NULL, expires REAL NOT NULL);
        ''')
    DB.chmod(0o600)

def validate_changes(value):
    if not isinstance(value,dict) or set(value)-set(EMPTY): raise ValueError('Invalid changes')
    for key,part in value.items():
        if key in ('saved','read','following'):
            if not isinstance(part,dict) or set(part)-{'add','remove'}: raise ValueError('Invalid list changes')
            for ids in part.values():
                if not isinstance(ids,list) or len(ids)>5000 or any(not isinstance(i,str) or not 1<=len(i)<=100 for i in ids):raise ValueError('Invalid IDs')
        elif key=='notes':
            if not isinstance(part,dict) or len(part)>5000 or any(not isinstance(k,str) or len(k)>100 or not isinstance(v,str) or len(v)>20000 for k,v in part.items()):raise ValueError('Invalid notes')
        elif not isinstance(part,str) or len(part)>50:raise ValueError('Invalid date')
    return value

def apply_changes(sub, changes):
    validate_changes(changes)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        row=c.execute('SELECT data FROM users WHERE sub=?',(sub,)).fetchone()
        if row is None:raise ValueError('Unknown account')
        data=json.loads(row['data'])
        for key,part in changes.items():
            if key in ('saved','read','following'):
                data[key]=sorted((set(data[key])|set(part.get('add',[])))-set(part.get('remove',[])))
                if len(data[key])>10000:raise ValueError('Account list limit')
            elif key=='notes':
                for k,v in part.items():
                    if v:data['notes'][k]=v
                    else:data['notes'].pop(k,None)
            else:data[key]=part
        encoded=json.dumps(data,ensure_ascii=False)
        if len(encoded.encode())>2_000_000:raise ValueError('Account storage limit')
        c.execute('UPDATE users SET data=? WHERE sub=?',(encoded,sub))
        return data

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass # OAuth codes, cookies and personal data never enter logs.
    def cookies(self):
        try:c=SimpleCookie();c.load(self.headers.get('Cookie',''));return {k:v.value for k,v in c.items()}
        except Exception:return {}
    def reply(self,status,data=None,location=None,cookies=()):
        body=json.dumps(data or {},ensure_ascii=False).encode()
        self.send_response(status)
        for k,v in [('Content-Type','application/json; charset=utf-8'),('Cache-Control','no-store, private'),('Referrer-Policy','no-referrer'),('X-Content-Type-Options','nosniff')]:self.send_header(k,v)
        if location:self.send_header('Location',location)
        for value in cookies:self.send_header('Set-Cookie',value)
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def cookie(self,key,value,age):return f'{key}={value}; Path=/harness/; Max-Age={age}; Secure; HttpOnly; SameSite=Lax'
    def session(self):
        token=self.cookies().get(COOKIE,'')
        with connect() as c:
            return c.execute('SELECT users.* FROM sessions JOIN users USING(sub) WHERE token=? AND expires>?',(hashed(token),time.time())).fetchone()
    def do_GET(self):
        try:self.get()
        except Exception:self.reply(503,{'error':'服务暂不可用，请重试'})
    def get(self):
        path=urlsplit(self.path).path;q=parse_qs(urlsplit(self.path).query)
        if path=='/harness/api/session':
            row=self.session()
            return self.reply(200,{'user':{'id':row['sub'],'email':row['email'],'name':row['name']} if row else None,'personal':json.loads(row['data']) if row else EMPTY})
        if path=='/harness/api/auth/start':
            if not CLIENT or not SECRET:return self.reply(503,{'error':'Google 登录尚未配置'})
            state='harness_'+secrets.token_urlsafe(32);browser=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48);nonce=secrets.token_urlsafe(32)
            with connect() as c:
                for table in ('flows','tickets','sessions'):c.execute(f'DELETE FROM {table} WHERE expires<?',(time.time(),))
                c.execute('INSERT INTO flows VALUES(?,?,?,?,?)',(hashed(state),hashed(browser),verifier,nonce,time.time()+600))
            challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
            url='https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(dict(client_id=CLIENT,redirect_uri=CALLBACK,response_type='code',scope='openid email profile',state=state,nonce=nonce,code_challenge=challenge,code_challenge_method='S256',prompt='select_account'))
            return self.reply(302,location=url,cookies=[self.cookie(FLOW,browser,600)])
        if path=='/auth/google/callback':
            state=q.get('state',[''])[0]
            with connect() as c:
                c.execute('BEGIN IMMEDIATE');flow=c.execute('SELECT * FROM flows WHERE state=? AND expires>?',(hashed(state),time.time())).fetchone();c.execute('DELETE FROM flows WHERE state=?',(hashed(state),))
            if not flow:return self.reply(400,{'error':'登录已过期，请重新开始'})
            if 'error' in q:return self.reply(303,location=ORIGIN+'/harness/?auth=cancelled#saved')
            response=requests.post('https://oauth2.googleapis.com/token',data={'code':q.get('code',[''])[0],'client_id':CLIENT,'client_secret':SECRET,'redirect_uri':CALLBACK,'grant_type':'authorization_code','code_verifier':flow['verifier']},timeout=20)
            response.raise_for_status()
            claims=id_token.verify_oauth2_token(response.json()['id_token'],Request(),CLIENT,clock_skew_in_seconds=10)
            if claims.get('nonce')!=flow['nonce'] or claims.get('email_verified') is not True or not claims.get('sub'):return self.reply(400,{'error':'无法确认 Google 账号'})
            ticket=secrets.token_urlsafe(32)
            with connect() as c:
                c.execute('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(sub) DO UPDATE SET email=excluded.email,name=excluded.name',(claims['sub'],claims['email'],claims.get('name',claims['email']),json.dumps(EMPTY)))
                c.execute('INSERT INTO tickets VALUES(?,?,?,?)',(hashed(ticket),flow['browser'],claims['sub'],time.time()+60))
            return self.reply(303,location=ORIGIN+'/harness/api/auth/finish?'+urlencode({'ticket':ticket}))
        if path=='/harness/api/auth/finish':
            with connect() as c:
                c.execute('BEGIN IMMEDIATE');ticket=c.execute('SELECT * FROM tickets WHERE token=? AND browser=? AND expires>?',(hashed(q.get('ticket',[''])[0]),hashed(self.cookies().get(FLOW,'')),time.time())).fetchone()
                if not ticket:return self.reply(400,{'error':'登录浏览器不匹配，请重新开始'})
                c.execute('DELETE FROM tickets WHERE token=?',(ticket['token'],));token=secrets.token_urlsafe(32)
                c.execute('DELETE FROM sessions WHERE token=?',(hashed(self.cookies().get(COOKIE,'')),))
                c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashed(token),ticket['sub'],time.time()+30*86400))
            return self.reply(303,location=ORIGIN+'/harness/#saved',cookies=[self.cookie(COOKIE,token,30*86400),self.cookie(FLOW,'',0)])
        self.reply(404)
    def do_POST(self):
        if self.headers.get('Origin')!=ORIGIN or self.headers.get('X-Harness-Request')!='1':return self.reply(403,{'error':'请求来源不符'})
        row=self.session()
        if not row:return self.reply(401,{'error':'请先登录'})
        if self.headers.get('X-Harness-Account')!=row['sub']:return self.reply(409,{'error':'账号已切换，请刷新后操作'})
        try:
            path=urlsplit(self.path).path
            if path=='/harness/api/logout':
                with connect() as c:c.execute('DELETE FROM sessions WHERE token=?',(hashed(self.cookies().get(COOKIE,'')),))
                return self.reply(200,cookies=[self.cookie(COOKIE,'',0)])
            if path!='/harness/api/personal':return self.reply(404)
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>250_000:return self.reply(413)
            changes=json.loads(self.rfile.read(size));data=apply_changes(row['sub'],changes)
            return self.reply(200,{'personal':data})
        except (ValueError,TypeError):self.reply(400,{'error':'记录格式或大小不符合要求'})
        except Exception:self.reply(503,{'error':'保存失败，请重试'})

if __name__=='__main__':
    initialize();ThreadingHTTPServer(('127.0.0.1',int(os.getenv('ACCOUNT_PORT','8791'))),Handler).serve_forever()
