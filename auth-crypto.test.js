const test = require('node:test');
const assert = require('node:assert/strict');
const { hashToken, isLoopbackRedirect, randomToken } = require('./auth-crypto');

test('randomToken creates distinct URL-safe secrets', () => {
  const first = randomToken();
  const second = randomToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test('hashToken is deterministic without exposing the source token', () => {
  assert.equal(hashToken('session'), hashToken('session'));
  assert.notEqual(hashToken('session'), 'session');
});

test('desktop callbacks are limited to loopback HTTP addresses', () => {
  assert.equal(isLoopbackRedirect('http://127.0.0.1:49152/callback'), true);
  assert.equal(isLoopbackRedirect('http://localhost:49152/callback'), true);
  assert.equal(isLoopbackRedirect('http://[::1]:49152/callback'), true);
  assert.equal(isLoopbackRedirect('https://example.com/callback'), false);
  assert.equal(isLoopbackRedirect('http://127.0.0.1.example.com/callback'), false);
  assert.equal(isLoopbackRedirect('not a URL'), false);
});
