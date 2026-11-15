// Development diagnostics for the Electron main process.
function redact(value) {
  return String(value instanceof Error ? `${value.name}: ${value.message}` : value)
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[REDACTED DATABASE URL]')
    .replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:token|password|secret|api[_-]?key|authorization|cookie|code)\s*["']?\s*[:=]\s*["']?)[^\s"',}&]+/gi, '$1[REDACTED]')
    .slice(0, 4000);
}

function installDiagnostics({ client, target = globalThis, logger = console }) {
  const originalFetch = target.fetch;
  const originals = {};
  const safely = callback => { try { callback(); } catch { /* Debugging must not break the app. */ } };
  const log = (level, ...values) => safely(() => {
    // Objects can contain user data. Only forward primitive messages and errors.
    const message = values.map(value => typeof value === 'object' && !(value instanceof Error) ? '[object omitted]' : redact(value)).join(' ');
    if (level === 'error') client.error(message, []);
    else if (level === 'warn') client.warn(message);
    else client.log(message);
  });
  const wrappedFetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    // Query values and resource IDs may contain credentials or private identifiers.
    const pathname = url.pathname.replace(/(\/session-history\/|\/payments\/|\/checkout\/)[^/]+/g, '$1[id]');
    const request = { url: `${url.origin}${pathname}`, method: options.method || input.method || 'GET', headers: {}, params: '[omitted]', data: '[omitted]' };
    const started = Date.now();
    try {
      const response = await originalFetch.call(target, input, options);
      safely(() => client.apiResponse(request, {
        status: response.status,
        headers: { 'content-type': response.headers?.get('content-type') || '' },
        body: '[body omitted; streaming response is untouched]'
      }, Date.now() - started));
      return response;
    } catch (error) {
      safely(() => client.apiResponse(request, { status: 0, headers: {}, body: redact(error) }, Date.now() - started));
      throw error;
    }
  };
  target.fetch = wrappedFetch;
  for (const level of ['log', 'info', 'debug', 'warn', 'error']) {
    originals[level] = logger[level];
    logger[level] = (...values) => { originals[level].apply(logger, values); log(level, ...values); };
  }
  return { log, close() {
    if (target.fetch === wrappedFetch) target.fetch = originalFetch;
    for (const level of Object.keys(originals)) logger[level] = originals[level];
    safely(() => client.close());
  } };
}

function startReactotron() {
  const { createClient } = require('reactotron-core-client');
  const client = createClient({
    name: 'UNYON Electron', host: '127.0.0.1', port: 9090, environment: 'development',
    createSocket: url => new WebSocket(url)
  });
  client.connect();
  return installDiagnostics({ client });
}

module.exports = { startReactotron, installDiagnostics, redact };
