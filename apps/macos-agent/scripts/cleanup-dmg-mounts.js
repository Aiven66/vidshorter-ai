#!/usr/bin/env node

const { execFileSync } = require('child_process');

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function detach(target) {
  try {
    run('hdiutil', ['detach', target]);
    console.log(`[cleanup-dmg-mounts] Detached ${target}`);
    return true;
  } catch (firstError) {
    try {
      run('hdiutil', ['detach', '-force', target]);
      console.log(`[cleanup-dmg-mounts] Force detached ${target}`);
      return true;
    } catch {}

    const msg = firstError.stderr?.toString?.().trim() || firstError.message;
    console.warn(`[cleanup-dmg-mounts] Could not detach ${target}: ${msg}`);
    return false;
  }
}

function isClipopImage(record) {
  const imagePath = record.match(/image-path\s+:\s+(.+)/)?.[1] || '';
  return /Clipop[- ]Agent/i.test(imagePath);
}

function collectDetachTargets(record) {
  const targets = new Set();

  for (const line of record.split('\n')) {
    const mountedVolume = line.match(/(\/Volumes\/Clipop Agent(?: \d+)?)/)?.[1];
    if (mountedVolume) {
      targets.add(mountedVolume);
      continue;
    }

    const disk = line.match(/^(\/dev\/disk\d+)\s+GUID_partition_scheme\s*$/)?.[1];
    if (disk) {
      targets.add(disk);
    }
  }

  return [...targets];
}

function main() {
  let info = '';
  try {
    info = run('hdiutil', ['info']);
  } catch (error) {
    const msg = error.stderr?.toString?.().trim() || error.message;
    throw new Error(`Unable to inspect mounted disk images: ${msg}`);
  }

  const targets = info
    .split('================================================')
    .filter(isClipopImage)
    .flatMap(collectDetachTargets);

  if (targets.length === 0) {
    console.log('[cleanup-dmg-mounts] No mounted Clipop Agent disk images found.');
    return;
  }

  console.log(`[cleanup-dmg-mounts] Found ${targets.length} Clipop Agent mount target(s).`);
  const failures = targets.filter(target => !detach(target));
  if (failures.length > 0) {
    throw new Error(
      `Could not detach ${failures.join(', ')}. Close Finder windows using Clipop Agent volumes and rerun the build.`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`[cleanup-dmg-mounts] ${error.message}`);
  process.exit(1);
}
