const byId = id => document.getElementById(id);
function node(tag, text, className) { const value = document.createElement(tag); value.textContent = text; if (className) value.className = className; return value; }
function card(label, value, detail) { const item = node('article', '', 'card'); item.append(node('div', label, 'label'), node('div', value, 'value')); if (detail) item.append(node('p', detail, 'muted')); return item; }
let refreshing = false;
async function refresh() {
  if (refreshing) return; refreshing = true;
  try {
    const response = await fetch('/admin/api/metrics', { cache: 'no-store' });
    if (response.status === 401) { byId('dashboard').hidden = true; byId('logout').hidden = true; byId('login').hidden = false; byId('access-card').hidden = false; delete document.body.dataset.authenticated; byId('status').textContent = 'Sign in with an authorized Google account to view server metrics.'; return; }
    if (!response.ok) throw new Error('Metrics unavailable');
    const data = await response.json(); byId('dashboard').hidden = false; byId('logout').hidden = false; byId('login').hidden = true; byId('access-card').hidden = true; document.body.dataset.authenticated = 'true';
    byId('status').textContent = `${data.email} · Updated ${new Date(data.updatedAt).toLocaleTimeString()} · Daily totals: ${data.window}`;
    byId('alerts').replaceChildren(...(data.alerts.length ? data.alerts.map(text => node('div', text, 'alert')) : [node('p', 'No active threshold alerts.', 'muted')]));
    byId('overview').replaceChildren(card('Active listening sessions', data.activeSessions, 'Unexpired paid session leases'), card('Concurrent AI requests', `${data.activeRequests} / ${data.requestCapacity}`, '80% capacity alert threshold'), card('Process memory', `${data.memoryRssMb} MB`, `${data.hostFreeMemoryMb} MB host memory available`), card('Event loop delay', `${data.eventLoopDelayMs} ms`, `Uptime ${Math.floor(data.uptimeSeconds / 60)} min · Host load ${Number(data.hostLoad).toFixed(2)}`));
    byId('providers').replaceChildren(...data.providers.map(p => {
      const item = card(p.name.toUpperCase(), `${p.requests || 0} requests`, p.configured ? 'Backend key configured' : 'Backend key missing');
      item.append(node('p', `Completed: ${p.completed || 0} · Errors: ${p.errors || 0} · Provider 429s: ${p.providerRejections || 0} · Local rejections: ${p.localRejections || 0} · Cancelled: ${p.cancelled || 0}`, 'muted'));
      item.append(node('p', `Average completed latency: ${p.completed ? Math.round(p.latencyMs / p.completed) : 0} ms · Reported tokens: ${p.tokens || 0} (${p.tokenReports || 0} usage reports)`, 'muted'));
      if (p.name === 'groq') item.append(node('p', `Estimated billable audio: ${Math.round(p.audioSecondsEstimate || 0)} seconds`, 'muted'));
      item.append(node('p', p.dailyRequestAlertBudget ? `Daily request alert budget: ${p.dailyRequestAlertBudget}` : 'Daily request alert budget: not configured', 'muted'));
      item.append(node('p', p.lastReportedLimits ? `Last provider quota snapshot: ${p.lastReportedLimits.observedAt}. Remaining values may be stale.` : 'Provider remaining quota: not reported. Account credit balance: unavailable.', 'muted'));
      if (p.lastReportedLimits) item.append(node('pre', JSON.stringify(p.lastReportedLimits.values, null, 2)));
      return item;
    })); byId('scope').textContent = data.scope;
  } catch { byId('dashboard').hidden = true; byId('status').textContent = 'Monitoring unavailable. Retrying automatically; previous metrics are hidden.'; }
  finally { refreshing = false; }
}
byId('logout').addEventListener('click', async () => { try { const response = await fetch('/admin/logout', { method: 'POST' }); if (!response.ok) throw new Error(); await refresh(); } catch { byId('status').textContent = 'Sign-out failed. Please try again.'; } });
refresh(); setInterval(refresh, 15000);
