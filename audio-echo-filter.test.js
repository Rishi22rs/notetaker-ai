const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAudioEchoFilter, isLikelyEcho, isLikelyAcousticEcho } = require('./audio-echo-filter');

test('recognizes near-duplicate speaker bleed but not a real candidate answer', () => {
  assert.equal(isLikelyEcho('Explain how a hash map handles collisions', 'Can you explain how a hash map handles collisions?'), true);
  assert.equal(isLikelyEcho('I would use separate chaining with linked lists', 'Can you explain how a hash map handles collisions?'), false);
});

test('suppresses delayed microphone echoes before they reach interview context', () => {
  const delivered = [];
  const timers = [];
  const filter = createAudioEchoFilter({
    onEvent: (event) => delivered.push(event),
    schedule: (callback) => { timers.push(callback); return callback; },
    cancel() {}
  });
  filter.push({ type: 'transcript', speaker: 'computer', text: 'Describe the difference between a process and a thread.' });
  filter.push({ type: 'transcript', speaker: 'user', text: 'Describe the difference between process and thread' });
  timers.shift()();
  assert.deepEqual(delivered.map((event) => event.speaker), ['computer']);
});

test('keeps distinct microphone answers', () => {
  const delivered = [];
  const timers = [];
  const filter = createAudioEchoFilter({
    onEvent: (event) => delivered.push(event),
    schedule: (callback) => { timers.push(callback); return callback; },
    cancel() {}
  });
  filter.push({ type: 'transcript', speaker: 'computer', text: 'What is dynamic programming?' });
  filter.push({ type: 'transcript', speaker: 'user', text: 'It stores overlapping subproblem results to avoid repeated work.' });
  timers.shift()();
  assert.deepEqual(delivered.map((event) => event.speaker), ['computer', 'user']);
});

test('suppresses short microphone fragments copied from recent system audio', () => {
  assert.equal(isLikelyEcho('dynamic programming', 'Give me code for shortest path using dynamic programming'), true);
  assert.equal(isLikelyEcho('programming', 'Give me code for shortest path using dynamic programming'), true);
  assert.equal(isLikelyEcho('yes', 'Would you say yes or no?'), false);
});

test('matches microphone bleed spanning multiple computer transcript events', () => {
  const delivered = [];
  const timers = [];
  const filter = createAudioEchoFilter({
    onEvent: (event) => delivered.push(event),
    schedule: (callback) => { timers.push(callback); return callback; },
    cancel() {}
  });
  filter.push({ type: 'transcript', speaker: 'computer', text: 'Explain the shortest path' });
  filter.push({ type: 'transcript', speaker: 'computer', text: 'using dynamic programming' });
  filter.push({ type: 'transcript', speaker: 'user', text: 'shortest path using dynamic' });
  timers.shift()();
  assert.deepEqual(delivered.map((event) => event.speaker), ['computer', 'computer']);
});

test('detects correlated raw speaker bleed before transcription', () => {
  const system = new Float32Array(48_000);
  const microphoneEcho = new Float32Array(48_000);
  const realAnswer = new Float32Array(48_000);
  for (let index = 0; index < system.length; index += 1) {
    const speechShape = 0.15 + 0.12 * Math.sin(index / 1700) + (Math.floor(index / 2400) % 3) * 0.06;
    system[index] = Math.sin(index / 8) * speechShape;
    microphoneEcho[index] = system[index] * 0.28 + Math.sin(index / 31) * 0.004;
    realAnswer[index] = Math.sin(index / 11) * (0.12 + 0.1 * Math.sin(index / 913));
  }
  assert.equal(isLikelyAcousticEcho(microphoneEcho, system), true);
  assert.equal(isLikelyAcousticEcho(realAnswer, system), false);
});
