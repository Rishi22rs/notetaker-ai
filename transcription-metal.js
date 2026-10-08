const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { app } = require('electron');
const { isLikelyAcousticEcho } = require('./audio-echo-filter');

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
  // Keep quiet speech. Silero VAD and Whisper's probabilities provide the
  // stronger rejection later; a high energy gate here was clipping words.
  return rms >= 0.003 && peak >= 0.012;
}

function cleanText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || /^\[(music|silence|applause|blank_audio)\]$/i.test(text)) return '';
  if (/^(thank you( for watching)?|thanks for watching|please subscribe|subtitles by|you)[.!]?$/i.test(text)) return '';
  if (/\b(www\.|\.com\b|subscribe to (my|the) channel)\b/i.test(text)) return '';
  const words = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 6 && new Set(words).size <= Math.ceil(words.length / 3)) return '';
  return text;
}

module.exports = function createMetalTranscription(publish) {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  const binDir = app.isPackaged ? path.join(base, 'whisper-metal', 'bin') : path.join(base, '.whisper.cpp', 'build', 'bin');
  const serverPath = path.join(binDir, 'whisper-server');
  const modelPath = app.isPackaged
    ? path.join(base, 'whisper-metal', 'models', 'ggml-tiny.en.bin')
    : path.join(base, '.whisper.cpp', 'models', 'ggml-tiny.en.bin');
  const vadPath = app.isPackaged
    ? path.join(base, 'whisper-metal', 'models', 'ggml-silero-v6.2.0.bin')
    : path.join(base, '.whisper.cpp', 'models', 'ggml-silero-v6.2.0.bin');
  let child = null;
  let port = null;
  let running = false;
  let ready = false;
  let launchId = 0;
  let backendName = 'Whisper Metal (tiny.en)';
  let queue = Promise.resolve();
  const lastText = new Map();
  const computerAudioHistory = [];

  async function waitUntilReady(id, useGpu, cpuRetry) {
    // CPU initialization can take appreciably longer on a cold production
    // install than it does in development. Give it a real startup window.
    const attempts = useGpu ? 150 : 300;
    for (let attempt = 0; attempt < attempts && running && id === launchId; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        // Any HTTP response proves the loopback server is listening; the root
        // route can legitimately be 404 when the optional web UI is omitted.
        if (response) { ready = true; publish({ type: 'ready', text: `Listening · ${backendName}` }); return; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (running && !ready && id === launchId) {
      if (child) {
        if (!useGpu && !cpuRetry) {
          publish({ type: 'warning', text: 'Whisper CPU startup is taking longer than expected. Retrying once…' });
        }
        if (useGpu) publish({ type: 'warning', text: 'Metal startup timed out. Switching to the local CPU backend…' });
        child.kill();
      } else {
        publish({ type: 'error', text: `${backendName} did not start. Check the app logs for the native Whisper error.` });
      }
    }
  }

  async function launch(useGpu, cpuRetry = false) {
    ready = false;
    port = await getFreePort();
    const id = ++launchId;
    backendName = useGpu ? 'Whisper Metal (tiny.en)' : 'Whisper CPU fallback (tiny.en)';
    const args = [
      '-m', modelPath, '-l', 'en', '-nf', '-sns', '-nth', '0.72',
      '--vad', '-vm', vadPath, '-vt', '0.62', '-vspd', '300', '-vsd', '180', '-vp', '120',
      '--host', '127.0.0.1', '--port', String(port)
    ];
    if (!useGpu) args.unshift('--no-gpu');
    child = spawn(serverPath, args, {
      cwd: binDir,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, DYLD_LIBRARY_PATH: binDir }
    });
    publish({ type: 'status', text: useGpu ? 'Loading Whisper on Apple Metal…' : 'Metal unavailable; loading Whisper on CPU…' });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
      process.stderr.write(`[whisper] ${chunk}`);
    });
    child.once('error', (error) => publish({ type: 'error', text: `Whisper Metal: ${error.message}` }));
    child.once('close', (code, signal) => {
      if (id !== launchId) return;
      child = null; ready = false;
      if (!running) return;
      if (useGpu) {
        publish({ type: 'warning', text: 'Metal could not initialize. Switching to the local CPU backend…' });
        launch(false).catch((error) => publish({ type: 'error', text: `Whisper fallback: ${error.message}` }));
        return;
      }
      if (!cpuRetry) {
        publish({ type: 'warning', text: 'Whisper CPU backend stopped while starting. Retrying once…' });
        launch(false, true).catch((error) => publish({ type: 'error', text: `Whisper fallback: ${error.message}` }));
        return;
      }
      running = false;
      const detail = stderr.match(/(?:error:|failed|couldn't)[^\n]*/i)?.[0] || stderr.trim().split('\n').at(-1);
      publish({ type: 'error', text: `Whisper stopped${detail ? `: ${detail}` : ` (code ${code ?? signal ?? 'unknown'})`}.` });
    });
    waitUntilReady(id, useGpu, cpuRetry);
  }

  async function start() {
    if (running) return;
    if (!fs.existsSync(serverPath) || !fs.existsSync(modelPath) || !fs.existsSync(vadPath)) {
      publish({ type: 'error', text: 'Whisper Metal is not installed. Run npm run setup:transcription:mac.' });
      return;
    }
    running = true;
    await launch(true);
  }

  async function transcribe(speaker, bytes, capturedAt) {
    if (!running || !ready) return;
    const raw = Buffer.from(bytes);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    if (!usableSpeech(samples)) return;
    const form = new FormData();
    form.append('file', new Blob([wavFromFloat32(samples)], { type: 'audio/wav' }), `${speaker}.wav`);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');
    form.append('temperature_inc', '0.0');
    form.append('no_speech_thold', '0.72');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const segments = Array.isArray(result.segments) ? result.segments : [];
      if (!segments.length) return;
      const credible = segments.filter((segment) => {
        const probabilities = Array.isArray(segment.words)
          ? segment.words.map((word) => Number(word.probability)).filter(Number.isFinite)
          : [];
        const wordConfidence = probabilities.length
          ? probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length
          : 0;
        return Number(segment.no_speech_prob ?? 1) < 0.75 &&
          Number(segment.avg_logprob ?? -10) > -1.25 &&
          (!probabilities.length || wordConfidence >= 0.3);
      });
      if (!credible.length) return;
      const text = cleanText(credible.map((segment) => segment.text).join(' '));
      if (!text || text.toLowerCase() === lastText.get(speaker)) return;
      lastText.set(speaker, text.toLowerCase());
      publish({ type: 'transcript', speaker, text, capturedAt });
    } catch (error) {
      if (running) publish({ type: 'warning', text: `Transcription skipped: ${error.message}` });
    }
  }

  function audio(speaker, bytes) {
    const capturedAt = Date.now();
    const raw = Buffer.from(bytes);
    const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
    if (speaker === 'computer') {
      computerAudioHistory.push({ capturedAt, samples: new Float32Array(samples) });
      while (computerAudioHistory[0]?.capturedAt < capturedAt - 8_000) computerAudioHistory.shift();
    } else if (speaker === 'user') {
      const isEcho = computerAudioHistory.some((item) =>
        Math.abs(capturedAt - item.capturedAt) <= 5_000 && isLikelyAcousticEcho(samples, item.samples));
      if (isEcho) return;
    }
    queue = queue.then(() => transcribe(speaker, bytes, capturedAt));
  }

  function stop() {
    running = false; ready = false;
    launchId += 1;
    child?.kill(); child = null;
    computerAudioHistory.length = 0;
    publish({ type: 'status', text: 'Stopped' });
  }

  return { start, stop, audio, dispose: stop };
};
