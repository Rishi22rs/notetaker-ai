const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStreamingTranscription, pcm16 } = require('./streaming-transcription');
const tick = () => new Promise(resolve => setImmediate(resolve));
const audio = seconds => Buffer.from(new Float32Array(16000 * seconds).fill(0.1).buffer);

test('system stream starts first and microphone startup cannot delay system audio', async () => {
  const calls = [], sent = [], closed = [];
  let openMic;
  const client = createStreamingTranscription(() => {}, { getSettings: () => ({ language: 'auto' }), openStream: async options => {
    calls.push(options.speaker);
    if (options.speaker === 'user') await new Promise(resolve => { openMic = resolve; });
    return { send: bytes => sent.push({ speaker: options.speaker, bytes }), close: () => closed.push(options.speaker) };
  } });
  const start = client.start({ system: true, microphone: true });
  await tick();
  assert.deepEqual(calls, ['computer', 'user']);
  client.audio('computer', audio(0.25));
  assert.equal(sent.length, 1); assert.equal(sent[0].speaker, 'computer');
  assert.equal(sent[0].bytes.length, 8000); assert.deepEqual(sent[0].bytes, pcm16(audio(.25)));
  openMic(); await start;
  client.stop(); assert.deepEqual(closed.sort(), ['computer', 'user']);
});

test('a failed microphone connection preserves system streaming and warns once', async () => {
  const events = [], sent = [];
  const client = createStreamingTranscription(event => events.push(event), { getSettings: () => ({ language: 'en' }), openStream: async options => {
    if (options.speaker === 'user') throw new Error('Unavailable');
    return { send: bytes => sent.push(bytes), close() {} };
  } });
  await client.start({ system: true, microphone: true });
  client.audio('computer', audio(.25)); assert.equal(sent.length, 1);
  assert.equal(events.filter(event => event.type === 'warning').length, 1);
  client.stop();
});

test('stopping during connection setup closes late connections and suppresses stale partials', async () => {
  let release, options, closed = false;
  const events = [];
  const client = createStreamingTranscription(event => events.push(event), { getSettings: () => ({}), openStream: value => {
    options = value; return new Promise(resolve => { release = resolve; });
  } });
  const start = client.start({ system: true, microphone: false });
  client.stop();
  assert.equal(options.signal.aborted, true);
  release({ close() { closed = true; } }); await start;
  options.onEvent({ type: 'partial-transcript', text: 'stale' });
  assert.equal(closed, true); assert.ok(!events.some(event => event.text === 'stale'));
});

test('unsupported language is rejected before opening an English-only stream', async () => {
  let called = false;
  const client = createStreamingTranscription(() => {}, { getSettings: () => ({ language: 'hi' }), openStream: async () => { called = true; } });
  await assert.rejects(client.start(), /supports English/); assert.equal(called, false);
});
