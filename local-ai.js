const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MODELS = Object.freeze([
  {
    name: 'Qwen 2.5 1.5B Instruct',
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    description: 'Balanced · Recommended',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1_117_320_736,
    vision: false,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/a615a81362316d7b9f5a7a9c4313adfdf9b54588/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true'
  },
  {
    name: 'Qwen 2.5 0.5B Instruct',
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    description: 'Fastest · Basic answers',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491_400_032,
    vision: false,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/6dd44a1/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true'
  },
  {
    name: 'Qwen 2.5 3B Instruct',
    id: 'qwen2.5-3b-instruct-q4_k_m',
    description: 'Higher quality · 8 GB+ RAM',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    size: 2_104_932_768,
    vision: false,
    sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/af75b7aaf5bb163ce4c5dab4e6b84d844e96265d/qwen2.5-3b-instruct-q4_k_m.gguf?download=true'
  }
]);

function binaryName(platform = process.platform) {
  return platform === 'win32' ? 'llama-server.exe' : 'llama-server';
}

function runtimeDirectory(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function requestJson({ port, pathname, method = 'GET', body, timeout = 120_000 }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: HOST, port, path: pathname, method, timeout,
      headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : undefined
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_RESPONSE_BYTES) req.destroy(new Error('Local model response was too large.'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Local model returned ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { reject(new Error('Local model returned invalid JSON.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Local model timed out.')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function createLocalAI({ userDataPath, resourcesPath, appPath, isPackaged, platform = process.platform, arch = process.arch }) {
  const modelsDirectory = path.join(userDataPath, 'models');
  const runtimeRoot = isPackaged ? resourcesPath : path.join(appPath, 'vendor');
  const executable = path.join(runtimeRoot, 'llama', runtimeDirectory(platform, arch), binaryName(platform));
  let serverProcess = null;
  let serverPort = null;
  let loadedModel = null;
  let starting = null;

  const modelInfo = (id) => MODELS.find((item) => item.id === id);
  const modelPath = (model) => path.join(modelsDirectory, model.filename);

  async function listModels() {
    await fsp.mkdir(modelsDirectory, { recursive: true });
    const installed = [];
    for (const model of MODELS) {
      try {
        const stat = await fsp.stat(modelPath(model));
        if (stat.isFile() && stat.size > 0) installed.push({ name: model.id, displayName: model.name, description: model.description, size: stat.size, modifiedAt: stat.mtime.toISOString() });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return installed;
  }

  function stop() {
    starting = null;
    loadedModel = null;
    serverPort = null;
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
    serverProcess = null;
  }

  async function waitUntilReady(port, child) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`The bundled local AI runtime exited with code ${child.exitCode}.`);
      try { await requestJson({ port, pathname: '/health', timeout: 1_000 }); return; }
      catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    throw new Error('The bundled local AI runtime did not start in time.');
  }

  async function ensureServer(modelId) {
    if (serverProcess && loadedModel === modelId && serverPort) return serverPort;
    if (starting) return starting;
    starting = (async () => {
      const model = modelInfo(modelId);
      if (!model) throw new Error('Unknown local model.');
      if (!fs.existsSync(modelPath(model))) throw new Error('Download the local model before using it.');
      if (!fs.existsSync(executable)) throw new Error(`Bundled local AI runtime is missing (${runtimeDirectory(platform, arch)}). Reinstall the app.`);
      stop();
      const port = await findFreePort();
      const args = ['--model', modelPath(model), '--host', HOST, '--port', String(port), '--ctx-size', '8192', '--jinja'];
      const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let stderr = '';
      let spawnError = null;
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
      child.once('exit', () => {
        if (serverProcess === child) { serverProcess = null; serverPort = null; loadedModel = null; }
      });
      child.once('error', (error) => { spawnError = error; });
      try {
        await Promise.race([
          waitUntilReady(port, child),
          new Promise((resolve, reject) => child.once('error', reject))
        ]);
      }
      catch (error) { child.kill(); throw new Error(`${error.message}${stderr ? ` ${stderr.trim().slice(-500)}` : ''}`); }
      if (spawnError) throw spawnError;
      serverProcess = child;
      serverPort = port;
      loadedModel = modelId;
      return port;
    })().finally(() => { starting = null; });
    return starting;
  }

  function downloadModel({ model: modelId, onProgress, onDone, onError }) {
    const model = modelInfo(modelId);
    if (!model) { queueMicrotask(() => onError(new Error('Unknown local model.'))); return () => {}; }
    let cancelled = false;
    let request;
    const partial = `${modelPath(model)}.part`;

    const fail = async (error) => {
      if (cancelled) return;
      cancelled = true;
      await fsp.rm(partial, { force: true }).catch(() => {});
      onError(error instanceof Error ? error : new Error(String(error)));
    };
    const begin = async (url, redirects = 0) => {
      await fsp.mkdir(modelsDirectory, { recursive: true });
      request = https.get(url, { headers: { 'user-agent': 'NotetakerAI/1.0' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 8) {
          res.resume();
          begin(new URL(res.headers.location, url), redirects + 1).catch(fail);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); fail(new Error(`Model download returned ${res.statusCode}.`)); return; }
        const responseBytes = Number(res.headers['content-length']) || 0;
        const total = responseBytes || model.size;
        let completed = 0;
        const hash = crypto.createHash('sha256');
        const output = fs.createWriteStream(partial, { flags: 'w' });
        res.on('data', (chunk) => { completed += chunk.length; hash.update(chunk); onProgress({ status: 'Downloading', completed, total }); });
        res.on('error', fail);
        output.on('error', fail);
        output.on('finish', async () => {
          if (cancelled) return;
          try {
            if (responseBytes && completed !== responseBytes) throw new Error('Model download was incomplete.');
            if (hash.digest('hex') !== model.sha256) throw new Error('Model download failed its integrity check.');
            await fsp.rename(partial, modelPath(model));
            cancelled = true;
            onDone();
          } catch (error) { fail(error); }
        });
        res.pipe(output);
      });
      request.on('error', fail);
    };
    begin(model.url).catch(fail);
    return () => { cancelled = true; request?.destroy(); fsp.rm(partial, { force: true }).catch(() => {}); };
  }

  async function complete({ model, messages, temperature = 0.2 }) {
    const port = await ensureServer(model);
    const result = await requestJson({
      port, pathname: '/v1/chat/completions', method: 'POST',
      body: { model, messages, stream: false, temperature, response_format: { type: 'json_object' } }
    });
    return result.choices?.[0]?.message?.content || '';
  }

  async function suggest({ model, draft, context, transcript = '' }) {
    const textFiles = (context.files || []).filter((file) => file.kind === 'text' && file.content);
    const contextText = [String(context.text || '').trim(), ...textFiles.map((file) => `--- ${file.name} ---\n${file.content}`)].filter(Boolean).join('\n\n').slice(0, 60_000);
    const content = ['Generate exactly 3 likely autocomplete QUESTIONS the user may want to ask next.', 'Return questions only. Never answer the question, provide facts, explanations, recommendations, or declarative statements.', 'Each suggestion must be a complete, natural question ending with a question mark.', 'Return only JSON in this form: {"suggestions":["...","...","..."]}.', '', '<saved_context>', contextText, '</saved_context>', '', '<recent_transcript>', String(transcript).slice(-20_000), '</recent_transcript>', '', '<draft>', draft, '</draft>'].join('\n');
    const parsed = JSON.parse(await complete({ model, messages: [{ role: 'user', content }], temperature: 0.35 }) || '{}');
    return Array.isArray(parsed.suggestions) ? parsed.suggestions.map((value) => String(value).replace(/\s+/g, ' ').trim()).filter((value) => value.endsWith('?') && value.length <= 100).slice(0, 3) : [];
  }

  async function classifyInterviewTurn({ model, turn, recentTurns = [] }) {
    const dialogue = recentTurns.slice(-6).map((item) => `${item.speaker === 'user' ? 'Candidate' : 'Interviewer'}: ${String(item.text || '').slice(0, 2000)}`).join('\n');
    const content = ['Classify whether the final interviewer utterance asks the candidate to respond.', 'Choose one type: behavioral, coding, system_design, technical, resume, follow_up, general.', 'Return only JSON: {"isQuestion":true,"confidence":0.0,"type":"general","reason":"short reason"}.', '', '<recent_dialogue>', dialogue, '</recent_dialogue>', '', '<interviewer_utterance>', String(turn?.text || '').slice(0, 5000), '</interviewer_utterance>'].join('\n');
    return JSON.parse(await complete({ model, messages: [{ role: 'user', content }], temperature: 0 }) || '{}');
  }

  function chat({ model, messages, onChunk, onDone, onError }) {
    let cancelled = false;
    let req;
    ensureServer(model).then((port) => {
      if (cancelled) return;
      const payload = JSON.stringify({ model, messages: messages.map(({ role, content }) => ({ role, content })), stream: true, temperature: 0.2 });
      req = http.request({ hostname: HOST, port, path: '/v1/chat/completions', method: 'POST', timeout: 120_000, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } });
      let buffer = '';
      req.on('response', (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); onError(new Error(`Local model returned ${res.statusCode}.`)); return; }
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const value = line.replace(/^data:\s*/, '').trim();
            if (!value || value === '[DONE]') continue;
            try { const token = JSON.parse(value).choices?.[0]?.delta?.content; if (token) onChunk(token); }
            catch { /* Ignore SSE comments and incomplete metadata events. */ }
          }
        });
        res.on('end', () => { if (!cancelled) onDone(); });
        res.on('error', onError);
      });
      req.on('timeout', () => req.destroy(new Error('The local model timed out.')));
      req.on('error', (error) => { if (!cancelled) onError(error); });
      req.write(payload);
      req.end();
    }).catch((error) => { if (!cancelled) onError(error); });
    return () => { cancelled = true; req?.destroy(); };
  }

  return { listModels, suggest, classifyInterviewTurn, pullModel: downloadModel, chat, stop, executable, models: MODELS };
}

module.exports = { createLocalAI, MODELS, binaryName, runtimeDirectory };
