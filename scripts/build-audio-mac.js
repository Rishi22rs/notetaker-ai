const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'native-audiotee/.build/release');
fs.mkdirSync(out, { recursive: true });
const overlay = path.join(out, 'sdk-overlay.json');
const moduleCache = path.join(out, 'module-cache');
fs.mkdirSync(moduleCache, { recursive: true });
fs.writeFileSync(overlay, JSON.stringify({ version: 0, roots: [{ type: 'file', name: '/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap', 'external-contents': path.join(__dirname, 'empty.modulemap') }] }));
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sources(path.join(dir, e.name)) : e.name.endsWith('.swift') ? [path.join(dir, e.name)] : []);
}
const flags = [
  '-O', '-target', 'arm64-apple-macosx14.2',
  '-module-cache-path', moduleCache,
  '-vfsoverlay', overlay,
  '-Xcc', '-ivfsoverlay', '-Xcc', overlay,
  '-Xcc', `-fmodules-cache-path=${moduleCache}`
];
execFileSync('swiftc', [...flags, '-emit-library', '-emit-module', '-module-name', 'AudioTeeCore', ...sources(path.join(root, 'native-audiotee/Sources/AudioTeeCore')), '-o', path.join(out, 'libAudioTeeCore.dylib'), '-emit-module-path', path.join(out, 'AudioTeeCore.swiftmodule'), '-Xlinker', '-install_name', '-Xlinker', '@rpath/libAudioTeeCore.dylib'], { stdio: 'inherit' });
execFileSync('swiftc', [...flags, '-I', out, '-L', out, '-lAudioTeeCore', '-Xlinker', '-rpath', '-Xlinker', '@executable_path', ...sources(path.join(root, 'native-audiotee/Sources/AudioTeeCLI')), '-o', path.join(out, 'audiotee')], { stdio: 'inherit' });
