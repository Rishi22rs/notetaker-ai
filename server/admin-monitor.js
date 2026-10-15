const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { randomToken, hashToken } = require('../auth-crypto');
const fs = require('node:fs');
const path = require('node:path');

function allowed(email, config) {
  return String(config.adminEmails || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean).includes(String(email || '').toLowerCase());
}
function cookie(request, name) {
  return (request.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function createAdminMonitor({ db, config, fetchImpl = fetch }) {
  const records = db.collection('admin_metrics');
  const sessions = db.collection('admin_sessions');
  const states = new Map();
  const live = new Map();
  const recentFailures = new Map();
  const providerLimits = new Map();
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  let pending = {}; let storageError = false; let flushing;
  function observe(event) {
    const provider = event.kind === 'chat' ? 'gemini' : 'groq';
    const key = `${new Date().toISOString().slice(0, 10)}:${provider}`;
    const values = pending[key] ||= {};
    const add = (name, n = 1) => { if (Number.isFinite(n)) values[name] = (values[name] || 0) + n; };
    if (event.event === 'provider_start') add('requests');
    if (event.event === 'received') live.set(event.requestId, Date.now());
    if (['completed', 'failed', 'cancelled_or_timed_out', 'rate_limited'].includes(event.event)) live.delete(event.requestId);
    if (event.event === 'completed') {
      add('completed'); add('latencyMs', event.elapsedMs);
      if (event.tokens) { add('tokens', event.tokens.total); add('tokenReports'); }
    }
    if (event.event === 'failed') { add('errors'); recentFailures.set(provider, { at: Date.now(), status: event.status }); }
    if (event.event === 'cancelled_or_timed_out') add('cancelled');
    if (event.event === 'rate_limited') add('localRejections');
    if (event.event === 'provider_headers' && event.status === 429) add('providerRejections');
    if (event.event === 'audio_chunk') add('audioSecondsEstimate', event.minimumBillableSecondsEstimate);
    if (event.event === 'provider_headers' && event.rateLimits && Object.keys(event.rateLimits).length) providerLimits.set(provider, { observedAt: new Date().toISOString(), values: event.rateLimits });
  }
  async function flush() {
    if (flushing) return flushing;
    const batch = pending; pending = {};
    flushing = (async () => {
      let failed = false;
      for (const [key, values] of Object.entries(batch)) {
        if (!Object.keys(values).length) continue;
        try { await records.updateOne({ _id: key }, { $inc: values }, { upsert: true }); }
        catch { failed = true; const restored = pending[key] ||= {}; for (const [k, v] of Object.entries(values)) restored[k] = (restored[k] || 0) + v; }
      }
      storageError = failed;
    })().finally(() => { flushing = undefined; });
    return flushing;
  }
  const timer = setInterval(() => { void flush(); loop.reset(); }, 10000); timer.unref();
  function headers(response) {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('X-Frame-Options', 'DENY'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  }
  const secure = new URL(config.publicUrl).protocol === 'https:';
  function setCookie(response, name, token, seconds) {
    response.setHeader('Set-Cookie', `${name}=${token}; HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${seconds}${secure ? '; Secure' : ''}`);
  }
  function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); }
  function redirect(response, destination) { response.writeHead(302, { Location: destination }); response.end(); }
  async function handle(request, response, url) {
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return false;
    headers(response);
    if (request.method === 'GET' && url.pathname === '/admin/login') {
      if (!config.adminEmails) { json(response, 503, { error: 'Admin access is not configured.' }); return true; }
      for (const [key, value] of states) if (value.expires < Date.now()) states.delete(key);
      if (states.size >= 1000) { json(response, 429, { error: 'Please try again later.' }); return true; }
      const state = randomToken(); const binding = randomToken();
      states.set(hashToken(state), { binding: hashToken(binding), expires: Date.now() + 600000 });
      setCookie(response, 'admin_oauth', binding, 600);
      const destination = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      destination.search = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: `${config.publicUrl}/admin/callback`, response_type: 'code', scope: 'openid email', state, prompt: 'select_account' });
      redirect(response, destination.toString()); return true;
    }
    if (request.method === 'GET' && url.pathname === '/admin/callback') {
      const key = hashToken(url.searchParams.get('state') || ''); const state = states.get(key); states.delete(key);
      const binding = cookie(request, 'admin_oauth');
      setCookie(response, 'admin_oauth', '', 0);
      if (!state || state.expires < Date.now() || !binding || state.binding !== hashToken(binding)) { json(response, 400, { error: 'Sign-in expired. Start again at /admin.' }); return true; }
      const exchange = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: `${config.publicUrl}/admin/callback`, grant_type: 'authorization_code' }) });
      const tokens = await exchange.json();
      if (!exchange.ok || !tokens.id_token) { json(response, 401, { error: 'Google sign-in failed.' }); return true; }
      const verified = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`, { signal: AbortSignal.timeout(15000) });
      const profile = await verified.json();
      if (!verified.ok || profile.aud !== config.googleClientId || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss) || !(Number(profile.exp) * 1000 > Date.now()) || String(profile.email_verified) !== 'true' || !allowed(profile.email, config)) { json(response, 403, { error: 'This Google account is not an administrator.' }); return true; }
      const token = randomToken(48);
      await sessions.insertOne({ tokenHash: hashToken(token), email: profile.email.toLowerCase(), expiresAt: new Date(Date.now() + 8 * 3600000) });
      setCookie(response, 'admin_session', token, 8 * 3600); redirect(response, '/admin'); return true;
    }
    // The shell contains no data; every data request independently requires an admin session.
    const assets = { '/admin': ['admin.html', 'text/html'], '/admin/': ['admin.html', 'text/html'], '/admin/app.js': ['admin.js', 'text/javascript'], '/admin/style.css': ['admin.css', 'text/css'] };
    if (request.method === 'GET' && assets[url.pathname]) {
      const [name, type] = assets[url.pathname]; response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); response.end(fs.readFileSync(path.join(__dirname, 'admin', name))); return true;
    }
    const token = cookie(request, 'admin_session');
    const session = token && await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!session || !allowed(session.email, config)) { json(response, 401, { error: 'Administrator sign-in required.' }); return true; }
    if (request.method === 'POST' && url.pathname === '/admin/logout') {
      if (request.headers.origin !== new URL(config.publicUrl).origin) { json(response, 403, { error: 'Invalid origin.' }); return true; }
      await sessions.deleteOne({ tokenHash: hashToken(token) }); setCookie(response, 'admin_session', '', 0); json(response, 200, { ok: true }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/admin/api/metrics') {
      await flush();
      const today = new Date().toISOString().slice(0, 10);
      const [usage, activeSessions] = await Promise.all([records.find({ _id: { $in: [`${today}:gemini`, `${today}:groq`] } }).toArray(), db.collection('usage_sessions').countDocuments({ status: 'active', leaseExpiresAt: { $gt: new Date() } })]);
      const alerts = [];
      const activeRequests = live.size;
      if (activeRequests >= 80) alerts.push('AI request capacity is above 80% of the 100-request instance limit.');
      if (storageError) alerts.push('Usage storage failed; quota totals may be incomplete.');
      const providers = ['gemini', 'groq'].map(name => {
        const row = usage.find(v => v._id === `${today}:${name}`) || {};
        const budget = Number(config[`${name}DailyRequests`]) > 0 ? Number(config[`${name}DailyRequests`]) : null;
        if (!config[name === 'gemini' ? 'geminiApiKey' : 'groqApiKey']) alerts.push(`${name}: backend API key is missing.`);
        const failure = recentFailures.get(name);
        if (failure && Date.now() - failure.at < 300000) alerts.push(`${name}: a request failed within the last five minutes (HTTP ${failure.status}).`);
        if (budget && (row.requests || 0) >= budget * .8) alerts.push(`${name}: observed requests reached 80% of your configured daily alert budget.`);
        const limits = providerLimits.get(name) || null;
        if (limits && Date.now() - Date.parse(limits.observedAt) < 60000) {
          const values = limits.values;
          for (const kind of ['requests', 'tokens']) {
            const remaining = Number(values[`x-ratelimit-remaining-${kind}`]); const limit = Number(values[`x-ratelimit-limit-${kind}`]);
            if (limit > 0 && Number.isFinite(remaining) && remaining <= limit * .2) alerts.push(`${name}: provider-reported ${kind} remaining is below 20%.`);
          }
        }
        return { name, configured: Boolean(config[name === 'gemini' ? 'geminiApiKey' : 'groqApiKey']), ...row, dailyRequestAlertBudget: budget, lastReportedLimits: limits };
      });
      const memory = process.memoryUsage(); const lagMs = Number.isFinite(loop.mean) ? Math.round(loop.mean / 1e6) : 0;
      if (lagMs >= 100) alerts.push('Event loop delay exceeds 100 ms.');
      json(response, 200, { email: session.email, updatedAt: new Date().toISOString(), window: `${today} UTC`, activeSessions, activeRequests, requestCapacity: 100, uptimeSeconds: Math.round(process.uptime()), memoryRssMb: Math.round(memory.rss / 1048576), hostFreeMemoryMb: Math.round(os.freemem() / 1048576), hostLoad: os.loadavg()[0], eventLoopDelayMs: lagMs, providers, alerts, scope: 'Request capacity and live metrics describe this backend instance. Daily totals persist in MongoDB. Budgets are UTC-day alert thresholds, not provider account balances. Missing usage from interrupted streams or other apps is not included.' }); return true;
    }
    json(response, 404, { error: 'Not found.' }); return true;
  }
  return { handle, observe, ensureIndexes: () => Promise.all([sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), sessions.createIndex({ tokenHash: 1 }, { unique: true })]), close: async () => { clearInterval(timer); loop.disable(); await flush(); } };
}
module.exports = { createAdminMonitor, allowed, cookie };
