const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Ollama client only targets localhost', () => {
  const source = fs.readFileSync(require.resolve('./ollama'), 'utf8');
  assert.match(source, /const HOST = '127\.0\.0\.1'/);
  assert.doesNotMatch(source, /https:/);
});

test('suggestions are questions informed by transcript context, never answers', () => {
  const source = fs.readFileSync(require.resolve('./ollama'), 'utf8');
  assert.match(source, /autocomplete QUESTIONS/);
  assert.match(source, /Never answer the question/);
  assert.match(source, /<recent_transcript>/);
  assert.match(source, /endsWith\('\?'\)/);
});
