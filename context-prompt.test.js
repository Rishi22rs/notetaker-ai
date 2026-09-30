const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildContextMessages } = require('./context-prompt');

test('personal facts from context are included in the actual user request', () => {
  const result = buildContextMessages(
    [{ role: 'user', content: 'What is my name?' }],
    { text: 'My name is Rishi.', files: [] }
  );
  assert.equal(result[0].role, 'system');
  assert.match(result[0].content, /not an exclusive knowledge source/);
  assert.match(result[0].content, /general knowledge and reasoning/);
  assert.match(result[1].content, /My name is Rishi\./);
  assert.match(result[1].content, /What is my name\?/);
});

test('context images are attached to the latest user request', () => {
  const result = buildContextMessages(
    [{ role: 'user', content: 'What is shown?' }],
    { files: [{ kind: 'image', content: 'base64-image' }] }
  );
  assert.equal(result[0].role, 'system');
  assert.deepEqual(result[1].images, ['base64-image']);
});

test('context is supporting background rather than an answer restriction', () => {
  const result = buildContextMessages(
    [{ role: 'user', content: 'What is the capital of Japan?' }],
    { text: 'The user is planning an Asia trip.', files: [] }
  );
  assert.match(result[0].content, /When the context does not contain the answer, answer normally/);
  assert.match(result[1].content, /What is the capital of Japan\?/);
});

test('coding requests require complete code even without saved context', () => {
  const result = buildContextMessages([{ role: 'user', content: 'Implement binary search in Java' }]);
  assert.equal(result[0].role, 'system');
  assert.match(result[0].content, /complete runnable code/);
  assert.match(result[0].content, /language explicitly requested/);
  assert.equal(result[1].content, 'Implement binary search in Java');
});
