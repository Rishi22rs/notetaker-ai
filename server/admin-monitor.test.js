const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminMonitor } = require('./admin-monitor');
const { hashToken } = require('../auth-crypto');
function setup(fetchImpl) {
  const collections = new Map();
  const db = { collection(name) {
    if (!collections.has(name)) {
      const rows = [];
      collections.set(name, { rows, createIndex: async () => {}, insertOne: async row => rows.push(row), findOne: async q => rows.find(row => row.tokenHash === q.tokenHash && row.expiresAt > q.expiresAt.$gt), deleteOne: async q => { const i = rows.findIndex(r => r.tokenHash === q.tokenHash); if (i >= 0) rows.splice(i, 1); }, countDocuments: async () => 2,
        updateOne: async (q, update) => { let row = rows.find(r => r._id === q._id); if (!row) { row = { ...q }; rows.push(row); } for (const [key, value] of Object.entries(update.$inc)) row[key] = (row[key] || 0) + value; }, find: q => ({ toArray: async () => rows.filter(r => q._id.$in.includes(r._id)) }) });
    } return collections.get(name);
  } };
  const config = { publicUrl: 'https://api.example.com', adminEmails: 'underratedgames22@gmail.com', googleClientId: 'client', googleClientSecret: 'secret', geminiDailyRequests: 10, geminiApiKey: 'key', groqApiKey: 'key' };
  const monitor = createAdminMonitor({ db, config, fetchImpl });
  async function request(path, { method = 'GET', cookie = '', origin } = {}) {
    const headers = {}; let body;
    const res = { setHeader: (k,v) => { headers[k.toLowerCase()] = v; }, writeHead: (status, values) => { res.status = status; for (const [k,v] of Object.entries(values)) headers[k.toLowerCase()] = v; }, end: text => { body = text; } };
    await monitor.handle({ method, headers: { cookie, origin } }, res, new URL(path, config.publicUrl));
    return { status: res.status, headers, body, json: () => JSON.parse(body) };
  }
  return { monitor, request, db, config };
}
test('admin data rejects anonymous, desktop-style and expired sessions', async t => {
  const s = setup(); t.after(() => s.monitor.close());
  assert.equal((await s.request('/admin/api/metrics')).status, 401);
  await s.db.collection('admin_sessions').insertOne({ tokenHash: hashToken('expired'), email: s.config.adminEmails, expiresAt: new Date(0) });
  assert.equal((await s.request('/admin/api/metrics', { cookie: 'admin_session=expired' })).status, 401);
});
test('OAuth binds state to browser, rejects unauthorized email and issues secure admin-only cookie', async t => {
  let email = 'intruder@example.com';
  const s = setup(async url => ({ ok: true, json: async () => url.endsWith('/token') ? { id_token: 'google-token' } : { email, email_verified: 'true', aud: 'client', iss: 'https://accounts.google.com', exp: Math.floor(Date.now()/1000)+1000 } }));
  t.after(() => s.monitor.close());
  async function start() { const response = await s.request('/admin/login'); return { state: new URL(response.headers.location).searchParams.get('state'), binding: response.headers['set-cookie'].split(';')[0] }; }
  let flow = await start();
  assert.equal((await s.request(`/admin/callback?state=${flow.state}&code=test`)).status, 400);
  flow = await start();
  assert.equal((await s.request(`/admin/callback?state=${flow.state}&code=test`, { cookie: flow.binding })).status, 403);
  email = s.config.adminEmails; flow = await start();
  const callback = await s.request(`/admin/callback?state=${flow.state}&code=test`, { cookie: flow.binding });
  assert.equal(callback.status, 302); assert.match(callback.headers['set-cookie'], /HttpOnly; SameSite=Lax; Path=\/admin; Max-Age=28800; Secure/);
  const sessionCookie = callback.headers['set-cookie'].split(';')[0];
  assert.equal((await s.request('/admin/api/metrics', { cookie: sessionCookie })).status, 200);
  s.config.adminEmails = 'someone-else@example.com';
  assert.equal((await s.request('/admin/api/metrics', { cookie: sessionCookie })).status, 401);
});
test('persists daily metrics, reports threshold alerts and protects logout against cross-origin requests', async t => {
  const s = setup(); t.after(() => s.monitor.close());
  await s.db.collection('admin_sessions').insertOne({ tokenHash: hashToken('valid'), email: s.config.adminEmails, expiresAt: new Date(Date.now()+100000) });
  const auth = { cookie: 'admin_session=valid' };
  for (let i=0;i<8;i++) s.monitor.observe({ kind:'chat', event:'provider_start' });
  s.monitor.observe({ kind:'transcribe', event:'provider_headers', status:200, rateLimits: { 'x-ratelimit-limit-requests':'100', 'x-ratelimit-remaining-requests':'10' } });
  const result = (await s.request('/admin/api/metrics', auth)).json();
  assert.equal(result.providers[0].requests, 8); assert.ok(result.alerts.some(v => v.includes('daily alert budget'))); assert.ok(result.alerts.some(v => v.includes('below 20%')));
  assert.equal((await s.request('/admin/logout', { ...auth, method: 'POST', origin:'https://evil.example' })).status, 403);
  assert.equal((await s.request('/admin/logout', { ...auth, method: 'POST', origin:s.config.publicUrl })).status, 200);
  assert.equal((await s.request('/admin/api/metrics', auth)).status, 401);
});
