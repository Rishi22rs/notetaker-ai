const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthClient } = require('./auth-client');

test('Google login reports an unavailable server before opening a browser', async () => {
  let opened = false;
  const client = createAuthClient({
    serverUrl: 'http://127.0.0.1:1',
    userDataPath: '/tmp',
    openExternal: async () => { opened = true; }
  });
  await assert.rejects(client.login(), /Sign-in server is unavailable/);
  assert.equal(opened, false);
});
