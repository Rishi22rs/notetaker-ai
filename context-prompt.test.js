const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildContextMessages } = require('./context-prompt');

test('personal facts from context are included in the actual user request', () => {
  const result = buildContextMessages(
    [{ role: 'user', content: 'What is my name?' }],
    { text: 'My name is Rishi.', files: [] }
  );
  assert.equal(result[0].role, 'system');
  assert.match(result[1].content, /My name is Rishi\./);
  assert.match(result[1].content, /What is my name\?/);
});

test('context images are attached to the latest user request', () => {
  const result = buildContextMessages(
    [{ role: 'user', content: 'What is shown?' }],
    { files: [{ kind: 'image', content: 'base64-image' }] }
  );
  assert.deepEqual(result[0].images, ['base64-image']);
});
