const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const CLOUD_MODEL = `cloud:${GEMINI_MODEL}`;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

function providerError(provider, status) {
  if (provider === 'Gemini' && status === 404) return new Error('Gemini model is unavailable for this project. Restart the app to use Gemini 3.5 Flash-Lite; check model access in Google AI Studio if this persists.');
  if (status === 429) return new Error(`${provider} free-tier limit reached. Wait and try again; no automatic paid fallback is used.`);
  if ([401, 403].includes(status)) return new Error(`${provider} rejected the API key or access. Check Cloud settings.`);
  return new Error(`${provider} request failed (HTTP ${status}).`);
}

function createCloudAI({ getSettings, fetchImpl = fetch }) {
  async function request({ messages, json = false, signal }) {
    const settings = getSettings();
    if (!settings.geminiKey) throw new Error('Add a Gemini API key in AI & Models settings.');
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${settings.geminiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GEMINI_MODEL, messages, stream: false, temperature: 0.2,
        max_tokens: json ? 512 : 4096, reasoning_effort: 'low',
        ...(json ? { response_format: { type: 'json_object' } } : {}) })
    });
    if (!response.ok) {
      const body = typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
      throw typeof body.error === 'string' ? new Error(body.error) : providerError('Gemini', response.status);
    }
    const result = await response.json();
    const choice = result.choices?.[0];
    if (!choice?.message?.content) throw new Error('Gemini returned no answer. Try rephrasing the question.');
    if (choice.finish_reason === 'length') throw new Error('Gemini answer exceeded the response limit. Ask for a shorter solution.');
    return choice.message.content;
  }
  function chat({ messages, onChunk, onDone, onError }) {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      const settings = getSettings();
      if (!settings.geminiKey) throw new Error('Add a Gemini API key in AI & Models settings.');
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
        headers: { Authorization: `Bearer ${settings.geminiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GEMINI_MODEL, messages: messages.map(({role, content}) => ({role, content})),
          stream: true, temperature: 0.2, max_tokens: 4096, reasoning_effort: 'low' })
      });
      if (!response.ok) {
      const body = typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
      throw typeof body.error === 'string' ? new Error(body.error) : providerError('Gemini', response.status);
    }
      let buffer = '', received = false, finished = false;
      const decoder = new TextDecoder();
      function line(value) {
        if (!value.startsWith('data:')) return;
        const data = value.slice(5).trim();
        if (!data) return;
        if (data === '[DONE]') { finished = true; return; }
        const event = JSON.parse(data);
        if (event.error) throw new Error('Gemini could not complete the answer.');
        const choice = event.choices?.[0];
        if (choice?.finish_reason === 'length') throw new Error('Gemini answer exceeded the response limit. Ask for a shorter solution.');
        if (choice?.finish_reason === 'content_filter') throw new Error('Gemini declined this answer.');
        if (choice?.finish_reason === 'stop') finished = true;
        if (choice?.delta?.content && !cancelled) { received = true; onChunk(choice.delta.content); }
      }
      for await (const bytes of response.body) {
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const value of lines) line(value);
      }
      buffer += decoder.decode(); if (buffer.trim()) line(buffer);
      if (!received || !finished) throw new Error('Gemini returned an incomplete answer. Try again.');
      if (!cancelled) onDone();
    })().catch(error => { controller.abort(); if (!cancelled) onError(error); });
    return () => { cancelled = true; controller.abort(); };
  }

  return { chat, complete: ({ messages }) => request({ messages, json: true, signal: AbortSignal.timeout(30_000) }) };
}
module.exports = { createCloudAI, CLOUD_MODEL, GEMINI_MODEL, providerError };
