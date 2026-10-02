#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { clearExtendedAttributes, finalizeMacApp } = require('./mac-package-utils');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const appPath = path.join(root, 'dist', 'mac-arm64', 'Clipop Agent.app');
const distDir = path.join(root, 'dist');
const volumeName = `Clipop Agent ${pkg.version}-arm64`;
const dmgPath = path.join(distDir, `Clipop Agent-${pkg.version}-arm64.dmg`);

function run(cmd, args, options = {}) {
  console.log(`[build-dmg-hybrid] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

function main() {
  if (!fs.existsSync(appPath)) {
    throw new Error(`Missing packaged app: ${appPath}`);
  }

  fs.mkdirSync(distDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipop-dmg-hybrid-'));
  const stageDir = path.join(tempDir, 'stage');
  const verifyMount = path.join(tempDir, 'verify-mount');

  try {
    fs.mkdirSync(stageDir);
    finalizeMacApp(appPath, { root });
    const stagedAppPath = path.join(stageDir, 'Clipop Agent.app');
    run('ditto', ['--norsrc', appPath, stagedAppPath]);
    fs.symlinkSync('/Applications', path.join(stageDir, 'Applications'));
    clearExtendedAttributes(stageDir);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', stagedAppPath]);

    if (fs.existsSync(dmgPath)) {
      fs.rmSync(dmgPath, { force: true });
    }

    // HFS makehybrid attaches FinderInfo to nested Electron helpers after
    // signing, which makes macOS report the dragged app as damaged. Create a
    // compressed APFS image directly from the metadata-free stage instead.
    run('hdiutil', [
      'create',
      '-fs',
      'APFS',
      '-volname',
      volumeName,
      '-srcfolder',
      stageDir,
      '-format',
      'UDZO',
      '-ov',
      dmgPath,
    ]);

    // Validate the artifact from the mounted image. A pre-image verification
    // is insufficient because filesystem metadata can invalidate the final
    // resource seal.
    fs.mkdirSync(verifyMount);
    run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', verifyMount]);
    try {
      run('/usr/bin/codesign', [
        '--verify', '--deep', '--strict', '--verbose=2',
        path.join(verifyMount, 'Clipop Agent.app'),
      ]);
    } finally {
      run('hdiutil', ['detach', verifyMount]);
    }

    console.log(`[build-dmg-hybrid] Created ${dmgPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`[build-dmg-hybrid] ${error.message}`);
  process.exit(1);
}
