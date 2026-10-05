const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

function createAuthClient({ serverUrl, userDataPath, openExternal, timeoutMs = 180_000 }) {
  const sessionPath = path.join(userDataPath, 'auth-session.json');

  async function readSession() {
    try { return JSON.parse(await fs.readFile(sessionPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  }

  async function writeSession(value) {
    await fs.writeFile(sessionPath, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  }

  async function api(route, options = {}) {
    const response = await fetch(new URL(route, serverUrl), {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Authentication server returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function status() {
    const saved = await readSession();
    if (!saved?.token) return { authenticated: false };
    try {
      const result = await api('/auth/me', { headers: { authorization: `Bearer ${saved.token}` } });
      return { authenticated: true, user: result.user };
    } catch (error) {
      if (error.status === 401) {
        await fs.rm(sessionPath, { force: true });
        return { authenticated: false };
      }
      throw error;
    }
  }

  async function login() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
        error ? reject(error) : resolve(value);
      };
      const server = http.createServer(async (request, response) => {
        try {
          const url = new URL(request.url, 'http://127.0.0.1');
          if (url.pathname !== '/callback') { response.writeHead(404).end(); return; }
          const error = url.searchParams.get('error');
          const code = url.searchParams.get('code');
          response.writeHead(error || !code ? 400 : 200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(error || !code
            ? '<h1>Sign-in failed</h1><p>You can close this window and return to the app.</p>'
            : '<h1>Signed in</h1><p>You can close this window and return to the app.</p>');
          if (error || !code) return finish(new Error(error || 'Google did not return a sign-in code.'));
          const result = await api('/auth/exchange', { method: 'POST', body: JSON.stringify({ code }) });
          await writeSession({ token: result.token });
          finish(null, { authenticated: true, user: result.user });
        } catch (error) { finish(error); }
      });
      const timer = setTimeout(() => finish(new Error('Google sign-in timed out.')), timeoutMs);
      server.listen(0, '127.0.0.1', async () => {
        try {
          const port = server.address().port;
          const callback = `http://127.0.0.1:${port}/callback`;
          await openExternal(new URL(`/auth/google/start?desktop_redirect=${encodeURIComponent(callback)}`, serverUrl).toString());
        } catch (error) { finish(error); }
      });
      server.on('error', (error) => finish(error));
    });
  }

  async function logout() {
    const saved = await readSession();
    if (saved?.token) {
      await api('/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${saved.token}` } }).catch(() => {});
    }
    await fs.rm(sessionPath, { force: true });
    return { authenticated: false };
  }

  async function redeemCoupon(code) {
    const saved = await readSession();
    if (!saved?.token) throw new Error('Sign in before redeeming a coupon.');
    return api('/coupons/redeem', {
      method: 'POST',
      headers: { authorization: `Bearer ${saved.token}` },
      body: JSON.stringify({ code })
    });
  }

  async function authorizedApi(route, options = {}) {
    const saved = await readSession();
    if (!saved?.token) throw new Error('Sign in to continue.');
    return api(route, { ...options, headers: { authorization: `Bearer ${saved.token}`, ...options.headers } });
  }

  async function startRecharge(planId) {
    const result = await authorizedApi('/payments/orders', { method: 'POST', body: JSON.stringify({ planId }) });
    await openExternal(result.checkoutUrl);
    return result;
  }

  return {
    login, logout, redeemCoupon, status, startRecharge,
    paymentPlans: () => api('/payments/plans'),
    paymentStatus: (id) => authorizedApi(`/payments/${encodeURIComponent(id)}`),
    wallet: () => authorizedApi('/wallet'),
    startUsage: () => authorizedApi('/usage/start', { method: 'POST' }),
    usageHeartbeat: (token) => authorizedApi('/usage/heartbeat', { method: 'POST', body: JSON.stringify({ token }) }),
    stopUsage: (token) => authorizedApi('/usage/stop', { method: 'POST', body: JSON.stringify({ token }) })
  };
}

module.exports = { createAuthClient };
