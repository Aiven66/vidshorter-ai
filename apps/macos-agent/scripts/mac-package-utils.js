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
  if (!fs.existsSync(root)) return;
  visitor(root);
  const stat = fs.lstatSync(root);
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
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
}

function finalizeMacApp(appPath, options = {}) {
  if (!fs.existsSync(appPath)) {
    throw new Error(`Missing app bundle: ${appPath}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipop-sign-'));
  const cleanAppPath = path.join(tempDir, path.basename(appPath));

  try {
    removeMetadataFiles(appPath);
    run('/usr/bin/ditto', ['--norsrc', appPath, cleanAppPath]);
    removeMetadataFiles(cleanAppPath);
    clearExtendedAttributes(cleanAppPath);
    signMacApp(cleanAppPath, options);
    clearExtendedAttributes(cleanAppPath);
    fs.rmSync(appPath, { recursive: true, force: true });
    run('/usr/bin/ditto', ['--norsrc', cleanAppPath, appPath]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
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
