const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectQuestion, inferType, ruleDecision } = require('./question-detector');

test('detects direct questions without calling the model', async () => {
  let calls = 0;
  const result = await detectQuestion({
    turn: { speaker: 'computer', text: 'How would you scale this API' },
    classify: async () => { calls += 1; }
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.source, 'rules');
  assert.equal(result.type, 'system_design');
  assert.equal(calls, 0);
});

test('detects interview commands as questions', () => {
  const result = ruleDecision('Walk me through your most recent project.');
  assert.equal(result.decision, true);
  assert.equal(result.type, 'resume');
});

test('detects imperative requests for code as coding questions', () => {
  const requests = [
    'Give me a code for shortest path using dynamic programming.',
    'Give me the implementation of binary search.',
    'Write a function to reverse a linked list.',
    'Write me a simple magic number code. for me in JavaScript.',
    'Can you please create some code for this in TypeScript?',
    'Show me the solution as a Python program.'
  ];
  for (const text of requests) {
    const result = ruleDecision(text);
    assert.equal(result.decision, true, text);
    assert.equal(result.type, 'coding', text);
    assert.match(result.reason, /^(coding-request|interview-command|question-mark)$/, text);
  }
});

test('exact transcribed magic number request triggers a coding answer without model classification', async () => {
  let calls = 0;
  const result = await detectQuestion({
    turn: { speaker: 'computer', text: 'Write me a simple magic number code. for me in JavaScript.' },
    classify: async () => { calls += 1; }
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.type, 'coding');
  assert.equal(result.reason, 'coding-request');
  assert.equal(calls, 0);
});

test('repairs fused code words and detects terse algorithm requests', async () => {
  const result = await detectQuestion({
    turn: { speaker: 'computer', text: 'Shorted Shortest Pathcode in Java Script' }
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.type, 'coding');
  assert.equal(result.reason, 'coding-request');
});

test('detects questions with conversational preambles without model latency', async () => {
  let calls = 0;
  const result = await detectQuestion({
    turn: { speaker: 'computer', text: 'Okay, so can you explain the tradeoff here' },
    classify: async () => { calls += 1; }
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.source, 'rules');
  assert.equal(calls, 0);
});

test('detects a question clause after a hypothetical preamble and noisy transcription', async () => {
  let calls = 0;
  const result = await detectQuestion({
    turn: {
      speaker: 'computer',
      text: 'Imagine if we hire you for the your you for the job. What is the first thing? you are planning to do in this role.'
    },
    classify: async () => { calls += 1; }
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.source, 'rules');
  assert.equal(result.reason, 'embedded-question');
  assert.equal(calls, 0);
});

test('ignores candidate speech and acknowledgements', async () => {
  assert.equal((await detectQuestion({ turn: { speaker: 'user', text: 'How does it work?' } })).isQuestion, false);
  assert.equal(ruleDecision('Okay.').decision, false);
});

test('uses the model only for ambiguous interviewer statements', async () => {
  const result = await detectQuestion({
    turn: { speaker: 'computer', text: "I'd like to hear more about the caching tradeoffs." },
    recentTurns: [{ speaker: 'user', text: 'We used Redis.' }],
    classify: async ({ recentTurns }) => ({
      isQuestion: recentTurns.length === 1,
      confidence: 0.88,
      type: 'technical',
      reason: 'Implicit request for elaboration'
    })
  });
  assert.equal(result.isQuestion, true);
  assert.equal(result.source, 'model');
  assert.equal(result.confidence, 0.88);
});

test('categorizes common interview question types', () => {
  assert.equal(inferType('Tell me about a time you resolved conflict'), 'behavioral');
  assert.equal(inferType('Implement a graph traversal'), 'coding');
  assert.equal(inferType('Can you write a function in Python to reverse a string?'), 'coding');
  assert.equal(inferType('Explain HTTP request handling'), 'technical');
});
