const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(require('electron'), [path.join(__dirname, '..')], {
  stdio: 'inherit', env: { ...process.env, REACTOTRON: '1' }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
