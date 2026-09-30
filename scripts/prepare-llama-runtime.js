const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TAG = process.env.LLAMA_CPP_TAG || 'b10938';
const platform = process.platform;
const arch = process.arch;
const platformAsset = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'win-cpu' : null;
const extension = platform === 'darwin' ? 'tar.gz' : 'zip';

if (!platformAsset || !['arm64', 'x64'].includes(arch)) {
  throw new Error(`No bundled llama.cpp runtime is configured for ${platform}-${arch}.`);
}

const asset = `llama-${TAG}-bin-${platformAsset}-${arch}.${extension}`;
const url = `https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${asset}`;
const destination = path.join(__dirname, '..', 'vendor', 'llama', `${platform}-${arch}`);

function download(source, target, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(source, { headers: { 'user-agent': 'NotetakerAI build' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && redirects < 8) {
        response.resume();
        download(new URL(response.headers.location, source), target, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Runtime download returned ${response.statusCode}.`));
        return;
      }
      const output = fs.createWriteStream(target);
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      response.on('error', reject);
      output.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'notetaker-llama-'));
  const archive = path.join(temporary, asset);
  const extracted = path.join(temporary, 'extracted');
  await fsp.mkdir(extracted);
  console.log(`Downloading llama.cpp ${TAG} for ${platform}-${arch}…`);
  await download(url, archive);
  if (platform === 'darwin') execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', extracted]);
  else execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive', '-LiteralPath', archive, '-DestinationPath', extracted, '-Force']);
  const queue = [extracted];
  let binary;
  while (queue.length && !binary) {
    const directory = queue.shift();
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(item);
      else if (entry.name === (platform === 'win32' ? 'llama-server.exe' : 'llama-server')) { binary = item; break; }
    }
  }
  if (!binary) throw new Error('The downloaded archive did not contain llama-server.');
  await fsp.rm(destination, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.cp(path.dirname(binary), destination, { recursive: true });
  // Release archives use absolute symlinks after extraction on macOS. Rewrite
  // them to sibling-relative links so they remain valid inside the .app bundle.
  if (platform === 'darwin') {
    for (const entry of await fsp.readdir(destination, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const item = path.join(destination, entry.name);
      const target = path.basename(await fsp.readlink(item));
      await fsp.unlink(item);
      await fsp.symlink(target, item);
    }
  }
  if (platform !== 'win32') await fsp.chmod(path.join(destination, 'llama-server'), 0o755);
  await fsp.rm(temporary, { recursive: true, force: true });
  console.log(`Runtime ready at ${destination}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
