import copy, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from collector import update as u

class DirectionTests(unittest.TestCase):
    def setUp(self):
        self.pool=[dict(id=str(n),org=org,themes=['context'],published='2026-09-01',addedAt='2026-09-01',facts=['documented'],caveat='README only') for n,org in enumerate(['A','B','A'])]
        self.value={'thesis':'有界上下文','summary':'基于文档样本的综合推断',**{k:[{'text':'需要实验验证的判断','refs':['0','1']}] for k in ['patterns','tradeoffs','watch']}}
    def test_reject_fabricated_and_single_organization_claims(self):
        for refs in [['0','fake'],['0','2']]:
            value=copy.deepcopy(self.value);value['patterns'][0]['refs']=refs
            with self.assertRaises(ValueError):u.validate_direction(value,self.pool)
        self.assertEqual(u.validate_direction(self.value,self.pool),self.value)
    def test_preserve_previous_analysis_on_failure_and_cache_success(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(u,'STATE',Path(tmp)),patch.object(u,'CONFIG',{'themes':[{'id':'context'}]}):
            db={'items':{i['id']:i for i in self.pool},'directions':{'context':{'thesis':'上一版'}}};errors=[];usage={}
            with patch.object(u,'llm',side_effect=RuntimeError('unavailable')):u.refresh_directions(db,errors,usage)
            self.assertEqual(db['directions']['context']['thesis'],'上一版');self.assertTrue(errors)
            aliased=copy.deepcopy(self.value)
            for field in ('patterns','tradeoffs','watch'): aliased[field][0]['refs']=['S01','S02']
            with patch.object(u,'llm',return_value=(aliased,{})) as model:
                u.refresh_directions(db,[],usage);u.refresh_directions(db,[],usage)
                self.assertEqual(model.call_count,1)
    def test_pool_balances_orgs_and_deduplicates_project_versions(self):
        self.pool[0]['repo']='same/project';self.pool[2]['repo']='same/project'
        pool=u.direction_pool(self.pool,'context')
        self.assertEqual(len(pool),2);self.assertEqual({i['org'] for i in pool},{'A','B'})
