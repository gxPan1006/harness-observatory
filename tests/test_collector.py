import contextlib, io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from collector import update as u

VALID={'titleZh':'上下文隔离','summary':'文档介绍隔离','facts':['原文事实'],'insight':'需对照验证','experiment':'固定模型比较成功率','caveat':'仅据文档','themes':['context'],'relevance':90,'significance':'normal'}
class CollectorTests(unittest.TestCase):
    def test_source_fields_cannot_be_overwritten_by_model(self):
        c=u.candidate('https://example.com/a','Original','Test',text='Source'*80,published='2026-09-01')
        with patch.object(u,'llm',return_value=({**VALID,'url':'https://evil.example','published':'2099-01-01','org':'Fake'},{})):
            result,_=u.summarize(c)
        self.assertEqual(result['url'],'https://example.com/a');self.assertEqual(result['published'],'2026-09-01');self.assertEqual(result['org'],'Test');self.assertNotIn('text',result)
    def test_reject_invalid_model_schema(self):
        for change in [{'themes':['not-a-theme']},{'facts':'invented'},{'relevance':'90'},{'significance':'urgent'}]:
            with self.assertRaises(ValueError): u.validate_brief({**VALID,**change})
    def test_one_schema_repair(self):
        c=u.candidate('https://example.com/a','Original','Test',text='Source'*80)
        with patch.object(u,'llm',side_effect=[({**VALID,'themes':['工具']},{'prompt_tokens':10}),(VALID,{'prompt_tokens':20})]) as model:
            result,usage=u.summarize(c)
        self.assertEqual(model.call_count,2);self.assertEqual(usage['prompt_tokens'],30)
    def test_dedupe_tracking_urls(self):
        self.assertEqual(u.canonical('https://example.com/a/?utm_source=x#heading'),'https://example.com/a')
        self.assertEqual(u.ident(u.canonical('https://example.com/a/')),u.ident(u.canonical('https://example.com/a')))
    def test_reject_fabricated_digest_references(self):
        with patch.object(u,'llm',return_value=({'headline':'X','synthesis':'X','watch':['X'],'items':['nonexistent']},{})):
            with self.assertRaises(ValueError):u.make_digest([{'id':'real','titleZh':'T','org':'O','summary':'S','published':None}])
    def test_article_failure_can_use_labeled_rss_excerpt(self):
        c=u.candidate('https://example.com/a','Original','Test',excerpt='Official RSS excerpt '*20)
        with patch.object(u,'page',side_effect=ValueError('blocked')),patch.object(u,'llm',return_value=(VALID,{})):
            result,_=u.summarize(c)
        self.assertTrue(result['excerptOnly']);self.assertNotIn('excerpt',result)
    def test_atomic_publish_preserves_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'feed.json';u.atomic(p,{'items':[1]});u.atomic(p,{'items':[2]})
            self.assertEqual(json.loads(p.read_text()),{'items':[2]});self.assertFalse(p.with_suffix('.tmp').exists())
    def test_failure_retains_previous_items_and_records_pending_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state';out=Path(tmp)/'out';state.mkdir()
            old={**VALID,'id':'old','published':'2026-01-01','addedAt':'2026-01-02'}
            u.atomic(state/'database.json',{'items':{'old':old},'pending':{},'ignored':[],'digests':[],'sources':{}})
            config={'repos':[],'feeds':[],'themes':[],'seeds':[{'url':'https://example.com/new','title':'New','org':'Test'}]}
            with patch.object(u,'STATE',state),patch.object(u,'OUTPUT',out),patch.object(u,'CONFIG',config),patch.object(u,'summarize',side_effect=RuntimeError('failed')),contextlib.redirect_stdout(io.StringIO()):
                code=u.run(1)
            self.assertEqual(code,1);published=json.loads((out/'feed.json').read_text());self.assertEqual(published['items'][0]['id'],'old')
            db=json.loads((state/'database.json').read_text());self.assertEqual(len(db['pending']),1);self.assertIn('retryAfter',next(iter(db['pending'].values())))
    def test_repeat_does_not_pay_for_published_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state';out=Path(tmp)/'out';c=u.candidate('https://example.com/a','T','Test');old={**c,**VALID,'addedAt':u.now()};old.pop('text',None)
            u.atomic(state/'database.json',{'items':{c['id']:old},'pending':{},'ignored':[],'digests':[],'sources':{}})
            config={'repos':[],'feeds':[],'themes':[],'seeds':[{'url':c['url'],'title':'T','org':'Test'}]}
            with patch.object(u,'STATE',state),patch.object(u,'OUTPUT',out),patch.object(u,'CONFIG',config),patch.object(u,'summarize') as model,contextlib.redirect_stdout(io.StringIO()):u.run(24)
            model.assert_not_called()
if __name__=='__main__':unittest.main()
