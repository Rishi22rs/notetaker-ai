const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalAI, MODELS, binaryName, runtimeDirectory } = require('./local-ai');

test('uses a bundled platform runtime and stores downloaded models in user data', async (t) => {
  const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'local-ai-test-'));
  t.after(() => fsp.rm(userDataPath, { recursive: true, force: true }));
  const client = createLocalAI({ userDataPath, resourcesPath: '/app/resources', appPath: '/source', isPackaged: true, platform: 'darwin', arch: 'arm64' });
  assert.equal(client.executable, path.join('/app/resources', 'llama', 'darwin-arm64', 'llama-server'));
  assert.deepEqual(await client.listModels(), []);
  assert.equal(binaryName('win32'), 'llama-server.exe');
  assert.equal(runtimeDirectory('darwin', 'arm64'), 'darwin-arm64');
});

test('model catalog downloads GGUF files directly and never depends on Ollama', () => {
  assert.equal(MODELS.length, 3);
  assert.equal(new Set(MODELS.map((model) => model.id)).size, MODELS.length);
  for (const model of MODELS) {
    assert.match(model.filename, /\.gguf$/);
    assert.match(model.url, /^https:\/\/huggingface\.co\/Qwen\//);
    assert.match(model.sha256, /^[a-f0-9]{64}$/);
  }
  const source = fs.readFileSync(require.resolve('./local-ai'), 'utf8');
  assert.match(source, /127\.0\.0\.1/);
  assert.doesNotMatch(source, /11434|ollama/i);
});

test('suggestions remain questions informed by transcript context', () => {
  const source = fs.readFileSync(require.resolve('./local-ai'), 'utf8');
  assert.match(source, /autocomplete QUESTIONS/);
  assert.match(source, /Never answer the question/);
  assert.match(source, /<recent_transcript>/);
  assert.match(source, /endsWith\('\?'\)/);
});
