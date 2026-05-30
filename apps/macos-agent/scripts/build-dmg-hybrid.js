#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
  const rawDmgPath = path.join(tempDir, 'Clipop Agent.raw.dmg');

  try {
    fs.mkdirSync(stageDir);
    run('ditto', [appPath, path.join(stageDir, 'Clipop Agent.app')]);
    fs.symlinkSync('/Applications', path.join(stageDir, 'Applications'));

    if (fs.existsSync(dmgPath)) {
      fs.rmSync(dmgPath, { force: true });
    }

    run('hdiutil', [
      'makehybrid',
      '-hfs',
      '-hfs-volume-name',
      volumeName,
      '-o',
      rawDmgPath,
      stageDir,
    ]);

    run('hdiutil', [
      'convert',
      rawDmgPath,
      '-format',
      'UDZO',
      '-o',
      dmgPath,
    ]);

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
