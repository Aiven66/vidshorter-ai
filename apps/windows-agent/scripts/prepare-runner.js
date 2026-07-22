const fs = require('node:fs');
const fsp = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const { spawnSync } = require('node:child_process');

// Windows 版 yt-dlp 下载地址与目标路径
const YT_DLP_WINDOWS_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const YT_DLP_OUT_PATH = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');

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

// ==================== yt-dlp.exe 下载 ====================
async function isLocalPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 200 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function resolveHttpProxy() {
  const envProxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '').trim();
  if (envProxy) return envProxy;
  if (await isLocalPortOpen(7890)) return 'http://127.0.0.1:7890';
  return '';
}

async function fetchToFile(url, filePath, redirectsLeft = 5) {
  const proxy = await resolveHttpProxy();
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  return new Promise((resolve, reject) => {
    const out = fsSync.createWriteStream(filePath);
    const req = https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30_000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        try { res.resume(); } catch {}
        out.close(() => {
          fsp.rm(filePath, { force: true }).catch(() => {}).finally(() => {
            fetchToFile(nextUrl, filePath, redirectsLeft - 1).then(resolve, reject);
          });
        });
        return;
      }
      if (code >= 300) {
        reject(new Error('HTTP ' + code));
        try { res.resume(); } catch {}
        return;
      }
      res.pipe(out);
      out.on('finish', () => resolve());
    });
    req.on('timeout', () => {
      try { req.destroy(new Error('ETIMEDOUT')); } catch {}
    });
    req.on('error', reject);
    out.on('error', reject);
  });
}

async function sniff(filePath, bytes = 16) {
  const fd = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fd.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close().catch(() => {});
  }
}

// 检测 PE 格式（Windows 可执行文件以 'MZ' 开头）
function looksLikePE(prefix) {
  if (!prefix || prefix.length < 2) return false;
  return prefix[0] === 0x4d && prefix[1] === 0x5a; // 'M' 'Z'
}

async function validateYtDlpExe(filePath) {
  const st = await fsp.stat(filePath);
  if (!st.isFile()) throw new Error('not file');
  if (st.size < 500_000) throw new Error(`file too small (${st.size} bytes)`);
  const p = await sniff(filePath, 16);
  const s = p.toString('utf8').toLowerCase();
  if (s.includes('<html') || s.includes('<!doctype')) throw new Error('downloaded html instead of binary');
  if (!looksLikePE(p)) throw new Error('not a valid PE executable');
}

async function prepareYtDlp() {
  await fsp.mkdir(path.dirname(YT_DLP_OUT_PATH), { recursive: true });
  const tmp = `${YT_DLP_OUT_PATH}.download`;

  // 已存在且有效则跳过下载
  try {
    await validateYtDlpExe(YT_DLP_OUT_PATH);
    console.log('[prepare-runner] yt-dlp.exe already exists and valid');
    return;
  } catch {}

  await fsp.rm(tmp, { force: true }).catch(() => {});
  await fsp.rm(YT_DLP_OUT_PATH, { force: true }).catch(() => {});
  console.log('[prepare-runner] Downloading yt-dlp.exe...');
  await fetchToFile(YT_DLP_WINDOWS_URL, tmp);
  // Windows 不需要 chmod +x
  await validateYtDlpExe(tmp);
  await fsp.rename(tmp, YT_DLP_OUT_PATH);
  console.log(`[prepare-runner] yt-dlp.exe saved to ${YT_DLP_OUT_PATH}`);
}

async function main() {
  const root = path.resolve(__dirname, '..', '..', '..');
  const embeddedInRepo = path.join(root, 'apps', 'windows-agent', 'embedded-web');
  await rmDirSafe(embeddedInRepo);
  await rmDirSafe(path.join(root, '.next', 'standalone'));
  await cleanupEsbuildCopyArtifacts(root);

  // Windows 版：内联下载 yt-dlp.exe（不需要单独的 prepare-ytdlp.js 脚本）
  await prepareYtDlp();

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
    run('pnpm', ['agent:build'], root);
    run('pnpm', ['next', 'build', '--webpack'], root, {
      NEXT_STANDALONE: '1',
      NEXT_PUBLIC_DESKTOP: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    });
  } finally {
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
