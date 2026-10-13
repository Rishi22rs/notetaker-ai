const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthClient } = require('./auth-client');

test('Google login reports an unavailable server before opening a browser', async () => {
  let opened = false;
  const client = createAuthClient({
    serverUrl: 'http://127.0.0.1:1',
    userDataPath: '/tmp',
    openExternal: async () => { opened = true; }
  });
  await assert.rejects(client.login(), /Sign-in server is unavailable/);
  assert.equal(opened, false);
});

test('resume session creation rejects an outdated backend before submitting metadata', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const client = createAuthClient({ serverUrl: 'http://localhost:8787', userDataPath: '/tmp', openExternal: async () => {} });
  await assert.rejects(client.createRecordedSession({ company: 'Example', resume: { originalBase64: 'cGRm' } }), /backend is running an older version/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('/health'));
});

test('compatible backend receives original resume bytes on session creation', async t => {
  const fs = require('node:fs/promises'); const path = require('node:path'); const os = require('node:os');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-client-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'auth-session.json'), JSON.stringify({ token: 'test-token' }));
  let submitted;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('/health')) return { ok: true, json: async () => ({ ok: true, originalResumeStorage: true }) };
    submitted = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: 'test-session', resumeStored: true }) };
  });
  const client = createAuthClient({ serverUrl: 'http://localhost:8787', userDataPath: directory, openExternal: async () => {} });
  const result = await client.createRecordedSession({ company: 'Example', resume: { content: 'Parsed text', originalBase64: 'cGRm' } });
  assert.equal(submitted.resume.originalBase64, 'cGRm'); assert.equal(result.resumeStored, true);
});
