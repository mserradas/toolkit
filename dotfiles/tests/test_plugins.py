import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DOTFILES = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('portable', DOTFILES / 'herdr/portable-config.py')
portable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portable)


class PluginTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / 'home with spaces'
        self.home.mkdir()
        self.repo = self.root / 'repo'
        shutil.copytree(DOTFILES, self.repo / 'dotfiles', ignore=shutil.ignore_patterns('__pycache__'))
        self.scripts = self.repo / 'dotfiles'
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = dict(os.environ, HOME=str(self.home), PATH=f'{self.bin}:{os.environ["PATH"]}', FIXTURE=str(self.root))
        self.state = self.root / 'state.json'
        self.state.write_text('[]')
        definitions = []
        for line in (self.scripts / 'herdr/plugins.list').read_text().splitlines():
            if not line or line.startswith('#'):
                continue
            plugin_id, repo, version, commit = line.split()
            owner, name = repo.split('/')
            definitions.append(dict(plugin_id=plugin_id, version=version, enabled=True,
                plugin_root=str(self.root / plugin_id),
                source=dict(owner=owner, repo=name, resolved_commit=commit)))
        (self.root / 'definitions.json').write_text(json.dumps(definitions))
        font = self.root / 'hhdebb.herdr-radar/dist/HerdrAgentIconsMax-Regular.ttf'
        font.parent.mkdir(parents=True)
        font.write_bytes(b'fixture font')
        for name, body in {
            'go': '#!/bin/sh\nexit 0\n',
            'brew': '#!/bin/sh\necho "unexpected brew invocation" >&2\nexit 1\n',
            'herdr': '''#!/usr/bin/env python3
import hashlib, json, os, sys
from pathlib import Path
root = Path(os.environ['FIXTURE'])
state = root / 'state.json'
plugins = json.loads(state.read_text())
args = sys.argv[1:]
if args[:2] == ['plugin', 'list']:
    print(json.dumps({'result': {'plugins': plugins}}))
elif args[:2] == ['plugin', 'install']:
    definitions = json.loads((root / 'definitions.json').read_text())
    plugin = next(p for p in definitions if p['source']['owner']+'/'+p['source']['repo'] == args[2])
    assert args[args.index('--ref')+1] == plugin['source']['resolved_commit']
    plugins = [p for p in plugins if p['plugin_id'] != plugin['plugin_id']] + [plugin]
    state.write_text(json.dumps(plugins))
    with (root / 'mutations').open('a') as out: out.write('install '+plugin['plugin_id']+'\\n')
elif args[:2] == ['plugin', 'enable']:
    next(p for p in plugins if p['plugin_id'] == args[2])['enabled'] = True
    state.write_text(json.dumps(plugins))
elif args[:4] == ['plugin', 'action', 'invoke', 'install-font']:
    source = root / 'hhdebb.herdr-radar/dist/HerdrAgentIconsMax-Regular.ttf'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:8]
    target = Path.home() / 'Library/Fonts' / f'HerdrAgentIconsMax-{digest}.ttf'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    with (root / 'mutations').open('a') as out: out.write('font\\n')
else:
    sys.exit('unexpected herdr command: '+str(args))
''',
        }.items():
            p = self.bin / name
            p.write_text(body)
            p.chmod(0o755)

    def run_script(self, script, *args):
        return subprocess.run(['bash', str(self.scripts / script), *args], env=self.env,
            cwd=self.repo, capture_output=True, text=True)

    def install(self):
        result = self.run_script('herdr/install-plugins.sh')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_install_pins_preferences_and_idempotency(self):
        self.install()
        self.install()
        calls = (self.root / 'mutations').read_text().splitlines()
        self.assertEqual(sum(x.startswith('install ') for x in calls), 2)
        self.assertEqual((self.home / 'Library/Application Support/herdr-auto-title/config.env').read_bytes(),
            (self.scripts / 'herdr/auto-title.env').read_bytes())
        self.assertFalse(list(self.home.rglob('*.backup.*')))
        before = (self.root / 'mutations').read_bytes()
        result = self.run_script('herdr/install-plugins.sh', '--check')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.root / 'mutations').read_bytes(), before)

    def test_check_detects_commit_drift_without_mutating(self):
        self.install()
        plugins = json.loads(self.state.read_text())
        plugins[0]['source']['resolved_commit'] = 'wrong'
        self.state.write_text(json.dumps(plugins))
        before = self.state.read_bytes()
        result = self.run_script('herdr/install-plugins.sh', '--check')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state.read_bytes(), before)

    def test_check_detects_preferences_and_install_backs_up(self):
        self.install()
        config = self.home / '.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml'
        config.write_text('group_gap = true\n')
        self.assertNotEqual(self.run_script('herdr/install-plugins.sh', '--check').returncode, 0)
        self.assertEqual(config.read_text(), 'group_gap = true\n')
        self.install()
        backups = list(config.parent.glob('config.toml.backup.*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'group_gap = true\n')

    def test_check_detects_missing_font(self):
        self.install()
        for font in (self.home / 'Library/Fonts').glob('*.ttf'):
            font.unlink()
        self.assertNotEqual(self.run_script('herdr/install-plugins.sh', '--check').returncode, 0)

    def test_apply_and_sync_all_preferences(self):
        self.assertEqual(self.run_script('sync.sh', '--apply').returncode, 0)
        radar = self.home / '.config/herdr/plugins/config/hhdebb.herdr-radar/config.toml'
        radar.write_text('group_gap = true\n')
        config = self.home / '.config/herdr/config.toml'
        config.write_text(config.read_text().replace('${XDG_STATE_HOME:-$HOME/.local/state}', str(self.home / '.local/state')))
        result = self.run_script('sync.sh', '--force')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.scripts / 'herdr/radar.toml').read_text(), 'group_gap = true\n')
        self.assertNotIn(str(self.home), (self.scripts / 'herdr/config.toml').read_text())
        self.assertEqual(self.run_script('sync.sh', '--apply').returncode, 0)
        self.assertTrue(list(radar.parent.glob('config.toml.backup.*')))
        self.assertTrue(list((self.home / 'Library/Application Support/herdr-auto-title').glob('config.env.backup.*')))

    def test_md_function_round_trip_and_backup(self):
        result = self.run_script('sync.sh', '--apply')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        source = self.scripts / 'fish/functions/md.fish'
        target = self.home / '.config/fish/functions/md.fish'
        self.assertEqual(source.read_bytes(), target.read_bytes())
        target.write_text(target.read_text() + '# local preference\n')
        result = self.run_script('sync.sh', '--force')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(source.read_bytes(), target.read_bytes())
        target.write_text('local sentinel')
        self.assertEqual(self.run_script('sync.sh', '--apply').returncode, 0)
        self.assertTrue(any(p.read_text() == 'local sentinel' for p in target.parent.glob('md.fish.backup.*')))

    def test_missing_md_function_aborts_before_any_apply(self):
        sentinel = self.home / '.config/ghostty/config'
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text('sentinel\n')
        (self.scripts / 'fish/functions/md.fish').unlink()
        self.assertNotEqual(self.run_script('sync.sh', '--apply').returncode, 0)
        self.assertEqual(sentinel.read_text(), 'sentinel\n')

    def test_missing_plugin_preference_aborts_before_any_apply(self):
        sentinel = self.home / '.config/ghostty/config'
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text('sentinel\n')
        (self.scripts / 'herdr/radar.toml').unlink()
        self.assertNotEqual(self.run_script('sync.sh', '--apply').returncode, 0)
        self.assertEqual(sentinel.read_text(), 'sentinel\n')

    def test_normalization_preserves_other_commands(self):
        original = '''command = 'cat "/Users/some one/.local/state/herdr/plugins/hhdebb.herdr-radar/tabbar.txt"'\nother = 'cat "/tmp/unrelated"'\n'''
        result = portable.normalize(original)
        self.assertIn('${XDG_STATE_HOME:-$HOME/.local/state}', result)
        self.assertIn('other = \'cat "/tmp/unrelated"\'', result)
        self.assertEqual(portable.normalize(result), result)


if __name__ == '__main__':
    unittest.main()
