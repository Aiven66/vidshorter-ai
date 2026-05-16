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

async function main() {
  const root = path.resolve(__dirname, '..', '..', '..');
  const embeddedInRepo = path.join(root, 'apps', 'macos-agent', 'embedded-web');
  await fsp.rm(embeddedInRepo, { recursive: true, force: true });
  await fsp.rm(path.join(root, '.next', 'standalone'), { recursive: true, force: true });

  run('node', [path.join(__dirname, 'prepare-ytdlp.js')], path.join(root, 'apps', 'macos-agent'));

  run('pnpm', ['agent:build'], root);
  run('pnpm', ['next', 'build', '--webpack'], root, {
    NEXT_STANDALONE: '1',
    NEXT_PUBLIC_DESKTOP: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  });

  const src = path.join(root, 'dist', 'agent', 'runner.js');
  const dst = path.join(__dirname, '..', 'runner.js');
  if (!fs.existsSync(src)) {
    process.stderr.write('Missing dist/agent/runner.js\n');
    process.exit(1);
  }
  await fsp.copyFile(src, dst);

  const embeddedDir = path.join(__dirname, '..', 'embedded-web');
  await fsp.rm(embeddedDir, { recursive: true, force: true });

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

  await fsp.writeFile(path.join(embeddedDir, 'bootstrap.js'), [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const Module = require('node:module');",
    "const candidates = [",
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
