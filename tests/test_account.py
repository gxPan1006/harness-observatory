import http.client,json,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch,Mock
from urllib.parse import urlsplit,parse_qs,urlencode
from account import server as a

class AccountTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.db=patch.object(a,'DB',Path(self.tmp.name)/'accounts.sqlite3');self.db.start();a.initialize()
  with a.connect() as c:
   for user in ('alice','bob'):
    c.execute('INSERT INTO users VALUES(?,?,?,?)',(user,user+'@example.test',user,json.dumps(a.EMPTY)))
    c.execute('INSERT INTO sessions VALUES(?,?,?)',(a.hashed(user+'-token'),user,time.time()+600))
  self.http=a.ThreadingHTTPServer(('127.0.0.1',0),a.Handler);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
 def tearDown(self):
  self.http.shutdown();self.http.server_close();self.thread.join();self.db.stop();self.tmp.cleanup()
 def req(self,path,method='GET',data=None,user=None,headers=None):
  h={'Origin':a.ORIGIN,'X-Harness-Request':'1'}
  if user:h.update({'Cookie':a.COOKIE+'='+user+'-token','X-Harness-Account':user})
  h.update(headers or {});con=http.client.HTTPConnection('127.0.0.1',self.http.server_port);con.request(method,path,body=json.dumps(data) if data is not None else None,headers=h);r=con.getresponse();body=r.read();result=(r.status,dict(r.getheaders()),json.loads(body));con.close();return result
 def test_anonymous_and_csrf_requests_cannot_access_private_records(self):
  self.assertEqual(self.req('/harness/api/personal','POST',{'saved':{'add':['x']}})[0],401)
  self.assertEqual(self.req('/harness/api/personal','POST',{},'alice',{'Origin':'https://evil.example'})[0],403)
  s,h,d=self.req('/harness/api/session');self.assertIsNone(d['user']);self.assertEqual(d['personal']['saved'],[]);self.assertIn('no-store',h['Cache-Control'])
 def test_account_isolation_and_merge_preserve_other_fields(self):
  self.req('/harness/api/personal','POST',{'saved':{'add':['alice-only']}},'alice')
  self.req('/harness/api/personal','POST',{'notes':{'article':'private note'}},'alice')
  self.req('/harness/api/personal','POST',{'saved':{'add':['bob-only']}},'bob')
  alice=self.req('/harness/api/session',user='alice')[2]['personal'];bob=self.req('/harness/api/session',user='bob')[2]['personal']
  self.assertEqual(alice['saved'],['alice-only']);self.assertEqual(alice['notes']['article'],'private note');self.assertEqual(bob['saved'],['bob-only']);self.assertEqual(bob['notes'],{})
 def test_stale_tab_cannot_write_into_new_account(self):
  status,_,_=self.req('/harness/api/personal','POST',{'saved':{'add':['leak']}},'bob',{'X-Harness-Account':'alice'});self.assertEqual(status,409)
  self.assertEqual(self.req('/harness/api/session',user='bob')[2]['personal']['saved'],[])
 def test_cannot_choose_another_user_in_payload(self):
  self.assertEqual(self.req('/harness/api/personal','POST',{'sub':'bob'},'alice')[0],400)
 def test_logout_revokes_session(self):
  self.assertEqual(self.req('/harness/api/logout','POST',user='alice')[0],200)
  self.assertIsNone(self.req('/harness/api/session',user='alice')[2]['user'])
 def test_oauth_state_pkce_browser_binding_and_single_use(self):
  with patch.object(a,'CLIENT','client'),patch.object(a,'SECRET','secret'):
   status,headers,_=self.req('/harness/api/auth/start');self.assertEqual(status,302)
   auth=parse_qs(urlsplit(headers['Location']).query);self.assertEqual(auth['code_challenge_method'],['S256']);self.assertTrue(auth['state'][0].startswith('harness_'))
   browser=headers['Set-Cookie'].split(';')[0]
   self.assertEqual(self.req('/auth/google/callback?state=forged&code=fake')[0],400)
   claims={'sub':'google-new','email':'new@example.test','email_verified':True,'name':'New','nonce':auth['nonce'][0]}
   response=Mock();response.json.return_value={'id_token':'test-only'}
   callback='/auth/google/callback?'+urlencode({'state':auth['state'][0],'code':'test-only'})
   with patch.object(a.requests,'post',return_value=response),patch.object(a.id_token,'verify_oauth2_token',return_value=claims):
    status,headers,_=self.req(callback);self.assertEqual(status,303)
   finish=urlsplit(headers['Location']);finish=finish.path+'?'+finish.query
   self.assertEqual(self.req(finish)[0],400)
   status,headers,_=self.req(finish,headers={'Cookie':browser});self.assertEqual(status,303)
   self.assertEqual(self.req(finish,headers={'Cookie':browser})[0],400)
   self.assertEqual(self.req(callback)[0],400)
 def test_invalid_id_token_cannot_create_login_ticket(self):
  with patch.object(a,'CLIENT','client'),patch.object(a,'SECRET','secret'):
   _,headers,_=self.req('/harness/api/auth/start');auth=parse_qs(urlsplit(headers['Location']).query)
   response=Mock();response.json.return_value={'id_token':'invalid'}
   with patch.object(a.requests,'post',return_value=response),patch.object(a.id_token,'verify_oauth2_token',side_effect=ValueError('invalid signature')):
    self.assertEqual(self.req('/auth/google/callback?'+urlencode({'state':auth['state'][0],'code':'fake'}))[0],503)
   with a.connect() as c:self.assertEqual(c.execute('SELECT count(*) FROM tickets').fetchone()[0],0)
