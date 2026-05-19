const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipop-ytdlp-strategy-'));
  const mockBin = path.join(tmpDir, 'yt-dlp-mock.js');
  const logPath = path.join(tmpDir, 'calls.log');

  await fs.writeFile(mockBin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const logPath = process.env.MOCK_YTDLP_LOG;
if (logPath) fs.appendFileSync(logPath, JSON.stringify(args) + '\\n');
if (args.includes('--version')) {
  console.log('2026.05.19-test');
  process.exit(0);
}
const url = args.find((a) => /^https?:/.test(a)) || '';
const hasCookies = args.includes('--cookies-from-browser');
if (url.includes('login-required') && !hasCookies) {
  console.error('ERROR: Sign in to confirm you are not a bot');
  process.exit(1);
}
const outIndex = args.indexOf('-o');
if (outIndex >= 0 && args[outIndex + 1]) {
  const out = args[outIndex + 1].replace('%(ext)s', 'mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.alloc(300000, 7));
}
console.error('[download] 12.5% of 1.00MiB at 2.00MiB/s ETA 00:01');
console.error('[download] 100% of 1.00MiB in 00:01');
process.exit(0);
`, 'utf8');
  await fs.chmod(mockBin, 0o755);

  process.env.VIDSHORTER_YTDLP_PATH = mockBin;
  process.env.VIDSHORTER_TEST_ENABLE_COOKIE_STRATEGIES = '1';
  process.env.MOCK_YTDLP_LOG = logPath;

  const { runYtDlp } = require('../ytdlp');

  const publicOut = path.join(tmpDir, 'public.%(ext)s');
  const publicProgress = [];
  await runYtDlp([
    '--no-playlist',
    '-f', 'best',
    '-o', publicOut,
    'https://www.youtube.com/watch?v=public-video',
  ], {
    strategyTimeoutMs: 1000,
    cookieStrategyTimeoutMs: 1000,
    overallTimeoutMs: 5000,
    onProgress: (pct) => publicProgress.push(pct),
  });

  const publicCalls = (await fs.readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  if (!fsSync.existsSync(publicOut.replace('%(ext)s', 'mp4'))) throw new Error('public video was not written');
  if (publicCalls.some((args) => args.includes('--cookies-from-browser'))) {
    throw new Error('public YouTube path should try non-cookie strategies before browser cookies');
  }
  if (!publicProgress.some((pct) => pct >= 100)) throw new Error('public progress did not reach 100%');

  await fs.writeFile(logPath, '', 'utf8');
  const loginOut = path.join(tmpDir, 'login.%(ext)s');
  const loginStrategies = [];
  await runYtDlp([
    '--no-playlist',
    '-f', 'best',
    '-o', loginOut,
    'https://www.youtube.com/watch?v=login-required',
  ], {
    strategyTimeoutMs: 1000,
    cookieStrategyTimeoutMs: 1000,
    overallTimeoutMs: 8000,
    onStrategy: (name) => loginStrategies.push(name),
  });

  const loginCalls = (await fs.readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  if (!fsSync.existsSync(loginOut.replace('%(ext)s', 'mp4'))) throw new Error('login video was not written');
  if (!loginCalls.some((args) => args.includes('--cookies-from-browser'))) {
    throw new Error('login-required YouTube path did not fall back to browser cookies');
  }
  if (!loginStrategies.some((name) => name.includes('chrome') || name.includes('firefox'))) {
    throw new Error('login-required YouTube path did not report a cookie strategy');
  }

  console.log('OK ytdlp strategies');
  console.log(`tmp ${tmpDir}`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
