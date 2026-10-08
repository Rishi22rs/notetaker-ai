const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createInterviewSession, mergeTranscriptText } = require('./interview-session');

function fixture(options = {}) {
  const turns = [];
  const timers = new Map();
  let timerId = 0;
  let clock = 10_000;
  const session = createInterviewSession({
    onTurn: (turn) => turns.push(turn),
    now: () => clock,
    schedule(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    cancel(id) { timers.delete(id); },
    ...options
  });
  return {
    session, turns, timers,
    advance(ms) { clock += ms; },
    fire() { const pending = [...timers.values()].at(-1); timers.clear(); pending?.fn(); }
  };
}

test('merges overlapping recognition windows', () => {
  assert.equal(
    mergeTranscriptText('How would you scale this service', 'this service for ten million users?'),
    'How would you scale this service for ten million users?'
  );
});

test('finalizes a merged turn after a pause', () => {
  const f = fixture();
  f.session.ingest({ speaker: 'computer', text: 'Tell me about your', capturedAt: 1000 });
  f.session.ingest({ speaker: 'computer', text: 'about your recent project.', capturedAt: 3000 });
  assert.equal(f.turns.length, 0);
  f.fire();
  assert.equal(f.turns.length, 1);
  assert.equal(f.turns[0].text, 'Tell me about your recent project.');
  assert.equal(f.turns[0].reason, 'pause');
  assert.equal(f.turns[0].final, true);
});

test('speaker change finalizes the previous speaker immediately', () => {
  const f = fixture();
  f.session.ingest({ speaker: 'computer', text: 'What is a closure?', capturedAt: 1000 });
  f.session.ingest({ speaker: 'user', text: 'A closure is', capturedAt: 2000 });
  assert.equal(f.turns.length, 1);
  assert.equal(f.turns[0].speaker, 'computer');
  assert.equal(f.turns[0].reason, 'speaker-change');
  f.session.flush('stopped');
  assert.equal(f.turns[1].speaker, 'user');
});

test('question punctuation uses the shorter endpoint delay', () => {
  const f = fixture({ pauseMs: 1200, questionPauseMs: 650 });
  f.session.ingest({ speaker: 'computer', text: 'Why this role?', capturedAt: 1000 });
  assert.equal([...f.timers.values()][0].delay, 650);
});

test('a spoken question without Whisper punctuation waits for the longer turn boundary', () => {
  const f = fixture({ pauseMs: 1200, questionPauseMs: 5600 });
  f.session.ingest({ speaker: 'computer', text: 'How did you verify the result', capturedAt: 1000 });
  assert.equal([...f.timers.values()][0].delay, 5600);
});

test('default pause spans overlapping speech-recognition windows', () => {
  const f = fixture();
  f.session.ingest({ speaker: 'computer', text: 'Tell me about your project', capturedAt: 1000 });
  assert.equal([...f.timers.values()][0].delay, 2800);
});

test('clear drops an unfinished turn', () => {
  const f = fixture();
  f.session.ingest({ speaker: 'computer', text: 'unfinished', capturedAt: 1000 });
  f.session.clear();
  f.fire();
  assert.equal(f.turns.length, 0);
});
