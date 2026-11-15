const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { WebSocket } = require('ws');
const { attachStreamingTranscription } = require('./streaming-transcription');

async function harness(t) {
 const server = http.createServer(); const upstreams = [], clients = [];
 let permitted = true;
 const streaming = attachStreamingTranscription({ server,
   config: { publicUrl: 'http://localhost', transcriptionProvider: 'assemblyai', assemblyaiApiKey: 'private-key' },
   authenticate: async request => request.headers.authorization === 'Bearer session' ? { _id: 'u' } : null,
   authorize: async (_user, token) => { if (!permitted || token !== 'lease') throw Object.assign(new Error('Session expired'), { status: 403 }); },
   authorizationIntervalMs: 20,
   createSocket(url, options) {
     const upstream = new EventEmitter(); upstream.readyState = 1; upstream.bufferedAmount = 0; upstream.sent = [];
     upstream.send = value => upstream.sent.push(value);
     upstream.close = upstream.terminate = () => { upstream.readyState = 3; upstream.emit('close'); };
     upstream.url = url; upstream.options = options; upstreams.push(upstream);
     setImmediate(() => { upstream.emit('open'); upstream.emit('message', Buffer.from('{"type":"Begin"}')); });
     return upstream;
   }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 t.after(async () => { streaming.close(); for (const client of clients) client.terminate(); await new Promise(resolve => server.close(resolve)); });
 function connect(speaker = 'computer', headers = { authorization: 'Bearer session', 'x-usage-token': 'lease' }) {
   const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/ai/transcribe/stream?speaker=${speaker}`, { headers });
   client.messages = [];
   client.on('message', bytes => client.messages.push(JSON.parse(bytes.toString())));
   client.on('error', () => {}); clients.push(client); return client;
 }
 return { connect, upstreams, expire: () => { permitted = false; } };
}
function message(client, type) {
 const existing = client.messages.find(event => event.type === type);
 if (existing) return Promise.resolve(existing);
 return new Promise((resolve, reject) => {
   const timer = setTimeout(() => { client.removeListener('message', check); reject(new Error(`Missing ${type}`)); }, 2000);
   function check(bytes) { const event = JSON.parse(bytes.toString()); if (event.type === type) { clearTimeout(timer); client.removeListener('message', check); resolve(event); } }
   client.on('message', check);
 });
}
function rejected(client) {
 return new Promise(resolve => client.on('unexpected-response', (_request, response) => { response.resume(); client.terminate(); resolve(response.statusCode); }));
}

test('paid WebSocket streams short PCM frames and partial revisions; final turns emit once', async t => {
 const h = await harness(t); const client = h.connect(); await message(client, 'ready');
 const upstream = h.upstreams[0]; const url = new URL(upstream.url);
 assert.equal(url.searchParams.get('speech_model'), 'universal-streaming-english');
 assert.equal(url.searchParams.get('min_turn_silence'), '250');
 assert.equal(upstream.options.headers.Authorization, 'private-key');
 client.send(Buffer.alloc(8000));
 await new Promise(resolve => setTimeout(resolve, 10));
 assert.ok(upstream.sent.some(Buffer.isBuffer));
 for (const [text, final] of [['What is', false], ['What is Redis?', false], ['What is Redis?', true], ['What is Redis?', true]]) {
   upstream.emit('message', Buffer.from(JSON.stringify({ type: 'Turn', turn_order: 0, transcript: text, end_of_turn: final })));
 }
 await message(client, 'transcript');
 assert.equal(client.messages.filter(event => event.type === 'partial-transcript').length, 2);
 assert.equal(client.messages.filter(event => event.type === 'transcript').length, 1);
 assert.ok(client.messages.every(event => event.speaker === 'computer'));
 assert.doesNotMatch(JSON.stringify(client.messages), /private-key/);
});

test('anonymous, unpaid and duplicate speaker streams are rejected before another provider connection', async t => {
 const h = await harness(t);
 assert.equal(await rejected(h.connect('computer', {})), 401);
 assert.equal(await rejected(h.connect('computer', { authorization: 'Bearer session' })), 403);
 const first = h.connect(); await message(first, 'ready');
 assert.equal(await rejected(h.connect()), 409); assert.equal(h.upstreams.length, 1);
 const mic = h.connect('user'); await message(mic, 'ready');
 assert.equal(h.upstreams.length, 2);
});

test('usage expiry terminates provider sessions and notifies the desktop', async t => {
 const h = await harness(t); const client = h.connect(); await message(client, 'ready');
 h.expire();
 const error = await message(client, 'error'); assert.match(error.text, /paid session has ended/);
 assert.equal(h.upstreams[0].readyState, 3);
 assert.ok(h.upstreams[0].sent.some(value => typeof value === 'string' && JSON.parse(value).type === 'Terminate'));
});

test('stop closes the provider and permits a fresh stream without leaking a reserved slot', async t => {
 const h = await harness(t); const first = h.connect(); await message(first, 'ready');
 const closed = new Promise(resolve => first.once('close', resolve)); first.send(JSON.stringify({ type: 'stop' })); await closed;
 assert.equal(h.upstreams[0].readyState, 3);
 const next = h.connect(); await message(next, 'ready'); assert.equal(h.upstreams.length, 2);
});
