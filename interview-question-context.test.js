const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { selectLatestInterviewerQuestion, summarizeQuestionParts } = require('./interview-question-context');

test('browser helper does not collide with renderer script declarations', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(require.resolve('./interview-question-context'), 'utf8'), context);
  assert.doesNotThrow(() => vm.runInContext(
    'const { selectLatestInterviewerQuestion, summarizeQuestionParts } = window.interviewQuestionContext;', context
  ));
});

test('manual answer ignores typed chat and interviewer filler after the latest question', () => {
  const question = { id: 'q', speaker: 'computer', text: 'How would you scale the API?', detection: { isQuestion: true } };
  const turns = [question, { speaker: 'user', source: 'typed', text: 'Write some code' },
    { speaker: 'computer', text: 'Okay, thanks.', detection: { isQuestion: false } },
    { speaker: 'assistant', text: 'Here is some code' }];
  assert.deepEqual(selectLatestInterviewerQuestion(turns, 'Okay, thanks.'), { turn: question, text: question.text });
});

test('manual answer prefers a newer interviewer question even before detection completes', () => {
  const first = { speaker: 'computer', text: 'What is React?', detection: { isQuestion: true } };
  const latest = { speaker: 'computer', text: 'How did you measure render performance?' };
  assert.deepEqual(selectLatestInterviewerQuestion([first, latest], latest.text), { turn: latest, text: latest.text });
});

test('manual answer never treats a typed message as the interviewer question', () => {
  assert.equal(selectLatestInterviewerQuestion([{ speaker: 'user', source: 'typed', text: 'How do I fix this?' }]), null);
});

test('multi-part interviewer questions are summarized as separate points', () => {
  assert.deepEqual(summarizeQuestionParts('What is memoization? How did you verify it reduced renders?'),
    ['What is memoization?', 'How did you verify it reduced renders?']);
  assert.deepEqual(summarizeQuestionParts('1. Explain the API 2. How would you scale it?'),
    ['Explain the API', 'How would you scale it?']);
});

 test('Answer now selects newer live speech ahead of an older undetected question', () => {
  const old = { speaker: 'computer', text: 'What is React?', endedAt: 1000 };
  assert.deepEqual(selectLatestInterviewerQuestion([old], 'How do closures work?', 2000), { turn: null, text: 'How do closures work?' });
});
 test('an algorithm prompt in the latest live speech does not fall back to an old question', () => {
  const old = { speaker: 'computer', text: 'What is React?', endedAt: 1000, detection: { isQuestion: true } };
  const latest = 'Given an array, find two numbers that sum to the target';
  assert.equal(selectLatestInterviewerQuestion([old], latest, 2000).text, latest);
});
