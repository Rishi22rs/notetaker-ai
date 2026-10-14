const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const { createMetricsTap } = require('./ai-metrics');
const { GEMINI_MODEL } = require('../cloud-ai');
function failure(message, status) { return Object.assign(new Error(message), { status, publicMessage: message }); }
function createLimiter({ maxConcurrent = 100, perUserConcurrent = 4, perMinute = 120 } = {}) {
  const users = new Map(); let active = 0;
  return key => {
    const now = Date.now();
    for (const [id, value] of users) if (!value.active && now - value.started > 60000) users.delete(id);
    const value = users.get(key) || { active: 0, count: 0, started: now };
    if (now - value.started >= 60000) { value.count = 0; value.started = now; }
    if (active >= maxConcurrent || value.active >= perUserConcurrent || value.count >= perMinute) throw failure('AI request limit reached. Please try again shortly.', 429);
    value.count++; value.active++; active++; users.set(key, value);
    let released = false;
    return () => { if (!released) { released = true; value.active--; active--; } };
  };
}
function geminiPayload(body) {
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 || body.messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw failure('Invalid AI messages.', 400);
  return { model: GEMINI_MODEL, messages: body.messages.map(({ role, content }) => ({ role, content })), stream: body.stream === true, ...(body.stream === true ? { stream_options: { include_usage: true } } : {}), temperature: 0.2, max_tokens: body.response_format ? 512 : 4096, reasoning_effort: 'low', ...(body.response_format ? { response_format: { type: 'json_object' } } : {}) };
}
function transcriptionPayload(body) {
  if (!['whisper-large-v3-turbo', 'whisper-large-v3'].includes(body.model) || !['auto', 'en', 'hi'].includes(body.language || 'auto') || typeof body.audio !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.audio)) throw failure('Invalid transcription request.', 400);
  const audio = Buffer.from(body.audio, 'base64');
  if (audio.length < 44 || audio.length > 1000000 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw failure('Invalid or oversized audio.', 400);
  const form = new FormData(); form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav'); form.append('model', body.model); form.append('response_format', 'json');
  if (body.language && body.language !== 'auto') form.append('language', body.language);
  form.append('prompt', 'Interview conversation in Hindi and English. Preserve spoken language and technical terms.');
  return form;
}
function createAIProxy({ config, authorize, fetchImpl = fetch, logger = console.log }) {
  const acquire = createLimiter();
  async function handle({ request, response, user, kind, readJson }) {
    const started = performance.now();
    const requestId = randomUUID();
    const metrics = { responseBytes: 0, outputCharacters: 0, tokens: null };
    const log = (event, details = {}) => logger('[AI]', JSON.stringify({ timestamp: new Date().toISOString(), requestId, kind, event, elapsedMs: Math.round(performance.now() - started), ...details }));
    log('received');
    let release;
    try { release = acquire(String(user._id)); } catch (error) { log('rate_limited', { status: error.status }); throw error; }
    const controller = new AbortController();
    const close = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', close);
    const timeout = setTimeout(() => controller.abort(), 60000);
    let watchdog;
    try {
      const key = kind === 'chat' ? config.geminiApiKey : config.groqApiKey;
      if (!key) throw failure(`${kind === 'chat' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'} is missing from the backend environment. Configure it and restart the backend.`, 503);
      const body = await readJson(request, 1500000);
      const payload = kind === 'chat' ? JSON.stringify(geminiPayload(body)) : transcriptionPayload(body);
      if (kind === 'transcribe') {
        const audio = Buffer.from(body.audio, 'base64');
        const audioSeconds = audio.readUInt32LE(28) > 0 ? (audio.length - 44) / audio.readUInt32LE(28) : null;
        log('audio_chunk', { provider: 'groq', model: body.model, audioBytes: audio.length, audioSeconds, minimumBillableSecondsEstimate: audioSeconds == null ? null : Math.max(10, audioSeconds) });
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
      const upstream = await fetchImpl(kind === 'chat' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : 'https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, ...(kind === 'chat' ? { 'content-type': 'application/json' } : {}) }, body: payload
      });
      log('provider_headers', { status: upstream.status, providerHeadersMs: Math.round(performance.now() - providerStarted) });
      if (!upstream.ok) throw failure(upstream.status === 429 ? 'Provider rate limit reached. Try again shortly.' : `Cloud provider rejected this request (HTTP ${upstream.status}). Check the backend key, model access and provider account.`, upstream.status === 429 ? 429 : 502);
      response.writeHead(200, { 'content-type': body.stream && kind === 'chat' ? 'text/event-stream' : 'application/json', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
      response.flushHeaders?.();
      const tap = createMetricsTap({ streaming: body.stream === true && kind === 'chat', metrics, firstToken: () => log(kind === 'chat' ? 'first_answer_text' : 'transcript_received', { providerElapsedMs: Math.round(performance.now() - providerStarted) }) });
      await pipeline(Readable.fromWeb(upstream.body), tap, response, { signal: controller.signal });
      log('completed', { providerTotalMs: Math.round(performance.now() - providerStarted), ...metrics, tokenUsageReported: metrics.tokens !== null });
    } catch (error) {
      log(controller.signal.aborted ? 'cancelled_or_timed_out' : 'failed', { status: error.status || 500, errorType: error.name });
      throw error;
    } finally { clearInterval(watchdog); clearTimeout(timeout); response.removeListener('close', close); controller.abort(); release(); }
  }
  return { handle };
}
module.exports = { createAIProxy, createLimiter, geminiPayload, transcriptionPayload };
