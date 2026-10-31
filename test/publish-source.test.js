import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFiles } from '../tools/verify-npm-source.mjs';

function fixture(t, scripts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'shorekeeper-publish-'));
  // Only remove the unique fixture directory returned by mkdtempSync.
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true });
  git('init', '-q');
  git('config', 'user.name', 'Publish test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'true');
  writeFileSync(join(root, '.gitattributes'), '* text=auto eol=lf\n');
  writeFileSync(join(root, '.gitignore'), '*.ignored\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-fixture', version: '1.0.0', scripts }) + '\n');
  writeFileSync(join(root, 'index.js'), 'export default 1;\n');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  return { root, git, files: [{ path: 'package.json' }, { path: 'index.js' }] };
}

test('release verifier accepts exact committed package bytes', t => {
  const { root, git, files } = fixture(t);
  assert.deepEqual(verifyFiles(root, files), {
    gitHead: git('rev-parse', 'HEAD').toString().trim(), files: 2, version: '1.0.0',
  });
});

test('release verifier rejects CRLF even when Git considers the tree clean', t => {
  const { root, git, files } = fixture(t);
  writeFileSync(join(root, 'index.js'), 'export default 1;\r\n');
  // Adding the normalized content refreshes the index without changing its blob.
  git('add', 'index.js');
  assert.equal(git('status', '--porcelain').toString(), '');
  assert.throws(() => verifyFiles(root, files), /bytes differ.*index\.js/);
});

test('release verifier rejects uncommitted version or source changes', t => {
  const { root, files } = fixture(t);
  writeFileSync(join(root, 'index.js'), 'export default 2;\n');
  assert.throws(() => verifyFiles(root, files), /must be clean/);
});

test('release verifier rejects files absent from the commit even if ignored by Git', t => {
  const { root, files } = fixture(t);
  writeFileSync(join(root, 'extra.ignored'), 'unexpected payload');
  assert.throws(() => verifyFiles(root, [...files, { path: 'extra.ignored' }]), /absent from the release commit/);
});

test('release verifier rejects pack hooks that could change verified files', t => {
  const { root, files } = fixture(t, { prepare: 'node build.js' });
  assert.throws(() => verifyFiles(root, files), /Remove prepare/);
});

test('release verifier rejects a manually pinned stale gitHead', t => {
  const { root, git, files } = fixture(t);
  writeFileSync(join(root, 'package.json'), '{"name":"test-fixture","version":"1.0.0","gitHead":"old"}\n');
  git('add', 'package.json');
  git('commit', '-qm', 'stale metadata');
  assert.throws(() => verifyFiles(root, files), /Do not hard-code gitHead/);
});
