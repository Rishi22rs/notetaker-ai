const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

module.exports = function startSystemAudio(onStatus) {
  let ready = false;
  let child;
  let lines;
  let disposed = false;
  let failed = false;
  const fail = (text) => { ready = false; failed = true; onStatus(text, false); };
  try {
    child = spawn(path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
      ['-u', path.join(__dirname, 'system_audio.py')],
      { windowsHide: true, cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'] });
    lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (disposed) return;
      try {
        const event = JSON.parse(line);
        ready = event.type === 'ready';
        if (event.type === 'error') failed = true;
        onStatus(event.text, ready);
      } catch { /* Dependencies can print non-protocol diagnostics. */ }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', (error) => fail(`Audio bridge failed: ${error.message}`));
    child.on('close', () => {
      ready = false;
      lines.close();
      if (!disposed && !failed) fail('System audio stopped. Restart the app to reconnect.');
    });
  } catch (error) { fail(`Audio bridge failed: ${error.message}`); }
  return {
    isReady: () => ready,
    dispose() { disposed = true; ready = false; child?.kill(); lines?.close(); }
  };
};
