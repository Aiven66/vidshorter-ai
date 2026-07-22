const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(cmd, args, cwd, env) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: env ? { ...process.env, ...env } : process.env });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

async function copyDir(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const items = await fsp.readdir(src, { withFileTypes: true });
  for (const it of items) {
    const s = path.join(src, it.name);
    const d = path.join(dst, it.name);
    if (it.isDirectory()) await copyDir(s, d);
    else if (it.isSymbolicLink()) {
      const link = await fsp.readlink(s);
      await fsp.rm(d, { recursive: true, force: true });
      await fsp.symlink(link, d);
    } else {
      await fsp.copyFile(s, d);
    }
  }
}

async function rmDirSafe(p) {
  try { await fsp.rm(p, { recursive: true, force: true }); } catch {}
}

async function cleanupEsbuildCopyArtifacts(root) {
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const entries = await fsp.readdir(pnpmDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('@esbuild+')) continue;
    const platformPackage = entry.name
      .slice('@esbuild+'.length)
      .replace(/@\d.*$/, '');
    const binDir = path.join(
      pnpmDir,
      entry.name,
      'node_modules',
      '@esbuild',
      platformPackage,
      'bin',
    );
    if (!fs.existsSync(binDir)) continue;
    const binEntries = await fsp.readdir(binDir);
    for (const name of binEntries) {
      if (/^esbuild \d+$/.test(name)) {
        await fsp.rm(path.join(binDir, name), { force: true });
      }
    }
  }
}

/**
 * Patch linkify.mjs to replace Unicode property escapes (\p{Emoji}, \p{L}, \p{N})
 * with equivalent character ranges. Babel (used by `next build --webpack`) cannot
 * handle Unicode property escapes in regex, causing "Unknown property" errors.
 * Turbopack handles them fine, but standalone mode requires webpack.
 */
async function patchLinkifyUnicodeRegex(root) {
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return;

  const entries = await fsp.readdir(pnpmDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('linkifyjs@')) continue;
    const mjsPath = path.join(
      pnpmDir, entry.name, 'node_modules', 'linkifyjs', 'dist', 'linkify.mjs',
    );
    if (!fs.existsSync(mjsPath)) continue;
    let content = await fsp.readFile(mjsPath, 'utf-8');
    const before = content.split('\\p{').length - 1;
    if (before === 0) {
      console.log('[prepare-runner] linkify.mjs already patched, skipping');
      continue;
    }
    // Replace \p{Emoji} with common emoji Unicode ranges
    content = content.split('\\p{Emoji}').join(
      '\\uD83C[\\uDF00-\\uDFFF]|\\uD83D[\\uDC00-\\uDE4F\\uDE80-\\uDEFF]|[\\u2600-\\u27BF]'
    );
    // Replace \p{L} with Unicode letter ranges
    content = content.split('\\p{L}').join(
      'a-zA-Z\\u00C0-\\u024F\\u0400-\\u04FF\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF\\uAC00-\\uD7AF\\u0590-\\u05FF\\u0600-\\u06FF'
    );
    // Replace \p{N} with Unicode number ranges
    content = content.split('\\p{N}').join(
      '0-9\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F'
    );
    // Remove 'u' flag from regexes that used Unicode property escapes
    content = content.split('/u;').join(';').split('/u ').join(' ');
    await fsp.writeFile(mjsPath, content, 'utf-8');
    console.log(`[prepare-runner] Patched linkify.mjs (${before} Unicode property escapes replaced)`);
  }
}

