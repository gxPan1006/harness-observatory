import json, re, unittest
from pathlib import Path
from urllib.parse import urlsplit

class ContentIntegrity(unittest.TestCase):
    def test_bootstrap_provenance_and_references(self):
        data=json.loads(Path('data/bootstrap.json').read_text());items=data['items'];ids={i['id'] for i in items};themes={t['id'] for t in data['themes']}
        self.assertEqual(len(ids),len(items));self.assertGreaterEqual(len(items),20)
        self.assertTrue({'DeepSeek','OpenAI','Anthropic'}.issubset({i['org'] for i in items}))
        self.assertTrue({'paper','article','code','release'}.issubset({i['kind'] for i in items}))
        for item in items:
            self.assertEqual(urlsplit(item['url']).scheme,'https')
            self.assertTrue(item['evidence']);self.assertTrue(set(item['themes']).issubset(themes))
            self.assertNotIn('text',item);self.assertNotIn('excerpt',item)
            if item['published']:self.assertRegex(item['published'],r'^\d{4}-\d{2}-\d{2}$')
        for digest in data['digests']:self.assertTrue(set(digest['items']).issubset(ids))
        self.assertFalse(re.search(r'sk-[a-zA-Z0-9]{16,}',json.dumps(data)))

class SynthesisIntegrity(unittest.TestCase):
    def test_live_snapshot_cross_source_citations(self):
        from collector.update import validate_direction
        data=json.loads((Path(__file__).resolve().parents[1]/'data/bootstrap.json').read_text())
        for value in data.get('directions',{}).values():
            validate_direction(value,data['items'])
