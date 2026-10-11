const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createTranscriptionQueue } = require('./transcription-audio');
const tick = () => new Promise(resolve => setImmediate(resolve));
const speech = (seconds, value = 0.05) => Buffer.from(new Float32Array(16000 * seconds).fill(value).buffer);

test('silence is rejected before it enters the inference queue', async () => {
  let calls = 0;
  const queue = createTranscriptionQueue({ processAudio: () => { calls++; } });
  queue.enqueue('computer', speech(2, 0));
  queue.enqueue('user', speech(2, 0.001));
  await tick();
  assert.equal(calls, 0);
});

test('waiting speech is merged without duplicating the shared audio overlap', async () => {
  const calls = [];
  let release;
  const queue = createTranscriptionQueue({ processAudio: (_speaker, bytes) => {
    calls.push(bytes);
    if (calls.length === 1) return new Promise(resolve => { release = resolve; });
  } });
  queue.enqueue('computer', speech(2));
  queue.enqueue('computer', speech(2, 0.06));
  queue.enqueue('computer', Buffer.concat([speech(0.5, 0.06), speech(1.5, 0.08)]));
  assert.equal(calls.length, 1);
  release();
  await tick();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], Buffer.concat([speech(2, 0.06), speech(1.5, 0.08)]));
});

test('each speaker retains their own speech when the decoder is busy', async () => {
  const calls = [];
  let release;
  const queue = createTranscriptionQueue({ processAudio: (speaker, bytes) => {
    calls.push({ speaker, bytes });
    if (calls.length === 1) return new Promise(resolve => { release = resolve; });
  } });
  queue.enqueue('computer', speech(2));
  queue.enqueue('user', speech(2, 0.06));
  queue.enqueue('computer', speech(2, 0.07));
  release();
  await tick();
  assert.deepEqual(calls.map(item => item.speaker), ['computer', 'user', 'computer']);
  assert.deepEqual(calls[1].bytes, speech(2, 0.06));
  assert.deepEqual(calls[2].bytes, speech(2, 0.07));
});

test('overload is bounded and reported rather than silently accumulating old captions', async () => {
  const calls = [];
  let release, warnings = 0;
  const queue = createTranscriptionQueue({ maxQueuedSeconds: 4, onLag: () => { warnings++; }, processAudio: (_speaker, bytes, capturedAt) => {
    calls.push({ bytes, capturedAt });
    if (calls.length === 1) return new Promise(resolve => { release = resolve; });
  } });
  queue.enqueue('computer', speech(2), 1);
  queue.enqueue('computer', speech(6, 0.06), 2);
  queue.enqueue('computer', speech(2, 0.07), 3);
  assert.equal(warnings, 1);
  release();
  await tick();
  assert.equal(calls[1].bytes.length, speech(4).length);
  assert.equal(calls[1].capturedAt, 3);
});

test('a stopped session cannot drain or unblock the new session queue', async () => {
  const releases = [], calls = [];
  const queue = createTranscriptionQueue({ processAudio: (_speaker, _bytes, capturedAt) => {
    calls.push(capturedAt);
    return new Promise(resolve => releases.push(resolve));
  } });
  queue.enqueue('computer', speech(2), 1);
  queue.enqueue('computer', speech(2), 2);
  queue.clear();
  queue.enqueue('computer', speech(2), 3);
  queue.enqueue('computer', speech(2), 4);
  releases[0]();
  await tick();
  assert.deepEqual(calls, [1, 3]);
  releases[1]();
  await tick();
  assert.deepEqual(calls, [1, 3, 4]);
  releases[2]();
});

function metalHarness() {
  const launches = [], requests = [], events = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./transcription-metal'), 'utf8'), {
    module, __dirname, process, Buffer, Float32Array, FormData, Blob, AbortSignal, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return { app: { isPackaged: false } };
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:net') return { createServer() {
        const socket = new EventEmitter();
        socket.listen = (_port, _host, callback) => callback();
        socket.address = () => ({ port: 12345 });
        socket.close = callback => callback();
        return socket;
      } };
      if (name === 'node:child_process') return { spawn(_path, args) {
        launches.push(args);
        const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
        return child;
      } };
      return require(name);
    },
    async fetch(url, options) {
      if (!url.endsWith('/inference')) return { ok: true };
      requests.push(Object.fromEntries(options.body.entries()));
      return { ok: true, json: async () => ({ segments: [{ text: 'How does database caching work?', avg_logprob: -0.3, no_speech_prob: 0.1 }] }) };
    }
  });
  return { engine: module.exports(event => events.push(event)), launches, requests, events };
}

test('native transcription uses tiny.en and one English decode, with no detection pass', async () => {
  const harness = metalHarness();
  await harness.engine.start();
  harness.engine.audio('computer', speech(2));
  await tick();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].language, 'en');
  assert.equal(harness.requests[0].translate, 'false');
  assert.equal(harness.requests[0].no_language_probabilities, 'true');
  assert.equal(harness.requests[0].temperature_inc, '0.0');
  assert.ok(harness.launches[0].some(value => value.endsWith('ggml-tiny.en.bin')));
  assert.equal(harness.launches[0][harness.launches[0].indexOf('-bo') + 1], '1');
  assert.ok(harness.events.some(event => event.type === 'transcript'));
  harness.engine.stop();
});

test('restarting listening allows the same question to be transcribed again', async () => {
  const harness = metalHarness();
  for (let i = 0; i < 2; i++) {
    await harness.engine.start();
    harness.engine.audio('computer', speech(2));
    await tick();
    harness.engine.stop();
  }
  assert.equal(harness.events.filter(event => event.type === 'transcript').length, 2);
});

test('Python worker only receives the next packet after completing the previous one', async () => {
  const writes = [], launches = [];
  const lines = new EventEmitter(); lines.close = () => {};
  let worker;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./transcription'), 'utf8'), {
    module, __dirname, process, Buffer, global: { process },
    require(name) {
      if (name === 'electron') return { app: { isPackaged: false } };
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:readline') return { createInterface: () => lines };
      if (name === 'node:child_process') return { spawn(path, args, options) {
        launches.push({ path, args, options });
        worker = new EventEmitter(); worker.stderr = new EventEmitter(); worker.stdout = {};
        worker.stdin = new EventEmitter(); worker.stdin.writable = true;
        worker.stdin.write = text => { writes.push(JSON.parse(text)); return true; };
        worker.kill = () => {};
        return worker;
      } };
      return require(name);
    }
  });
  const engine = module.exports(() => {});
  engine.start();
  engine.audio('computer', speech(2));
  engine.audio('user', speech(2, 0.06));
  assert.equal(writes.length, 1);
  assert.ok(launches[0].path.endsWith('python'));
  assert.ok(launches[0].options.env.TRANSCRIPTION_MODEL_DIR.endsWith('tiny.en'));
  lines.emit('line', '{"type":"processed"}');
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].speaker, 'user');
  engine.stop();
  lines.emit('line', '{"type":"processed"}');
  await tick();
  assert.equal(writes.length, 2);
});
