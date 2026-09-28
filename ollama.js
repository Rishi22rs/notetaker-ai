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

function suggest({ model, draft, context }) {
  return new Promise((resolve, reject) => {
    const textFiles = (context.files || []).filter((file) => file.kind === 'text' && file.content);
    const images = (context.files || []).filter((file) => file.kind === 'image' && file.content).map((file) => file.content).slice(0, 4);
    const contextText = [
      String(context.text || '').trim(),
      ...textFiles.map((file) => `--- ${file.name} ---\n${file.content}`)
    ].filter(Boolean).join('\n\n').slice(0, 60_000);
    const content = [
      'Generate exactly 3 useful autocomplete prompts for the user.',
      'Each suggestion must naturally complete or expand the user draft and must use specific facts or topics from the supplied context.',
      'Do not produce generic templates. Keep each suggestion under 100 characters.',
      'Return only JSON in this form: {"suggestions":["...","...","..."]}.',
      '', '<context>', contextText, '</context>', '', '<draft>', draft, '</draft>'
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
          const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean).slice(0, 3) : [];
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

module.exports = { listModels, suggest, pullModel, chat };
