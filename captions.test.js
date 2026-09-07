const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(blockSpawn = false) {
  const events = [];
  const processes = [];
  const timers = new Set();
  const context = {
    module: { exports: {} }, __dirname,
    setTimeout(fn) { timers.add(fn); return fn; },
    clearTimeout(fn) { timers.delete(fn); },
    require(name) {
      if (name !== 'node:child_process') return require(name);
      return { spawn() {
        if (blockSpawn) throw new Error('Process launch blocked');
        const child = new EventEmitter();
        child.stdin = new PassThrough();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => { child.killed = true; };
        processes.push(child);
        return child;
      } };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./captions'), 'utf8'), context);
  return { captions: context.module.exports((event) => events.push(event)), events, processes, timers };
}

test('pause drops late transcripts, bounds shutdown, and allows restart', () => {
  const f = fixture();
  f.captions.start();
  f.captions.start();
  assert.equal(f.processes.length, 1);
  const child = f.processes[0];
  child.stdout.write('{"type":"transcript","text":"hello"}\n');
  assert.equal(f.events.at(-1).text, 'hello');
  let command = '';
  child.stdin.on('data', (data) => { command += data; });
  f.captions.toggle();
  assert.equal(command, 'stop\n');
  child.stdout.write('{"type":"transcript","text":"late"}\n');
  assert.equal(f.events.at(-1).text, 'Stopping...');
  for (const timer of f.timers) timer();
  assert.equal(child.killed, true);
  child.emit('close', 0);
  assert.equal(f.events.at(-1).text, 'Paused');
  assert.equal(f.timers.size, 0);
  f.captions.toggle();
  assert.equal(f.processes.length, 2);
  f.captions.dispose();
  assert.equal(f.processes[1].killed, true);
});

test('preserves worker errors and ignores malformed protocol lines', () => {
  const f = fixture();
  f.captions.start();
  const child = f.processes[0];
  child.stdout.write('dependency log\n{"type":"error","text":"No device"}\n');
  child.emit('close', 1);
  assert.equal(f.events.at(-1).text, 'No device');
});

test('missing Python produces an actionable setup error', () => {
  const f = fixture();
  f.captions.start();
  f.processes[0].emit('error', new Error('ENOENT'));
  f.processes[0].emit('close', -1);
  assert.match(f.events.at(-1).text, /setup:captions/);
});

test('blocked process launch reports an error without crashing the app', () => {
  const f = fixture(true);
  assert.doesNotThrow(() => f.captions.start());
  assert.match(f.events.at(-1).text, /Process launch blocked/);
});
