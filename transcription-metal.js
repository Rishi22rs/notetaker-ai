const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { app } = require('electron');

function wavFromFloat32(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    pcm.writeInt16LE(value < 0 ? value * 32768 : value * 32767, index * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function usableSpeech(samples) {
  let sum = 0;
  let peak = 0;
  for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms >= 0.007 && peak >= 0.025;
}

function cleanText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || /^\[(music|silence|applause|blank_audio)\]$/i.test(text)) return '';
  const words = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 6 && new Set(words).size <= Math.ceil(words.length / 3)) return '';
  return text;
}

module.exports = function createMetalTranscription(publish) {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  const binDir = app.isPackaged ? path.join(base, 'whisper-metal', 'bin') : path.join(base, '.whisper.cpp', 'build', 'bin');
  const serverPath = path.join(binDir, 'whisper-server');
  const modelPath = app.isPackaged
    ? path.join(base, 'whisper-metal', 'models', 'ggml-base.en.bin')
    : path.join(base, '.whisper.cpp', 'models', 'ggml-base.en.bin');
  let child = null;
  let port = null;
  let running = false;
  let ready = false;
  let queue = Promise.resolve();
  const lastText = new Map();

  async function waitUntilReady() {
    for (let attempt = 0; attempt < 80 && running; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        // Any HTTP response proves the loopback server is listening; the root
        // route can legitimately be 404 when the optional web UI is omitted.
        if (response) { ready = true; publish({ type: 'ready', text: 'Listening · Whisper Metal (base.en)' }); return; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (running && !ready) publish({ type: 'error', text: 'Whisper Metal did not start.' });
  }

  async function start() {
    if (running) return;
    if (!fs.existsSync(serverPath) || !fs.existsSync(modelPath)) {
      publish({ type: 'error', text: 'Whisper Metal is not installed. Run npm run setup:transcription:mac.' });
      return;
    }
    running = true;
    ready = false;
    port = await getFreePort();
    child = spawn(serverPath, ['-m', modelPath, '-l', 'en', '-nf', '-sns', '-nth', '0.72', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: binDir,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, DYLD_LIBRARY_PATH: binDir }
    });
    publish({ type: 'status', text: 'Loading Whisper on Apple Metal…' });
    child.stderr.resume();
    child.once('error', (error) => publish({ type: 'error', text: `Whisper Metal: ${error.message}` }));
    child.once('close', () => {
      child = null; ready = false;
      if (running) { running = false; publish({ type: 'error', text: 'Whisper Metal stopped unexpectedly.' }); }
    });
    waitUntilReady();
  }

  async function transcribe(speaker, bytes) {
    if (!running || !ready) return;
    const raw = Buffer.from(bytes);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    if (!usableSpeech(samples)) return;
    const form = new FormData();
    form.append('file', new Blob([wavFromFloat32(samples)], { type: 'audio/wav' }), `${speaker}.wav`);
    form.append('response_format', 'json');
    form.append('temperature', '0.0');
    form.append('temperature_inc', '0.0');
    form.append('no_speech_thold', '0.72');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const text = cleanText(result.text);
      if (!text || text.toLowerCase() === lastText.get(speaker)) return;
      lastText.set(speaker, text.toLowerCase());
      publish({ type: 'transcript', speaker, text });
    } catch (error) {
      if (running) publish({ type: 'warning', text: `Transcription skipped: ${error.message}` });
    }
  }

  function audio(speaker, bytes) {
    queue = queue.then(() => transcribe(speaker, bytes));
  }

  function stop() {
    running = false; ready = false;
    child?.kill(); child = null;
    publish({ type: 'status', text: 'Stopped' });
  }

  return { start, stop, audio, dispose: stop };
};
