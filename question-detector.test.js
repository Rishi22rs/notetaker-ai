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
  assert.equal(inferType('Explain HTTP request handling'), 'technical');
});
