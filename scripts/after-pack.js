const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // A stable bundle identity is required for macOS TCC permissions to attach
  // to local development builds. Distribution builds can replace this ad-hoc
  // signature with a Developer ID signature without changing the app ID.
  execFileSync('/usr/bin/codesign', [
    '--deep', '--force', '--sign', '-',
    '--identifier', context.packager.appInfo.id,
    appPath
  ], { stdio: 'inherit' });
};
