const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const packageJson = require('../package.json');

const root = path.join(__dirname, '..');
const downloads = path.join(root, 'website', 'public', 'downloads');
const artifacts = [
  { platform: 'mac', source: `UNYON-${packageJson.version}-arm64.dmg`, target: `UNYON-${packageJson.version}-arm64.dmg`, architecture: 'arm64' },
  { platform: 'windows', source: `UNYON-Setup-${packageJson.version}-x64.exe`, target: `UNYON-Setup-${packageJson.version}-x64.exe`, architecture: 'x64' }
];

async function sha256(file) {
  const bytes = await fs.readFile(file);
  return { hash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

async function main() {
  const prepared = [];
  for (const artifact of artifacts) {
    const source = path.join(root, 'dist', artifact.source);
    prepared.push({ ...artifact, source, ...await sha256(source) });
  }

  await fs.mkdir(downloads, { recursive: true });
  const oldFiles = await fs.readdir(downloads).catch(() => []);
  for (const name of oldFiles) {
    if (/^UNYON-.*\.(?:dmg|exe)$/.test(name) && !prepared.some(item => item.target === name)) await fs.unlink(path.join(downloads, name));
  }
  for (const artifact of prepared) await fs.copyFile(artifact.source, path.join(downloads, artifact.target));

  const checksumText = prepared.map(item => `${item.hash}  ${item.target}`).join('\n') + '\n';
  const manifest = {
    version: packageJson.version,
    channel: packageJson.version.includes('-') ? 'beta' : 'stable',
    publishedAt: new Date().toISOString(),
    artifacts: Object.fromEntries(prepared.map(item => [item.platform, {
      architecture: item.architecture,
      url: `/downloads/${item.target}`,
      sha256: item.hash,
      size: item.size
    }]))
  };
  await Promise.all([
    fs.writeFile(path.join(downloads, 'SHA256SUMS.txt'), checksumText),
    fs.writeFile(path.join(downloads, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  ]);
  console.log(`Staged UNYON ${packageJson.version} with SHA-256 checksums.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
