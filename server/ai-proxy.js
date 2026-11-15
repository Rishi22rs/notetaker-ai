const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const { createMetricsTap } = require('./ai-metrics');
const { GEMINI_MODEL, GEMINI_REASONING_EFFORT } = require('../cloud-ai');
const { CLOUDFLARE_MODEL, transcriptionProvider, cloudflareRequest } = require('./transcription-provider');
function failure(message, status, details = {}) { return Object.assign(new Error(message), { status, publicMessage: message, ...details }); }

function retryAfterSeconds(value, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(86400, Math.max(1, Math.ceil(seconds))) : null;
}

async function providerFailure(upstream, provider) {
  const body = await upstream.json().catch(() => null);
  const rawCode = provider === 'cloudflare' ? body?.errors?.[0]?.code : body?.error?.code;
  const providerCode = /^[a-z0-9_:-]{1,64}$/i.test(String(rawCode || '')) ? String(rawCode) : null;
  const retry = retryAfterSeconds(upstream.headers?.get('retry-after'));
  let reason = 'provider_error';
  let message = `${provider} rejected this request (HTTP ${upstream.status}). Check the backend credentials, model access and provider account.`;
  if (upstream.status === 429) {
    reason = 'provider_rate_limit';
    message = `${provider} is temporarily limiting requests.${retry ? ` Retry after ${retry} seconds.` : ' Pause briefly before trying again.'}`;
    if (provider === 'cloudflare' && providerCode === '3040') {
      reason = 'provider_capacity';
      message = 'Cloudflare Workers AI is temporarily out of capacity (3040). This is provider capacity, not your request quota. Try again shortly.';
    } else if (provider === 'cloudflare' && providerCode === '3036') {
      reason = 'provider_quota';
      message = 'Cloudflare Workers AI daily free allocation is exhausted (3036). Wait for the allocation reset or enable Workers Paid billing.';
    }
  }
  return failure(message, upstream.status === 429 ? 429 : 502, {
    source: 'provider', provider, providerCode, reason, ...(retry ? { retryAfterSeconds: retry } : {})
  });
}
function createLimiter({ maxConcurrent = 100, perUserConcurrent = 4, perMinute = 120 } = {}) {
  const users = new Map(); let active = 0;
  return key => {
    const now = Date.now();
    for (const [id, value] of users) if (!value.active && now - value.started > 60000) users.delete(id);
    const value = users.get(key) || { active: 0, count: 0, started: now };
    if (now - value.started >= 60000) { value.count = 0; value.started = now; }
    if (active >= maxConcurrent || value.active >= perUserConcurrent || value.count >= perMinute) {
      const windowLimited = value.count >= perMinute;
      throw failure(windowLimited ? 'Backend AI request limit reached for this minute. Please try again after the reset.' : 'Backend has too many active AI requests. Wait for an active request to finish.', 429,
        { source: 'backend', reason: windowLimited ? 'backend_request_rate' : 'backend_concurrency', retryAfterSeconds: windowLimited ? Math.max(1, Math.ceil((value.started + 60000 - now) / 1000)) : 1 });
    }
    value.count++; value.active++; active++; users.set(key, value);
    let released = false;
    return () => { if (!released) { released = true; value.active--; active--; } };
  };
}
function geminiPayload(body) {
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 || body.messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw failure('Invalid AI messages.', 400);
  return { model: GEMINI_MODEL, messages: body.messages.map(({ role, content }) => ({ role, content })), stream: body.stream === true, ...(body.stream === true ? { stream_options: { include_usage: true } } : {}), temperature: 0.2, max_tokens: body.response_format ? 512 : 4096, reasoning_effort: GEMINI_REASONING_EFFORT, ...(body.response_format ? { response_format: { type: 'json_object' } } : {}) };
}
function transcriptionPayload(body) {
  if (!['whisper-large-v3-turbo', 'whisper-large-v3'].includes(body.model) || !['auto', 'en', 'hi'].includes(body.language || 'auto') || typeof body.audio !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio)) throw failure('Invalid transcription request.', 400);
  const audio = Buffer.from(body.audio, 'base64');
  if (audio.length < 44 || audio.length > 1000000 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw failure('Invalid or oversized audio.', 400);
  const form = new FormData(); form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav'); form.append('model', body.model); form.append('response_format', 'json');
  if (body.language && body.language !== 'auto') form.append('language', body.language);
  return form;
}
function createAIProxy({ config, authorize, fetchImpl = fetch, logger = console.log, observer = () => {} }) {
  const acquire = createLimiter();
  const speechProvider = transcriptionProvider(config);
  async function handle({ request, response, user, kind, readJson }) {
    const started = performance.now();
    const requestId = randomUUID();
    const metrics = { responseBytes: 0, outputCharacters: 0, tokens: null };
    const log = (event, details = {}) => {
      const entry = { timestamp: new Date().toISOString(), requestId, kind, provider: kind === 'chat' ? 'gemini' : speechProvider, event, elapsedMs: Math.round(performance.now() - started), ...details };
      logger('[AI]', JSON.stringify(entry));
      try { observer(entry); } catch { /* Monitoring must not interrupt AI delivery. */ }
    };
    log('received');
    let release;
    try { release = acquire(String(user._id)); } catch (error) { log('rate_limited', { status: error.status, reason: error.reason, retryAfterSeconds: error.retryAfterSeconds }); throw error; }
    const controller = new AbortController();
    const close = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', close);
    const timeout = setTimeout(() => controller.abort(), 60000);
    let watchdog;
    try {
      if (kind === 'transcribe' && speechProvider === 'assemblyai') throw failure('AssemblyAI uses the live streaming endpoint. Update the desktop app to enable it.', 409);
      const key = kind === 'chat' ? config.geminiApiKey : speechProvider === 'cloudflare' ? config.cloudflareApiToken : config.groqApiKey;
      if (!key) throw failure(`${kind === 'chat' ? 'GEMINI_API_KEY' : speechProvider === 'cloudflare' ? 'CLOUDFLARE_API_TOKEN' : 'GROQ_API_KEY'} is missing from the backend environment. Configure it and restart the backend.`, 503);
      const body = await readJson(request, 1500000);
      const payload = kind === 'chat' ? JSON.stringify(geminiPayload(body)) : transcriptionPayload(body);
      let providerRequest = {
        url: kind === 'chat' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : 'https://api.groq.com/openai/v1/audio/transcriptions',
        headers: { Authorization: `Bearer ${key}`, ...(kind === 'chat' ? { 'content-type': 'application/json' } : {}) }, body: payload
      };
      if (kind === 'transcribe' && speechProvider === 'cloudflare') {
        try { providerRequest = cloudflareRequest(config, body); }
        catch (error) { throw failure(error.message, error.status || 503); }
      }
      if (kind === 'transcribe') {
        const audio = Buffer.from(body.audio, 'base64');
        const audioSeconds = audio.readUInt32LE(28) > 0 ? (audio.length - 44) / audio.readUInt32LE(28) : null;
        log('audio_chunk', { model: speechProvider === 'cloudflare' ? CLOUDFLARE_MODEL : body.model, audioBytes: audio.length, audioSeconds,
          ...(speechProvider === 'groq' ? { minimumBillableSecondsEstimate: audioSeconds == null ? null : Math.max(10, audioSeconds) } : { audioSecondsEstimate: audioSeconds }) });
      } else log('answer_request', { provider: 'gemini', model: GEMINI_MODEL, streaming: body.stream === true, messages: body.messages.length, inputCharacters: body.messages.reduce((sum, message) => sum + message.content.length, 0) });
      const authorizationStarted = performance.now();
      await authorize(user, String(request.headers['x-usage-token'] || ''));
      log('authorized', { authorizationMs: Math.round(performance.now() - authorizationStarted) });
      let checking = false;
      watchdog = setInterval(async () => {
        if (checking) return; checking = true;
        try { await authorize(user, String(request.headers['x-usage-token'] || '')); } catch { controller.abort(); } finally { checking = false; }
      }, 5000);
      const providerStarted = performance.now();
      log('provider_start');
      let upstream = await fetchImpl(providerRequest.url, {
        method: 'POST', signal: controller.signal,
        headers: providerRequest.headers, body: providerRequest.body
      });
      const rateLimits = {};
      for (const name of ['x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'retry-after']) {
        const value = upstream.headers?.get(name); if (value != null) rateLimits[name] = value;
      }
      log('provider_headers', { status: upstream.status, rateLimits, providerHeadersMs: Math.round(performance.now() - providerStarted) });
      if (!upstream.ok) throw await providerFailure(upstream, kind === 'chat' ? 'gemini' : speechProvider);
      if (kind === 'transcribe' && speechProvider === 'cloudflare') {
        const result = await upstream.json().catch(() => null);
        if (!result || result.success !== true || typeof result.result?.text !== 'string') throw failure('Cloudflare returned an invalid or unsuccessful transcription response.', 502);
        if (controller.signal.aborted) throw failure('Transcription was cancelled or timed out.', 504);
        upstream = new Response(JSON.stringify({ text: result.result.text }), { headers: { 'content-type': 'application/json' } });
      }
      response.writeHead(200, { 'content-type': body.stream && kind === 'chat' ? 'text/event-stream' : 'application/json', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
      response.flushHeaders?.();
      const tap = createMetricsTap({ streaming: body.stream === true && kind === 'chat', metrics, firstToken: () => log(kind === 'chat' ? 'first_answer_text' : 'transcript_received', { providerElapsedMs: Math.round(performance.now() - providerStarted) }) });
      await pipeline(Readable.fromWeb(upstream.body), tap, response, { signal: controller.signal });
      log('completed', { providerTotalMs: Math.round(performance.now() - providerStarted), ...metrics, tokenUsageReported: metrics.tokens !== null });
    } catch (error) {
      log(controller.signal.aborted ? 'cancelled_or_timed_out' : 'failed', { status: error.status || 500, errorType: error.name,
        ...(error.reason ? { reason: error.reason, providerCode: error.providerCode, retryAfterSeconds: error.retryAfterSeconds } : {}) });
      throw error;
    } finally { clearInterval(watchdog); clearTimeout(timeout); response.removeListener('close', close); controller.abort(); release(); }
  }
  return { handle };
}
module.exports = { createAIProxy, createLimiter, geminiPayload, transcriptionPayload, providerFailure, retryAfterSeconds };
