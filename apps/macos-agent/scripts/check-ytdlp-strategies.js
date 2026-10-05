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
const hasBrowserCookies = args.includes('--cookies-from-browser');
const hasCookieFile = args.includes('--cookies');
const hasCookies = hasBrowserCookies || hasCookieFile;

function outputPath() {
  const i = args.indexOf('-o');
  if (i < 0 || !args[i + 1]) return '';
  return args[i + 1].replace('%(ext)s', 'mp4');
}
function writeFinal() {
  const out = outputPath();
  if (!out) return;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.alloc(300000, 7));
}
function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

if (url.includes('login') && !hasCookies) {
  fail('Sign in to confirm you are not a bot. Use --cookies-from-browser or --cookies to give yt-dlp access to your account.');
}
if (url.includes('region')) {
  fail('This video is not available in your country');
}
if (url.includes('network-fail')) {
  fail('unable to download video data: HTTP Error 503: Service Unavailable');
}
if (url.includes('resume-test')) {
  const out = outputPath();
  const part = out + '.part';
  if (out && fs.existsSync(part)) {
    fs.appendFileSync(path.join(path.dirname(out), 'resume.marker'), 'resumed');
    writeFinal();
    console.error('[download] 100% of 1.00MiB in 00:01');
    process.exit(0);
  }
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(part, Buffer.alloc(1000, 1));
  }
  fail('unable to download video data: HTTP Error 503: Service Unavailable');
}
writeFinal();
console.error('[download] 12.5% of 1.00MiB at 2.00MiB/s ETA 00:01');
console.error('[download] 100% of 1.00MiB in 00:01');
process.exit(0);
`, 'utf8');
  await fs.chmod(mockBin, 0o755);

  process.env.VIDSHORTER_YTDLP_PATH = mockBin;
  process.env.VIDSHORTER_TEST_ENABLE_COOKIE_STRATEGIES = '1';
  process.env.MOCK_YTDLP_LOG = logPath;

  const { runYtDlp, downloadWithYtDlp } = require('../ytdlp');

  const readCalls = async () => {
    const raw = await fs.readFile(logPath, 'utf8').catch(() => '');
    const all = raw.trim() ? raw.trim().split('\n').map((line) => JSON.parse(line)) : [];
    // 过滤掉 --version 探测调用，只保留真正的下载调用。
    return all.filter((args) => !args.includes('--version'));
  };
  const resetCalls = () => fs.writeFile(logPath, '', 'utf8');

  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  // ===== Case 1: 公开视频成功（非 cookie 策略先命中） =====
  await resetCalls();
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

  const publicCalls = await readCalls();
  assert(fsSync.existsSync(publicOut.replace('%(ext)s', 'mp4')), 'public video was not written');
  assert(!publicCalls.some((args) => args.includes('--cookies-from-browser')), 'public YouTube path should try non-cookie strategies first');
  assert(publicProgress.some((pct) => pct >= 100), 'public progress did not reach 100%');
  assert(publicCalls.every((args) => args.includes('--continue')), 'download args should always include --continue');

  // ===== Case 2: 无 cookie 时回落浏览器 cookie 成功（runYtDlp 策略兜底） =====
  await resetCalls();
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

  const loginCalls = await readCalls();
  assert(fsSync.existsSync(loginOut.replace('%(ext)s', 'mp4')), 'login video was not written');
  assert(loginCalls.some((args) => args.includes('--cookies-from-browser')), 'login-required YouTube path did not fall back to browser cookies');
  assert(loginStrategies.some((name) => name.includes('chrome') || name.includes('firefox')), 'login-required path did not report a cookie strategy');

  // ===== Case 3: cookieMode:'none' 需登录视频 → LOGIN_REQUIRED 且 retryable =====
  await resetCalls();
  let loginErr = null;
  try {
    await downloadWithYtDlp({ url: 'https://www.youtube.com/watch?v=loginrequired', cookieMode: 'none' }, {
      cacheDir: path.join(tmpDir, 'cache-login'),
      strategyTimeoutMs: 1000,
      cookieStrategyTimeoutMs: 1000,
      overallTimeoutMs: 8000,
    });
  } catch (e) {
    loginErr = e;
  }
  assert(loginErr, 'cookieMode:none login video should fail');
  assert(loginErr.code === 'LOGIN_REQUIRED', `expected LOGIN_REQUIRED, got ${loginErr.code}`);
  assert(loginErr.retryable === true, 'LOGIN_REQUIRED should be retryable');
  assert(loginErr.structured && loginErr.structured.message, 'LOGIN_REQUIRED should carry a structured message');

  // ===== Case 4: 地区锁定 → REGION_LOCKED =====
  await resetCalls();
  let regionErr = null;
  try {
    await downloadWithYtDlp({ url: 'https://www.youtube.com/watch?v=regionlocked', cookieMode: 'none' }, {
      cacheDir: path.join(tmpDir, 'cache-region'),
      strategyTimeoutMs: 1000,
      cookieStrategyTimeoutMs: 1000,
      overallTimeoutMs: 8000,
    });
  } catch (e) {
    regionErr = e;
  }
  assert(regionErr && regionErr.code === 'REGION_LOCKED', `expected REGION_LOCKED, got ${regionErr && regionErr.code}`);

  // ===== Case 5: 网络中断 → NETWORK =====
  await resetCalls();
  let networkErr = null;
  try {
    await downloadWithYtDlp({ url: 'https://www.youtube.com/watch?v=network-fail-1', cookieMode: 'none' }, {
      cacheDir: path.join(tmpDir, 'cache-network'),
      strategyTimeoutMs: 1000,
      cookieStrategyTimeoutMs: 1000,
      overallTimeoutMs: 8000,
    });
  } catch (e) {
    networkErr = e;
  }
  assert(networkErr && networkErr.code === 'NETWORK', `expected NETWORK, got ${networkErr && networkErr.code}`);

  // ===== Case 6: 中断后续跑命中 --continue（已存在 .part → 续跑而非全量重下） =====
  await resetCalls();
  const resumeDir = path.join(tmpDir, 'cache-resume');
  const resumeCache = path.join(resumeDir, 'resume-test');
  await fs.mkdir(resumeCache, { recursive: true });
  // 模拟上一次被中断后遗留的分片文件。
  await fs.writeFile(path.join(resumeCache, 'source_auto.mp4.part'), Buffer.alloc(1000, 1));

  const resumed = await downloadWithYtDlp({ url: 'https://www.youtube.com/watch?v=resume-test', cookieMode: 'none' }, {
    cacheDir: resumeDir,
    strategyTimeoutMs: 1000,
    cookieStrategyTimeoutMs: 1000,
    overallTimeoutMs: 8000,
  });
  assert(fsSync.existsSync(resumed.path), 'resume attempt did not produce the final file');
  assert(fsSync.existsSync(path.join(resumeCache, 'resume.marker')), 'resume attempt did not hit the partial-file resume path');
  const resumeCalls = await readCalls();
  assert(resumeCalls.length > 0 && resumeCalls.every((args) => args.includes('--continue')), 'resume args should include --continue');
  assert(resumeCalls.some((args) => args.includes('--paths') && args.some((v) => String(v).startsWith('temp:'))), 'cache dir should be passed via --paths temp:');
  assert(resumed.cached === false, 'resume from a partial file should not be reported as a cache hit');

  console.log('OK ytdlp strategies + P0-4 downloader');
  console.log(`tmp ${tmpDir}`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
