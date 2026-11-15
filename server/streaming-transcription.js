const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('node:crypto');
const { createLimiter } = require('./ai-proxy');

const ASSEMBLYAI_MODEL = 'universal-streaming-english';
function assemblyUrl() {
  const url = new URL('wss://streaming.assemblyai.com/v3/ws');
  url.search = new URLSearchParams({ speech_model: ASSEMBLYAI_MODEL, sample_rate: '16000', encoding: 'pcm_s16le',
    min_turn_silence: '250', max_turn_silence: '700', end_of_turn_confidence_threshold: '0.4',
    include_partial_turns: 'true', format_turns: 'false' });
  return url.toString();
}

function attachStreamingTranscription({ server, config, authenticate, authorize, observer = () => {}, authorizationIntervalMs = 5000, createSocket = (url, options) => new WebSocket(url, options) }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32000, perMessageDeflate: false });
  const active = new Map();
  const acquire = createLimiter({ maxConcurrent: 100, perUserConcurrent: 2, perMinute: 30 });
  let closing = false;
  function reject(socket, status, message) {
    if (socket.destroyed) return;
    const body = JSON.stringify({ error: message });
    socket.end(`HTTP/1.1 ${status} Error\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  }
  async function upgrade(request, socket, head) {
    socket.on('error', () => {});
    socket.setTimeout(10000, () => socket.destroy());
    try {
      const url = new URL(request.url, config.publicUrl);
      if (url.pathname !== '/ai/transcribe/stream') return reject(socket, 404, 'Not found.');
      if (config.transcriptionProvider !== 'assemblyai') return reject(socket, 409, 'Select TRANSCRIPTION_PROVIDER=assemblyai to use live transcription.');
      if (!config.assemblyaiApiKey) return reject(socket, 503, 'ASSEMBLYAI_API_KEY is missing from the backend environment.');
      const speaker = url.searchParams.get('speaker');
      if (!['computer', 'user'].includes(speaker)) return reject(socket, 400, 'Invalid audio source.');
      const language = url.searchParams.get('language') || 'auto';
      if (!['auto', 'en'].includes(language)) return reject(socket, 400, 'The selected AssemblyAI streaming model supports English. Select English or automatic language.');
      const user = await authenticate(request);
      if (!user) return reject(socket, 401, 'Sign in to use transcription.');
      const usageToken = String(request.headers['x-usage-token'] || '');
      await authorize(user, usageToken);
      if (socket.destroyed) return;
      if (closing) return reject(socket, 503, 'Backend is shutting down.');
      const slot = `${user._id}:${speaker}`;
      if (active.has(slot)) return reject(socket, 409, 'This audio source already has an active stream.');
      if (active.size >= 100) return reject(socket, 429, 'Streaming capacity reached. Try again shortly.');
      const releaseLimit = acquire(String(user._id));
      const reservation = {};
      active.set(slot, reservation);
      const release = () => { if (active.get(slot) === reservation) active.delete(slot); releaseLimit(); };
      socket.once('close', release);
      socket.setTimeout(0);
      try { wss.handleUpgrade(request, socket, head, client => connect(client, user, request, speaker, usageToken, release, reservation)); }
      catch (error) { release(); throw error; }
    } catch (error) { reject(socket, error.status || 503, error.status ? error.message : 'Could not open live transcription.'); }
  }
  function connect(client, user, request, speaker, usageToken, release, reservation) {
    const started = Date.now(), requestId = randomUUID();
    let upstream, ready = false, ended = false, lastFinal = -1, audioBytes = 0;
    let windowStarted = Date.now(), windowBytes = 0, checking = false;
    let authorizationTimer, handshakeTimer, heartbeatTimer;
    let alive = true;
    const observe = (event, details = {}) => {
      const entry = { requestId, kind: 'transcribe', provider: 'assemblyai', event, elapsedMs: Date.now() - started, ...details };
      try { observer(entry); } catch {}
      // Metadata only: no transcript, audio, token, or user identity.
      console.log('[Streaming AI]', JSON.stringify(entry));
    };
    const send = event => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (client.bufferedAmount > 256000) { client.terminate(); return finish(); }
      client.send(JSON.stringify({ ...event, speaker }));
    };
    function finish(message) {
      if (ended) return;
      if (message) send({ type: 'error', text: message });
      ended = true;
      clearInterval(authorizationTimer); clearTimeout(handshakeTimer); clearInterval(heartbeatTimer);
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: 'Terminate' }));
        upstream.close();
        const forceClose = setTimeout(() => upstream.terminate(), 2000); forceClose.unref();
        upstream.once('close', () => clearTimeout(forceClose));
      } else upstream?.terminate();
      if (client.readyState === WebSocket.OPEN) client.close(message ? 1011 : 1000);
      release();
      observe(message ? 'failed' : 'completed', { audioSecondsEstimate: audioBytes / 32000, sessionSeconds: (Date.now() - started) / 1000 });
    }
    reservation.close = () => finish();
    observe('received');
    client.on('close', () => finish()); client.on('error', () => finish('Live transcription connection failed.'));
    client.on('pong', () => { alive = true; });
    heartbeatTimer = setInterval(() => { if (!alive) { finish('Live transcription connection timed out.'); client.terminate(); return; } alive = false; client.ping(); }, 15000);
    authorizationTimer = setInterval(async () => {
      if (checking || ended) return;
      checking = true;
      let deadline;
      try {
        await Promise.race([
          (async () => {
            const current = await authenticate(request);
            if (!current || String(current._id) !== String(user._id)) throw new Error();
            await authorize(user, usageToken);
          })(),
          new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Authorization timed out')), 3000); })
        ]);
      } catch { finish('Your paid session has ended. Restart listening after signing in or recharging.'); }
      finally { clearTimeout(deadline); checking = false; }
    }, authorizationIntervalMs);
    handshakeTimer = setTimeout(() => finish('AssemblyAI did not start the stream in time. Try again.'), 15000);
    client.on('message', (bytes, binary) => {
      if (ended) return;
      if (!binary) {
        try { if (JSON.parse(bytes.toString()).type === 'stop') return finish(); } catch {}
        return finish('Invalid streaming message.');
      }
      if (!ready || bytes.length % 2 || bytes.length < 2) return finish('Invalid or premature audio frame.');
      if (Date.now() - windowStarted >= 1000) { windowStarted = Date.now(); windowBytes = 0; }
      windowBytes += bytes.length;
      if (windowBytes > 64000 || upstream.bufferedAmount > 128000) return finish('Audio is arriving faster than it can be transcribed. Restart listening.');
      audioBytes += bytes.length;
      upstream.send(bytes, { binary: true });
    });
    try {
      upstream = createSocket(assemblyUrl(), { headers: { Authorization: config.assemblyaiApiKey }, handshakeTimeout: 10000, maxPayload: 256000, perMessageDeflate: false });
      upstream.on('open', () => { if (ended) upstream.terminate(); else observe('provider_start'); });
      upstream.on('message', bytes => {
        if (ended) return;
        let event;
        try { event = JSON.parse(bytes.toString()); } catch { return finish('AssemblyAI returned an invalid response.'); }
        if (event.type === 'Begin') { ready = true; clearTimeout(handshakeTimer); send({ type: 'ready', text: 'Listening · AssemblyAI live streaming' }); }
        else if (event.type === 'Turn' && Number.isSafeInteger(event.turn_order) && event.turn_order > lastFinal && typeof event.transcript === 'string') {
          const final = event.end_of_turn === true;
          if (final) lastFinal = event.turn_order;
          send({ type: final ? 'transcript' : 'partial-transcript', text: event.transcript.slice(0, 20000), turnId: `${requestId}:${event.turn_order}`,
            capturedAt: started + (Number.isFinite(event.words?.[0]?.start) ? Math.max(0, event.words[0].start) : 0) });
        } else if (event.type === 'Termination') finish();
        else if (event.type === 'Error' || event.error) finish('AssemblyAI reported a streaming error. Check its account usage and streaming limits.');
      });
      upstream.on('unexpected-response', (_request, response) => { response.resume(); finish(`AssemblyAI rejected live transcription (HTTP ${response.statusCode}). Check the backend key, balance, and streaming limits.`); });
      upstream.on('error', () => finish('AssemblyAI streaming connection failed. Check the backend key, balance, and network.'));
      upstream.on('close', () => finish(ended ? undefined : 'AssemblyAI disconnected. Restart listening to reconnect.'));
    } catch { finish('Could not start AssemblyAI streaming.'); }
  }
  server.on('upgrade', upgrade);
  return { close() { closing = true; server.removeListener('upgrade', upgrade); for (const value of active.values()) value.close?.(); wss.close(); } };
}

module.exports = { attachStreamingTranscription, assemblyUrl, ASSEMBLYAI_MODEL };
