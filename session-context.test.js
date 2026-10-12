const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionContext } = require('./session-context');

test('session context combines with global context without overwriting saved details', () => {
  const scopes = createSessionContext();
  const global = { text: 'Always use JavaScript', files: [{ name: 'Preferences.txt', content: 'Be concise' }] };
  const original = structuredClone(global);
  scopes.set({ text: 'Company: Stripe\nPayments role', files: [{ name: 'Resume.pdf', content: 'My experience' }] });
  const request = scopes.combine(global);
  assert.match(request.text, /Global context:\nAlways use JavaScript/);
  assert.match(request.text, /Session context:\nCompany: Stripe\nPayments role/);
  assert.deepEqual(request.files.map(file => file.name), ['Preferences.txt', 'Resume.pdf']);
  assert.deepEqual(global, original);
  global.text = 'Use TypeScript instead';
  assert.match(scopes.combine(global).text, /Use TypeScript instead/);
});

test('ending a session removes its details and resume while retaining global context', () => {
  const scopes = createSessionContext();
  const global = { text: 'Permanent instructions', files: [{ name: 'Global.txt' }] };
  scopes.set({ text: 'Temporary extra context', files: [{ name: 'Resume.pdf' }] });
  assert.equal(scopes.hasSession(), true);
  scopes.clear();
  assert.equal(scopes.hasSession(), false);
  assert.equal(scopes.combine(global).text, 'Global context:\nPermanent instructions');
  assert.deepEqual(scopes.combine(global).files, global.files);
  scopes.set({ text: 'Company: New company', files: [] });
  assert.doesNotMatch(scopes.combine(global).text, /Temporary/);
  assert.deepEqual(scopes.combine(global).files, global.files);
});

test('a fresh app context has no previous session details', () => {
  const previous = createSessionContext();
  previous.set({ text: 'Temporary company', files: [{ name: 'Resume.pdf' }] });
  const fresh = createSessionContext();
  assert.deepEqual(fresh.combine(), { text: '', files: [] });
});
