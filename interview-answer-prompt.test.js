const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildInterviewAnswerMessages } = require('./interview-answer-prompt');

test('builds a bounded conversational interview prompt', () => {
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
  assert.match(messages[0].content, /short paragraphs, and 3–5 short bullets/);
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
  assert.match(messages[0].content, /APPROACH, CODE, EXPLANATION, COMPLEXITY, EDGE CASES/);
  assert.match(messages[0].content, /runnable or interview-ready code/);
  assert.match(messages[0].content, /Explain how the important parts of the code work/);
  assert.match(messages[1].content, /Languages found in context files:\nTypeScript/);
  assert.match(messages[1].content, /search\.ts/);
});

test('coding wording overrides an incorrectly classified transcript type', () => {
  const messages = buildInterviewAnswerMessages({
    question: 'Shorted Shortest Pathcode in Java Script',
    type: 'technical'
  });
  assert.match(messages[0].content, /APPROACH, CODE, EXPLANATION, COMPLEXITY, EDGE CASES/);
  assert.match(messages[1].content, /Question type: coding/);
  assert.match(messages[1].content, /Shorted Shortest Pathcode in Java Script/);
  assert.doesNotMatch(messages[0].content, /DIRECT ANSWER, TALKING POINTS/);
});

test('interviewer answer prompt separates system audio from typed chat context', () => {
  const messages = buildInterviewAnswerMessages({
    question: 'How did you verify memoization helped?',
    retrievedContext: { recentTurns: [
      { speaker: 'computer', source: 'audio', text: 'How did you verify memoization helped?' },
      { speaker: 'user', source: 'typed', text: 'Give me a JavaScript example' }
    ] }
  });
  assert.match(messages[0].content, /System audio is the interviewer/);
  assert.match(messages[0].content, /Never replace it with a recent typed message/);
  assert.match(messages[0].content, /multiple questions/);
  assert.match(messages[1].content, /Candidate typed note: Give me a JavaScript example/);
  assert.match(messages[1].content, /Current interviewer question:\nHow did you verify memoization helped/);
});

 test('selected code language overrides previous language requests and updates explanation', () => {
  const messages = buildInterviewAnswerMessages({ question: 'Implement binary search in Python', codeLanguage: 'JavaScript' });
  assert.match(messages[0].content, /selected JavaScript/);
  assert.match(messages[0].content, /overrides earlier language requests/);
  assert.match(messages[0].content, /Rewrite both the code and its explanation/);
});

 test('live answers speak as the candidate and default to Python without choosing from file hints', () => {
  const messages = buildInterviewAnswerMessages({ question: 'Implement binary search', type: 'coding', retrievedContext: { contextLanguages: ['PHP'] } });
  assert.match(messages[0].content, /interviewee speaking directly in first person/);
  assert.match(messages[0].content, /Do not describe the interviewer/);
  assert.match(messages[0].content, /no solution language is selected, use Python/);
  assert.match(messages[0].content, /language hints must not choose/);
});

 test('answers provide a separate short topic and a brief answer before explanation sections', () => {
  const normal = buildInterviewAnswerMessages({ question: 'Explain caching' })[0].content;
  assert.match(normal, /ANSWERING: followed by a short question or topic of at most 12 words/);
  assert.match(normal, /SHORT ANSWER: one or two sentences/);
  assert.match(normal, /KEY POINTS/);
  const coding = buildInterviewAnswerMessages({ question: 'Write a sorting function', type: 'coding' })[0].content;
  assert.match(coding, /After SHORT ANSWER, use these headings: APPROACH, CODE, EXPLANATION, COMPLEXITY, EDGE CASES/);
});