async function main() {
  const root = path.resolve(__dirname, '..', '..', '..');
  const embeddedInRepo = path.join(root, 'apps', 'macos-agent', 'embedded-web');
  await rmDirSafe(embeddedInRepo);
  await rmDirSafe(path.join(root, '.next', 'standalone'));
  await cleanupEsbuildCopyArtifacts(root);
  // No longer need to patch linkify.mjs — we use SWC instead of Babel for
  // production builds (SWC natively supports Unicode property escapes).

  // Temporarily move babel.config.js aside so Next.js uses SWC (not Babel).
  // SWC natively handles Unicode property escapes (\p{Emoji}, \p{L}) which
  // Babel cannot parse. @react-dev-inspector/babel-plugin is only needed
  // during development, not in production builds.
  const babelConfigPath = path.join(root, 'babel.config.js');
  const babelConfigBackup = path.join(root, 'babel.config.dev.js');
  let movedBabelConfig = false;
  if (fs.existsSync(babelConfigPath)) {
    await fsp.rename(babelConfigPath, babelConfigBackup);
    movedBabelConfig = true;
    console.log('[prepare-runner] Temporarily moved babel.config.js -> babel.config.dev.js (use SWC for prod build)');
  }

  try {
    run('node', [path.join(__dirname, 'prepare-ytdlp.js')], path.join(root, 'apps', 'macos-agent'));

    run('pnpm', ['agent:build'], root);
    run('pnpm', ['next', 'build', '--webpack'], root, {
      NEXT_STANDALONE: '1',
      NEXT_PUBLIC_DESKTOP: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    });
  } finally {
    // Restore babel.config.js for development mode
    if (movedBabelConfig && fs.existsSync(babelConfigBackup)) {
      await fsp.rename(babelConfigBackup, babelConfigPath);
      console.log('[prepare-runner] Restored babel.config.js for development');
    }
  }

  const src = path.join(root, 'dist', 'agent', 'runner.js');
  const dst = path.join(__dirname, '..', 'runner.js');
  if (!fs.existsSync(src)) {
    process.stderr.write('Missing dist/agent/runner.js\n');
    process.exit(1);
  }
  await fsp.copyFile(src, dst);

  const embeddedDir = path.join(__dirname, '..', 'embedded-web');
  await rmDirSafe(embeddedDir);

  const standaloneSrc = path.join(root, '.next', 'standalone');
  const staticSrc = path.join(root, '.next', 'static');
  if (!fs.existsSync(standaloneSrc)) {
    process.stderr.write('Missing .next/standalone\n');
    process.exit(1);
  }

  await copyDir(standaloneSrc, embeddedDir);

  if (fs.existsSync(staticSrc)) await copyDir(staticSrc, path.join(embeddedDir, '.next', 'static'));
  const publicSrc = path.join(root, 'public');
  if (fs.existsSync(publicSrc)) await copyDir(publicSrc, path.join(embeddedDir, 'public'));

  await rmDirSafe(path.join(embeddedDir, '.data'));
  await rmDirSafe(path.join(embeddedDir, 'public', 'generated-clips'));

  const nextDir = path.join(embeddedDir, '.next');
  const nmDir = path.join(embeddedDir, 'node_modules');
  if (!fs.existsSync(nextDir)) {
    process.stderr.write('ERROR: embedded-web/.next missing after copy!\n');
    process.exit(1);
  }
  if (!fs.existsSync(nmDir)) {
    process.stderr.write('ERROR: embedded-web/node_modules missing after copy!\n');
    process.exit(1);
  }

  const nextModuleDir = path.join(nmDir, 'next');
  if (!fs.existsSync(nextModuleDir)) {
    process.stderr.write('ERROR: embedded-web/node_modules/next missing after copy!\n');
    process.exit(1);
  }

  console.log('[prepare-runner] embedded-web/.next OK');
  console.log('[prepare-runner] embedded-web/node_modules OK');
  console.log('[prepare-runner] embedded-web/node_modules/next OK');

  await fsp.writeFile(path.join(embeddedDir, 'bootstrap.js'), [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const Module = require('node:module');",
    "const candidates = [",
    "  path.join(__dirname, 'node_modules'),",
    "  path.join(process.resourcesPath || '', 'embedded-web', 'node_modules'),",
    "  path.join(process.resourcesPath || '', 'app.asar.unpacked', 'embedded-web', 'node_modules'),",
    "  path.join(process.resourcesPath || '', 'app.asar', 'node_modules'),",
    "  path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules'),",
    "  path.join(__dirname, '..', 'node_modules'),",
    "  path.join(__dirname, '..', '..', '..', 'node_modules'),",
    "].filter(Boolean).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });",
    "process.env.NODE_PATH = candidates.join(':');",
    "Module._initPaths();",
    "require('./server.js');",
    "",
  ].join('\n'));
}

main();
