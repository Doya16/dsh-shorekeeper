import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { EntryPreferences } from '../lib/entry-preferences.js';
import { createHandler } from '../lib/index.js';

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'shorekeeper-entry-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, prefs: new EntryPreferences(base) };
}

test('deployment entry stays visible until the installed pet first runs', async t => {
  const { prefs } = await fixture(t);
  assert.equal((await prefs.status(false, false)).entryHidden, false);
  assert.equal((await prefs.status(true, false)).entryHidden, false);
  assert.equal((await prefs.status(true, true)).entryHidden, true);
});

test('auto-hide survives closing the pet and restarting Harness', async t => {
  const { prefs, base } = await fixture(t);
  await prefs.status(true, true);
  assert.equal((await prefs.status(true, false)).entryHidden, true);
  assert.equal((await new EntryPreferences(base).status(true, false)).entryHidden, true);
});

test('settings restoration persists and does not immediately auto-hide again', async t => {
  const { prefs, base } = await fixture(t);
  await prefs.status(true, true);
  await prefs.setHidden(false);
  assert.equal((await prefs.status(true, true)).entryHidden, false);
  assert.equal((await new EntryPreferences(base).status(true, true)).entryHidden, false);
  await prefs.setHidden(true);
  assert.equal((await prefs.status(true, true)).entryHidden, true);
});

test('missing runtime makes deployment accessible even after a saved hide', async t => {
  const { prefs } = await fixture(t);
  await prefs.setHidden(true);
  assert.equal((await prefs.status(false, false)).entryHidden, false);
});

test('queued automatic and manual changes preserve the last user choice', async t => {
  const { prefs, base } = await fixture(t);
  await Promise.all([prefs.status(true, true), prefs.setHidden(false)]);
  assert.equal((await prefs.status(true, true)).entryHidden, false);
  const stored = JSON.parse(await readFile(join(base, 'entry-preferences.json'), 'utf8'));
  assert.deepEqual(stored, { mode: 'shown', deployed: true });
});

test('failed preference writes do not accept the change or poison later writes', async t => {
  const { prefs, base } = await fixture(t);
  await prefs.status(true, false);
  const file = join(base, 'entry-preferences.json');
  await mkdir(file);
  await assert.rejects(prefs.setHidden(true));
  assert.equal((await prefs.status(true, false)).entryHidden, false);
  await rm(file, { recursive: true });
  await prefs.setHidden(true);
  assert.equal((await prefs.status(true, false)).entryHidden, true);
  await assert.rejects(prefs.setHidden('false'));
});

test('entry controls require authentication, same-origin token and an installed runtime', async t => {
  const { prefs } = await fixture(t);
  let installed = false;
  const manager = { status: async () => ({ installed, running: false }) };
  const handler = createHandler(manager, { requestRejection: req => req.headers.cookie === 'session=ok' ? undefined : 403 }, 'nonce', Buffer.from('icon'), prefs);
  const server = createServer((req, res) => handler(req, res).catch(() => { res.writeHead(500).end(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}/shorekeeper-full`;
  const post = (action, headers = {}) => fetch(url + '/action', { method: 'POST', headers: { cookie: 'session=ok', 'x-shorekeeper-token': 'nonce', ...headers }, body: JSON.stringify({ action }) });
  assert.equal((await post('hide_entry', { cookie: '' })).status, 403);
  assert.equal((await post('hide_entry', { origin: 'https://example.org' })).status, 403);
  assert.equal((await post('show_entry', { 'x-shorekeeper-token': 'wrong' })).status, 403);
  assert.equal((await post('hide_entry')).status, 400);
  installed = true;
  assert.equal((await post('hide_entry')).status, 200);
  let status = await (await fetch(url + '/status', { headers: { cookie: 'session=ok' } })).json();
  assert.equal(status.entryHidden, true);
  assert.equal((await post('show_entry')).status, 200);
  status = await (await fetch(url + '/status', { headers: { cookie: 'session=ok' } })).json();
  assert.equal(status.entryHidden, false);
});
