const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const XATTRS_TO_REMOVE = [
  'com.apple.quarantine',
  'com.apple.provenance',
  'com.apple.FinderInfo',
  'com.apple.ResourceFork',
  'com.apple.macl',
  'com.apple.lastuseddate#PS',
  'com.apple.fileprovider.fpfs#P',
];

function run(cmd, args, options = {}) {
  console.log(`[mac-package] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

function runQuiet(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
  } catch {
    // Missing attributes are expected on most files.
  }
}

function walk(root, visitor) {
  // Use lstat (not existsSync): existsSync follows symlinks and returns false
  // for broken symlinks, which would skip them before the visitor could see
  // them (removeBrokenSymlinks relies on visiting every symlink).
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch {
    return;
  }
  visitor(root);
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(root)) {
    walk(path.join(root, entry), visitor);
  }
}

function removeMetadataFiles(root) {
  walk(root, (item) => {
    const name = path.basename(item);
    if (name === '.DS_Store' || name.startsWith('._')) {
      fs.rmSync(item, { force: true, recursive: true });
    }
  });
}

/**
 * Remove broken symlinks left behind by the extraResources slimming filters
 * (e.g. embedded-web/node_modules pnpm links whose targets were excluded).
 * codesign --deep --strict fails with "No such file or directory" when the
 * resource seal contains a symlink whose target is missing, so these MUST be
 * pruned before signing. All of them point to build-time-only packages that
 * the standalone server never requires at runtime.
 */
function removeBrokenSymlinks(root) {
  let removed = 0;
  walk(root, (item) => {
    let stat;
    try {
      stat = fs.lstatSync(item);
    } catch {
      return;
    }
    if (stat.isSymbolicLink() && !fs.existsSync(item)) {
      fs.rmSync(item, { force: true });
      removed += 1;
    }
  });
  if (removed > 0) console.log(`[mac-package] removed ${removed} broken symlinks (slimmed pnpm links)`);
}

function clearExtendedAttributes(root) {
  runQuiet('/usr/bin/xattr', ['-cr', root]);
  runQuiet('/usr/bin/dot_clean', ['-m', root]);
  walk(root, (item) => {
    for (const attr of XATTRS_TO_REMOVE) {
      runQuiet('/usr/bin/xattr', ['-d', attr, item]);
    }
  });
}

function resolveSigningIdentity() {
  const configured = process.env.CSC_NAME || process.env.MAC_CODESIGN_IDENTITY;
  if (configured && configured.trim()) return configured.trim();
  return '-';
}

function signMacApp(appPath, options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const entitlements = path.join(root, 'entitlements.mac.plist');
  const identity = resolveSigningIdentity();
  const args = [
    '--force',
    '--deep',
    '--options',
    'runtime',
    '--entitlements',
    entitlements,
    '--sign',
    identity,
    appPath,
  ];
  run('/usr/bin/codesign', args);
  // Verify — non-fatal when using ad-hoc signing (identity = '-')
  // macOS 15+ may reject ad-hoc signed apps with hardened runtime at verify time.
  try {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  } catch (e) {
    console.warn('[mac-package] codesign --verify failed (non-fatal for ad-hoc signing):', e.message);
  }
}

function finalizeMacApp(appPath, options = {}) {
  if (!fs.existsSync(appPath)) {
    throw new Error(`Missing app bundle: ${appPath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipop-sign-'));
  const cleanAppPath = path.join(tempDir, path.basename(appPath));

  try {
    removeMetadataFiles(appPath);
    removeBrokenSymlinks(appPath);
    run('/usr/bin/ditto', ['--norsrc', appPath, cleanAppPath]);
    removeMetadataFiles(cleanAppPath);
    removeBrokenSymlinks(cleanAppPath);
    clearExtendedAttributes(cleanAppPath);
    signMacApp(cleanAppPath, options);
    clearExtendedAttributes(cleanAppPath);
    fs.rmSync(appPath, { recursive: true, force: true });
    run('/usr/bin/ditto', ['--norsrc', cleanAppPath, appPath]);
    // Final verify — non-fatal for ad-hoc signing (see signMacApp)
    try {
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    } catch (e) {
      console.warn('[mac-package] final codesign --verify failed (non-fatal):', e.message);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  clearExtendedAttributes,
  finalizeMacApp,
  removeMetadataFiles,
  run,
};
