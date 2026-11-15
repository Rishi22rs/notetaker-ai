const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDiagnostics, redact } = require('./reactotron-config');

test('startup connects the real Reactotron client through the Node WebSocket transport', async t => {
  let socket;
  t.mock.method(globalThis, 'WebSocket', function (url) {
    assert.equal(url, 'ws://127.0.0.1:9090');
    socket = { sent: [], close() {}, send(message) { this.sent.push(JSON.parse(message)); } };
    return socket;
  });
  const diagnostics = require('./reactotron-config').startReactotron();
  try {
    socket.onopen();
    await new Promise(resolve => setImmediate(resolve));
    diagnostics.log('info', 'transport connected');
    assert.ok(socket.sent.some(event => event.type === 'client.intro'));
    assert.ok(socket.sent.some(event => event.type === 'log'));
  } finally { diagnostics.close(); }
});

function setup(fetch) {
  const events = [];
  const target = { fetch };
  const logger = Object.fromEntries(['log', 'info', 'debug', 'warn', 'error'].map(key => [key, () => {}]));
  const client = { apiResponse: (...args) => events.push(args), log: message => events.push(message), warn: message => events.push(message), error: message => events.push(message), close() {} };
  return { target, logger, client, events, diagnostics: installDiagnostics({ target, logger, client }) };
}

test('records failed HTTP responses without consuming streams or exposing credentials', async () => {
  const response = new Response('private streamed content', { status: 500 });
  const s = setup(async () => response);
  const result = await s.target.fetch('https://api.example.com/session-history/private-id?token=private-token', {
    method: 'POST', headers: { authorization: 'Bearer private-token' }, body: 'private resume'
  });
  assert.equal(result, response);
  assert.equal(response.bodyUsed, false);
  assert.equal(await result.text(), 'private streamed content');
  assert.equal(s.events[0][0].url, 'https://api.example.com/session-history/[id]');
  assert.equal(s.events[0][1].status, 500);
  assert.doesNotMatch(JSON.stringify(s.events), /private/);
  s.diagnostics.close();
});

test('preserves fetch errors and console output even if the debugger fails', async () => {
  const failure = new Error('Connection failed');
  const originalFetch = async () => { throw failure; };
  const s = setup(originalFetch);
  await assert.rejects(s.target.fetch('https://api.example.com/health'), error => error === failure);
  assert.equal(s.events[0][1].status, 0);
  s.client.log = () => { throw new Error('Debugger disconnected'); };
  assert.doesNotThrow(() => s.logger.log('hello'));
  s.diagnostics.close();
  assert.equal(s.target.fetch, originalFetch);
});

test('redacts common credential strings and omits arbitrary log objects', () => {
  assert.doesNotMatch(redact('Bearer abc password=xyz mongodb+srv://user:pass@cluster/db token=123'), /abc|xyz|user:pass|123/);
  const s = setup(async () => {});
  s.logger.error(new Error('token=private-token'), { resume: 'private resume' });
  assert.doesNotMatch(JSON.stringify(s.events), /private/);
  s.diagnostics.close();
});
