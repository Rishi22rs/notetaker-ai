const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildInterviewAnswerMessages } = require('./interview-answer-prompt');

test('builds a bounded structured interview prompt', () => {
  const messages = buildInterviewAnswerMessages({
    question: 'How did you improve API latency?',
    type: 'behavioral',
    retrievedContext: {
      profile: 'Backend engineer seeking concise answers.',
      chunks: [{ source: 'resume.txt', text: 'Reduced p95 latency by 40% using Redis.' }],
      recentTurns: [{ speaker: 'computer', text: 'Tell me about the project.' }]
    }
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /DIRECT ANSWER/);
  assert.match(messages[0].content, /Never invent/);
  assert.match(messages[0].content, /under 180 words/);
  assert.match(messages[1].content, /Reduced p95 latency by 40%/);
  assert.match(messages[1].content, /How did you improve API latency/);
});

test('supports an explicitly requested expanded answer', () => {
  const messages = buildInterviewAnswerMessages({ question: 'Explain the design', verbosity: 'detailed' });
  assert.match(messages[0].content, /under 500 words/);
  assert.match(messages[1].content, /Answer length: detailed/);
});

test('does not allow an unknown question type into the prompt', () => {
  const messages = buildInterviewAnswerMessages({ question: 'Question', type: 'malicious-type' });
  assert.match(messages[1].content, /Question type: general/);
});

test('coding answers always include complete code in the requested or contextual language', () => {
  const messages = buildInterviewAnswerMessages({
    question: 'Implement binary search',
    type: 'coding',
    retrievedContext: {
      contextLanguages: ['TypeScript'],
      chunks: [{ source: 'search.ts', text: 'export function search(values: number[], target: number): number' }]
    }
  });
  assert.match(messages[0].content, /always provide a complete code solution/);
  assert.match(messages[0].content, /APPROACH, CODE, COMPLEXITY, EDGE CASES/);
  assert.match(messages[0].content, /runnable or interview-ready code/);
  assert.match(messages[1].content, /Languages found in context files:\nTypeScript/);
  assert.match(messages[1].content, /search\.ts/);
});

test('coding wording overrides an incorrectly classified transcript type', () => {
  const messages = buildInterviewAnswerMessages({
    question: 'Shorted Shortest Pathcode in Java Script',
    type: 'technical'
  });
  assert.match(messages[0].content, /APPROACH, CODE, COMPLEXITY, EDGE CASES/);
  assert.match(messages[1].content, /Question type: coding/);
  assert.match(messages[1].content, /Shortest Path code in JavaScript/);
  assert.doesNotMatch(messages[0].content, /DIRECT ANSWER, TALKING POINTS/);
});
