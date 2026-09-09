import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from collector import update as u


class WatchTests(unittest.TestCase):
    def test_unrelated_commits_do_not_create_new_mechanism_items(self):
        cfg = dict(id='context-watch', name='Context', repo='org/repo', org='Org',
                   themes=['context'], paths=['compact.rs', 'gating.rs'])
        def fetch(sha, changed=False):
            def get(url, **kwargs):
                if '/commits/' in url: return Mock(json=lambda: {'sha': sha})
                return Mock(text=('changed' if changed else 'original') + url.rsplit('/', 1)[-1])
            with patch.object(u, 'get', side_effect=get): return u.watch_fetch(cfg)[0][0]
        first = fetch('a' * 40)
        second = fetch('b' * 40)
        self.assertEqual(first['id'], second['id'])
        self.assertNotEqual(first['id'], fetch('c' * 40, True)['id'])
        self.assertIsNone(first['published'])  # Observation is not a release date.
        self.assertTrue(all('/' + 'a' * 40 + '/' in e['url'] for e in first['evidence']))

    def test_missing_or_oversized_evidence_fails_visibly(self):
        cfg = dict(id='watch', name='Watch', repo='org/repo', org='Org', themes=['context'], paths=['a'])
        with patch.object(u, 'get', side_effect=[Mock(json=lambda: {'sha': 'a'*40}), Mock(text='x'*22000)]):
            with self.assertRaises(ValueError): u.watch_fetch(cfg)

    def test_mechanism_survives_newer_general_repo_release(self):
        items = [dict(id='mechanism', mechanism='context-watch', repo='org/repo', org='Org', themes=['context'], published=None, addedAt='2026-09-09'),
                 dict(id='release', repo='org/repo', org='Org', themes=['context'], published='2026-09-10', addedAt='2026-09-10')]
        self.assertEqual({i['id'] for i in u.direction_pool(items, 'context')}, {'mechanism', 'release'})
