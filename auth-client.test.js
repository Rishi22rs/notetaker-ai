const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthClient } = require('./auth-client');

test('live transcription authenticates with backend headers and forwards revisions without exposing provider keys', async t => {
  const { EventEmitter } = require('node:events');
  const fs = require('node:fs/promises'); const path = require('node:path'); const os = require('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-client-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'auth-session.json'), JSON.stringify({ token: 'app-token' }));
  let socket; const events = [], sent = [];
  const client = createAuthClient({ serverUrl: 'https://backend.example.com', userDataPath: dir, openExternal: async () => {},
    createSocket: (url, options) => {
      assert.equal(new URL(url).protocol, 'wss:'); assert.doesNotMatch(url, /app-token|lease/);
      assert.equal(options.headers.authorization, 'Bearer app-token'); assert.equal(options.headers['x-usage-token'], 'lease');
      socket = new EventEmitter(); socket.readyState = 1; socket.bufferedAmount = 0;
      socket.send = bytes => sent.push(bytes); socket.close = socket.terminate = () => { socket.readyState = 3; setImmediate(() => socket.emit('close')); };
      setImmediate(() => socket.emit('message', Buffer.from('{"type":"ready"}')));
      return socket;
    }
  });
  const controller = new AbortController();
  const stream = await client.openTranscriptionStream({ speaker: 'computer', usageToken: 'lease', signal: controller.signal, onEvent: event => events.push(event) });
  socket.emit('message', Buffer.from('{"type":"partial-transcript","speaker":"user","text":"What is"}'));
  socket.emit('message', Buffer.from('{"type":"transcript","text":"What is Redis?"}'));
  assert.equal(events.length, 2); assert.ok(events.every(event => event.speaker === 'computer'));
  stream.send(Buffer.alloc(8000)); assert.equal(sent[0].length, 8000);
  controller.abort();
  assert.ok(sent.some(value => typeof value === 'string' && JSON.parse(value).type === 'stop'));
  socket.emit('message', Buffer.from('{"type":"transcript","text":"stale"}'));
  assert.equal(events.length, 2);
});

test('backend-managed transcription forwards audio and usage auth without a provider credential', async t => {
  const fs = require('node:fs/promises'); const path = require('node:path'); const os = require('node:os');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'transcription-client-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'auth-session.json'), JSON.stringify({ token: 'app-session' }));
  const client = createAuthClient({ serverUrl: 'https://backend.example.com', userDataPath: directory, openExternal: async () => {} });
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://backend.example.com/ai/transcribe');
    assert.equal(options.headers.authorization, 'Bearer app-session');
    assert.equal(options.headers['x-usage-token'], 'lease');
    assert.equal(options.signal, signal);
    const body = JSON.parse(options.body);
    assert.equal(body.audio, Buffer.from('wav bytes').toString('base64')); assert.equal(body.language, 'hi');
    assert.equal(body.model, 'whisper-large-v3-turbo');
    return Response.json({ text: 'Transcript' });
  });
  const form = new FormData(); form.set('file', new Blob(['wav bytes']), 'audio.wav');
  form.set('model', 'whisper-large-v3-turbo'); form.set('language', 'hi');
  const response = await client.providerFetch('/ai/transcribe', { transcription: true, body: form, usageToken: 'lease', signal });
  assert.equal((await response.json()).text, 'Transcript');
});

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
