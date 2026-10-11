const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { app } = require('electron');
const { createTranscriptionQueue } = require('./transcription-audio');

module.exports = function createTranscription(publish) {
  let child = null;
  let complete = null;
  const queue = createTranscriptionQueue({
    processAudio: (speaker, bytes, capturedAt) => {
      if (!child?.stdin.writable) return;
      return new Promise((resolve) => {
        complete = resolve;
        child.stdin.write(`${JSON.stringify({ speaker, capturedAt, audio: bytes.toString('base64') })}\n`);
      });
    },
    onError: error => publish({ type: 'warning', text: error.message }),
    onLag: () => publish({ type: 'warning', text: 'Transcription cannot keep up. Some older audio was skipped to keep captions current.' })
  });
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  const bundledWorker = path.join(base, 'python-worker', 'transcribe-worker', process.platform === 'win32' ? 'transcribe-worker.exe' : 'transcribe-worker');
  const python = process.platform === 'win32' ? path.join(base, '.venv', 'Scripts', 'python.exe') : path.join(base, '.venv', 'bin', 'python');

  function start() {
    if (child) return;
    queue.clear();
    // Development must run the current worker source, rather than an older
    // PyInstaller bundle that may not acknowledge completed audio packets.
    const packaged = fs.existsSync(bundledWorker) && (app.isPackaged || !fs.existsSync(python));
    if (!packaged && !fs.existsSync(python)) {
      publish({ type: 'error', text: 'Local transcription is not installed. Run npm run setup:transcription:win.' });
      return;
    }
    const process = spawn(packaged ? bundledWorker : python, packaged ? [] : ['-u', path.join(base, 'transcribe_stream.py')], {
      cwd: base, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...global.process.env, TRANSCRIPTION_MODEL_DIR: path.join(base, 'models', 'tiny.en') }
    });
    child = process;
    let stderr = '';
    publish({ type: 'status', text: 'Starting transcription…' });
    const lines = readline.createInterface({ input: process.stdout });
    lines.on('line', (line) => {
      if (child !== process) return;
      try {
        const event = JSON.parse(line);
        if (event.type === 'processed') {
          const resolve = complete;
          complete = null;
          resolve?.();
        } else publish(event);
      } catch {}
    });
    process.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    process.stdin.on('error', () => {});
    process.on('error', (error) => publish({ type: 'error', text: error.message }));
    process.on('close', (code) => {
      lines.close();
      if (child === process) {
        child = null;
        queue.clear();
        complete?.(); complete = null;
        if (code && stderr.trim()) publish({ type: 'error', text: stderr.trim().slice(-1000) });
        else if (code) publish({ type: 'error', text: `Local transcription stopped with code ${code}. Run npm run setup:transcription:win.` });
        else publish({ type: 'status', text: 'Stopped' });
      }
    });
  }

  function audio(speaker, bytes) {
    if (!child?.stdin.writable) return;
    queue.enqueue(speaker, bytes);
  }

  function stop() {
    if (!child) return;
    const worker = child;
    child = null;
    queue.clear();
    complete?.(); complete = null;
    worker.kill();
    publish({ type: 'status', text: 'Stopped' });
  }

  return { start, stop, audio, dispose: stop };
};
