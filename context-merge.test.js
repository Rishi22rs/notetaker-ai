const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeContextFiles } = require('./context-merge');

test('uploading an image after a PDF keeps both files', () => {
  const pdf = { name: 'reference.pdf', kind: 'text' };
  const image = { name: 'photo.png', kind: 'image' };
  const result = mergeContextFiles([pdf], [], [image]);
  assert.deepEqual(result.files, [pdf, image]);
});

test('a failed PDF remains visible after a later image upload', () => {
  const pdfError = { name: 'scan.pdf', error: 'Could not extract text' };
  const image = { name: 'photo.png', kind: 'image' };
  const result = mergeContextFiles([], [pdfError], [image]);
  assert.deepEqual(result.files, [image]);
  assert.deepEqual(result.errors, [pdfError]);
});
