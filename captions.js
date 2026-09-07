const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

module.exports = function createCaptions(publish) {
  let child = null;
  let stopping = false;
  let killTimer;

  function start() {
    if (child) return;
    stopping = false;
    let process;
    try {
      process = spawn(path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
        ['-u', path.join(__dirname, 'transcribe.py')],
        { cwd: __dirname, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      publish({ type: 'error', text: `Could not start local captions: ${error.message}` });
      return;
    }
    child = process;
    let failed = false;
    let diagnostic = '';
    publish({ type: 'status', text: 'Starting local captions...' });
    const lines = readline.createInterface({ input: process.stdout });
    lines.on('line', (line) => {
      if (stopping || child !== process) return;
      try {
        const event = JSON.parse(line);
        if (event.type === 'error') failed = true;
        if (['status', 'transcript', 'error'].includes(event.type)) publish(event);
      } catch { /* Ignore non-protocol dependency output. */ }
    });
    process.stderr.on('data', (data) => { diagnostic = (diagnostic + data).slice(-2000); });
    process.stdin.on('error', () => {});
    process.on('error', () => {
      failed = true;
      publish({ type: 'error', text: 'Could not start Python. Run npm run setup:captions.' });
    });
    process.on('close', () => {
      clearTimeout(killTimer);
      lines.close();
      child = null;
      if (stopping) publish({ type: 'status', text: 'Paused' });
      else if (!failed) publish({ type: 'error', text: diagnostic.trim() || 'Audio capture stopped. Press Ctrl+Shift+S to retry.' });
    });
  }

  function stop() {
    if (!child || stopping) return;
    stopping = true;
    publish({ type: 'status', text: 'Stopping...' });
    child.stdin.end('stop\n');
    const process = child;
    killTimer = setTimeout(() => process.kill(), 1500);
  }

  return { start, stop, toggle() { if (child) stop(); else start(); },
    dispose() { clearTimeout(killTimer); stopping = true; if (child) child.kill(); } };
};
