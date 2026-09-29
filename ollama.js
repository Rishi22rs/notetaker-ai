const http = require('node:http');

const HOST = '127.0.0.1';
const PORT = 11434;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: HOST, port: PORT, path: pathname, method: 'GET', timeout: 10_000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_RESPONSE_BYTES) req.destroy(new Error('Ollama response was too large.'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Ollama returned ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Ollama returned invalid JSON.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Ollama did not respond.')));
    req.on('error', reject);
    req.end();
  });
}

async function listModels() {
  const result = await request('/api/tags');
  return (result.models || []).map(({ name, size, modified_at: modifiedAt }) => ({ name, size, modifiedAt }));
}

function suggest({ model, draft, context, transcript = '' }) {
  return new Promise((resolve, reject) => {
    const textFiles = (context.files || []).filter((file) => file.kind === 'text' && file.content);
    const images = (context.files || []).filter((file) => file.kind === 'image' && file.content).map((file) => file.content).slice(0, 4);
    const contextText = [
      String(context.text || '').trim(),
      ...textFiles.map((file) => `--- ${file.name} ---\n${file.content}`)
    ].filter(Boolean).join('\n\n').slice(0, 60_000);
    const content = [
      'Generate exactly 3 likely autocomplete QUESTIONS the user may want to ask next.',
      'Return questions only. Never answer the question, provide facts, explanations, recommendations, or declarative statements.',
      'Each suggestion must be a complete, natural question ending with a question mark.',
      'Use the draft as the beginning or intent of the question. Use saved context and recent transcript only to infer the likely question.',
      'When the draft is empty, predict useful follow-up questions from the recent transcript and saved context.',
      'Do not produce generic templates. Keep each question under 100 characters.',
      'Return only JSON in this form: {"suggestions":["...","...","..."]}.',
      '', '<saved_context>', contextText, '</saved_context>',
      '', '<recent_transcript>', String(transcript).slice(-20_000), '</recent_transcript>',
      '', '<draft>', draft, '</draft>'
    ].join('\n');
    const payload = JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [{ role: 'user', content, ...(images.length ? { images } : {}) }],
      options: { temperature: 0.35 }
    });
    const req = http.request({
      hostname: HOST, port: PORT, path: '/api/chat', method: 'POST', timeout: 45_000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Ollama returned ${res.statusCode}`));
        try {
          const outer = JSON.parse(data);
          const parsed = JSON.parse(outer.message?.content || '{}');
          const suggestions = Array.isArray(parsed.suggestions)
            ? parsed.suggestions.map((value) => String(value).replace(/\s+/g, ' ').trim())
              .filter((value) => /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did|will|may|am|was|were|has|have|had)\b/i.test(value) && value.endsWith('?') && value.length <= 100)
              .slice(0, 3)
            : [];
          resolve(suggestions);
        } catch { reject(new Error('The model returned invalid suggestions.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Suggestion generation timed out.')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function classifyInterviewTurn({ model, turn, recentTurns = [] }) {
  return new Promise((resolve, reject) => {
    const dialogue = recentTurns.slice(-6)
      .map((item) => `${item.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${String(item.text || '').slice(0, 2000)}`)
      .join('\n');
    const content = [
      'Classify whether the final interviewer utterance asks the candidate to respond.',
      'Questions include implicit requests, prompts to elaborate, and interview tasks even without a question mark.',
      'Do not treat greetings, acknowledgements, transitions, or the candidate speaking as questions.',
      'Choose one type: behavioral, coding, system_design, technical, resume, follow_up, general.',
      'Return only JSON: {"isQuestion":true,"confidence":0.0,"type":"general","reason":"short reason"}.',
      '', '<recent_dialogue>', dialogue, '</recent_dialogue>',
      '', '<interviewer_utterance>', String(turn?.text || '').slice(0, 5000), '</interviewer_utterance>'
    ].join('\n');
    const payload = JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [{ role: 'user', content }],
      options: { temperature: 0 }
    });
    const req = http.request({
      hostname: HOST, port: PORT, path: '/api/chat', method: 'POST', timeout: 20_000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_RESPONSE_BYTES) req.destroy(new Error('Classifier response was too large.'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Ollama returned ${res.statusCode}`));
        try {
          const outer = JSON.parse(data);
          const parsed = JSON.parse(outer.message?.content || '{}');
          resolve(parsed);
        } catch { reject(new Error('The model returned an invalid classification.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Question classification timed out.')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function pullModel({ model, onProgress, onDone, onError }) {
  const payload = JSON.stringify({ model, stream: true });
  const req = http.request({
    hostname: HOST, port: PORT, path: '/api/pull', method: 'POST', timeout: 0,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
  });
  let buffer = '';
  let settled = false;
  const fail = (error) => { if (!settled) { settled = true; onError(error instanceof Error ? error : new Error(String(error))); } };
  req.on('response', (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) return fail(new Error(`Ollama returned ${res.statusCode}`));
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.error) return fail(new Error(item.error));
          onProgress({ status: item.status || 'Downloading', completed: item.completed || 0, total: item.total || 0 });
          if (item.status === 'success' && !settled) { settled = true; onDone(); }
        } catch { fail(new Error('Ollama returned invalid download progress.')); }
      }
    });
    res.on('error', fail);
  });
  req.on('error', fail);
  req.write(payload);
  req.end();
  return () => { settled = true; req.destroy(); };
}

function chat({ model, messages, onChunk, onDone, onError }) {
  const payload = JSON.stringify({ model, messages, stream: true });
  const req = http.request({
    hostname: HOST, port: PORT, path: '/api/chat', method: 'POST', timeout: 120_000,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
  });
  let buffer = '';
  let settled = false;
  const fail = (error) => {
    if (settled) return;
    settled = true;
    onError(error instanceof Error ? error : new Error(String(error)));
  };
  req.on('response', (res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      let details = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { details += chunk; });
      res.on('end', () => fail(new Error(`Ollama returned ${res.statusCode}: ${details.slice(0, 300)}`)));
      return;
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.error) { fail(new Error(item.error)); return; }
          if (item.message?.content) onChunk(item.message.content);
          if (item.done && !settled) { settled = true; onDone(); }
        } catch { fail(new Error('Ollama returned an invalid stream.')); }
      }
    });
    res.on('error', fail);
  });
  req.on('timeout', () => req.destroy(new Error('The model timed out.')));
  req.on('error', fail);
  req.write(payload);
  req.end();
  return () => { settled = true; req.destroy(); };
}

module.exports = { listModels, suggest, classifyInterviewTurn, pullModel, chat };
