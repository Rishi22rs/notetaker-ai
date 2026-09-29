const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

module.exports = function createSystemAudio(onAudio) {
  let child;
  function stop() { child?.kill('SIGTERM'); child = null; }
  function start(probe = false) {
    stop();
    return new Promise((resolve, reject) => {
      const executable = app.isPackaged
        ? path.join(global.process.resourcesPath, 'audio-tap', 'audiotee')
        : path.join(__dirname, 'native-audiotee', '.build', 'release', 'audiotee');
      if (!fs.existsSync(executable)) {
        reject(new Error('System audio helper is missing. Run npm run build:audio:mac before starting the app.'));
        return;
      }
      const process = spawn(executable, ['--sample-rate', '16000', '--chunk-duration', '0.2']);
      child = process;
      let pending = Buffer.alloc(0);
      let settled = false;
      const timer = setTimeout(() => finish(new Error('System audio access timed out. Check System Audio Recording Only in Privacy & Security.')), 60000);
      function finish(error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error || probe) { process.kill('SIGTERM'); if (child === process) child = null; }
        if (error) reject(error); else resolve(true);
      }
      const lines = createInterface({ input: process.stderr });
      lines.on('line', (line) => {
        try {
          const event = JSON.parse(line);
          if (event.message_type === 'info' && event.data?.message === 'Audio device started successfully') finish();
          if (event.message_type === 'error') finish(new Error(event.data?.message || 'System audio capture failed'));
        } catch {}
      });
      process.on('error', finish);
      process.on('close', () => { lines.close(); finish(new Error('System audio capture stopped before starting.')); if (child === process) child = null; });
      process.stdout.on('data', (bytes) => {
        if (probe || child !== process) return;
        pending = Buffer.concat([pending, bytes]);
        const size = 16000 * 2 * 3;
        const overlap = Math.round(16000 * 2 * 0.75);
        while (pending.length >= size) {
          const floats = new Float32Array(size / 2);
          for (let i = 0; i < floats.length; i++) floats[i] = pending.readInt16LE(i * 2) / 32768;
          pending = pending.subarray(size - overlap);
          onAudio(new Uint8Array(floats.buffer));
        }
      });
    });
  }
  return { start, stop };
};
