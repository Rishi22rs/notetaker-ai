const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Ollama client only targets localhost', () => {
  const source = fs.readFileSync(require.resolve('./ollama'), 'utf8');
  assert.match(source, /const HOST = '127\.0\.0\.1'/);
  assert.doesNotMatch(source, /https:/);
});
