// 生产 E2E：Recap Studio（/api/recap-studio + /recap）
// 运行: node .pwtest/recap-e2e.mjs
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const { chromium, request } = pw;

const BASE = 'https://www.clipopai.com';
const PROXY = 'http://127.0.0.1:7897';
const EMAIL = 'admin@126.com';
const PASSWORD = 'admin@666666';
const VIDEO_ID = 'dQw4w9WgXcQ';
const OUT_MP4 = '/tmp/recap-e2e.mp4';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
}

const api = await request.newContext({
  baseURL: BASE,
  proxy: { server: PROXY },
  ignoreHTTPSErrors: true,
  timeout: 600000,
});

const post = (path, body, headers = {}) =>
  api.post(path, {
    headers: { 'Content-Type': 'application/json', ...headers },
    data: typeof body === 'string' ? body : JSON.stringify(body),
  });

// ── 1) 方法/参数校验 ───────────────────────────────────────────────────────
{
  const r = await api.get('/api/recap-studio');
  check('GET /api/recap-studio → 405', r.status() === 405, `status=${r.status()}`);
}
{
  const r = await post('/api/recap-studio', '{');
  check('非法 JSON body → 400', r.status() === 400, `status=${r.status()} body=${(await r.text()).slice(0, 120)}`);
}
{
  const r = await post('/api/recap-studio', {});
  const j = await r.json().catch(() => ({}));
  check('空 body → 400 invalid_request', r.status() === 400 && j.error === 'recap_invalid_request', `status=${r.status()} error=${j.error}`);
}
{
  const r = await post('/api/recap-studio', { mode: 'script', videoId: VIDEO_ID, plan: 'free' });
  const j = await r.json().catch(() => ({}));
  check('free（无 token）→ 403 recap_requires_pro', r.status() === 403 && j.error === 'recap_requires_pro', `status=${r.status()} error=${j.error}`);
}

// ── 2) 登录拿 token（服务端裁定路径） ─────────────────────────────────────
const browser = await chromium.launch({ headless: true, channel: 'chrome', proxy: { server: PROXY } });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleLogs = [];
page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => consoleLogs.push(`[pageerror] ${String(e).slice(0, 200)}`));

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#email', { timeout: 45000 });
await page.fill('#email', EMAIL);
await page.fill('#password', PASSWORD);
await page.click('button[type="submit"]');
for (let i = 0; i < 40; i++) {
  await sleep(1500);
  if (!page.url().includes('/login')) break;
}
const loggedIn = !page.url().includes('/login');
check('admin 登录成功', loggedIn, page.url());

let token = '';
if (loggedIn) {
  // 登录后可能还有一次跳转，evaluate 前必须等页面稳定（否则 Execution context destroyed）
  await page.waitForLoadState('networkidle').catch(() => {});
  const readToken = () =>
    page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          try {
            const v = JSON.parse(localStorage.getItem(k) || '{}');
            if (v.access_token) return v.access_token;
          } catch { /* ignore */ }
        }
      }
      return '';
    });
  for (let i = 0; i < 8 && !token; i++) {
    try {
      token = await readToken();
    } catch { /* 跳转中，重试 */ }
    if (!token) await sleep(2000);
  }
  check('读到 Supabase access_token', !!token, token ? `len=${token.length}` : '');
}
const auth = token ? { Authorization: `Bearer ${token}` } : {};

// ── 3) mode:'script'（有 token，服务端裁定；admin 应放行） ─────────────────
{
  const r = await post('/api/recap-studio', { mode: 'script', videoId: VIDEO_ID, plan: 'free', locale: 'zh' }, auth);
  const j = await r.json().catch(() => ({}));
  const ok =
    (r.status() === 503 && j.error === 'recap_ai_unavailable') || // 生产无 LLM 通道：明文报错、不静默降级
    (r.status() === 200 && typeof j.engine === 'string' && j.engine.length > 0);
  check('有 token 的 admin 通过 Pro 门控（未 403）', r.status() !== 403, `status=${r.status()} error=${j.error || '-'}`);
  check("mode:'script' 行为明确（503 ai_unavailable 或 200 带 engine）", ok, `status=${r.status()} engine=${j.engine || '-'}`);

  if (r.status() === 503) {
    const r2 = await post(
      '/api/recap-studio',
      { mode: 'script', videoId: VIDEO_ID, plan: 'pro', locale: 'zh', allowLocalDraft: true },
      auth,
    );
    const j2 = await r2.json().catch(() => ({}));
    check(
      "allowLocalDraft:true → 200 且 engine 明确为 'local'",
      r2.status() === 200 && j2.engine === 'local',
      `status=${r2.status()} engine=${j2.engine} chapters=${j2.script?.chapters?.length}`,
    );
  }
}

// ── 4) mode:'render'：手写解说稿绕开 LLM，专测渲染链路 ─────────────────────
{
  const script = {
    hook: '这个视频里有三件事你必须知道。',
    title: 'E2E 渲染验收',
    targetDurationSec: 60,
    engine: 'local',
    chapters: [
      { title: '第一章', narration: '我们先看第一个重点，它决定了后面的走向。', sourceStart: 8, sourceEnd: 28 },
      { title: '第二章', narration: '接着是第二个重点，很多人会忽略它。', sourceStart: 55, sourceEnd: 75 },
      { title: '第三章', narration: '最后这个重点最关键，记得看到结尾。', sourceStart: 120, sourceEnd: 140 },
    ],
  };
  const body = {
    mode: 'render',
    plan: 'pro',
    videoId: VIDEO_ID,
    sourceDuration: 213,
    locale: 'zh',
    voice: 'zh-CN-YunxiNeural',
    orientation: 'landscape',
    originalVolume: 20,
    bgmMood: 'calm',
    script,
  };
  const t0 = Date.now();
  const r = await post('/api/recap-studio', body, auth);
  const renderMs = Date.now() - t0;
  const ctype = r.headers()['content-type'] || '';
  if (r.status() === 200 && ctype.includes('video/mp4')) {
    const buf = Buffer.from(await r.body());
    await writeFile(OUT_MP4, buf);
    check('mode:render → 200 video/mp4', buf.length > 100_000, `${(buf.length / 1024 / 1024).toFixed(2)}MB in ${(renderMs / 1000).toFixed(1)}s`);
  } else {
    const txt = (await r.text()).slice(0, 400);
    check('mode:render → 200 video/mp4', false, `status=${r.status()} ctype=${ctype} body=${txt}`);
  }

  try {
    const { stdout } = await execFileAsync('/opt/homebrew/bin/ffprobe', [
      '-v', 'error', '-show_entries', 'format=format_name,duration',
      '-show_entries', 'stream=codec_type,codec_name,width,height',
      '-of', 'json', OUT_MP4,
    ]);
    const j = JSON.parse(stdout);
    const v = (j.streams || []).find((s) => s.codec_type === 'video');
    const a = (j.streams || []).find((s) => s.codec_type === 'audio');
    const dur = parseFloat(j.format?.duration || '0');
    check('成片含 h264 视频轨', v?.codec_name === 'h264', `codec=${v?.codec_name} ${v?.width}x${v?.height}`);
    check('成片含 aac 音频轨', a?.codec_name === 'aac', `codec=${a?.codec_name}`);
    check('分辨率为 1280x720（横版）', v?.width === 1280 && v?.height === 720, `${v?.width}x${v?.height}`);
    check('时长落在合理区间（10s–120s）', dur > 10 && dur < 120, `duration=${dur.toFixed(2)}s format=${j.format?.format_name}`);

    await execFileAsync('/opt/homebrew/bin/ffmpeg', ['-y', '-v', 'error', '-ss', '3', '-i', OUT_MP4, '-frames:v', '1', '/tmp/recap-frame.png']);
    const { stdout: px } = await execFileAsync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', '/tmp/recap-frame.png']);
    check('可抽出关键帧（成片可解码）', JSON.parse(px).streams?.length === 1, '');
  } catch (e) {
    check('ffprobe 校验', false, String(e).slice(0, 200));
  }
}

// ── 5) 前端 /recap 两步流程 ────────────────────────────────────────────────
{
  await page.goto(`${BASE}/recap`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);
  const urlInput = page.locator('input[placeholder*="YouTube"]').first();
  const hasInput = await urlInput.isVisible().catch(() => false);
  check('admin 打开 /recap 未显示升级锁卡（有链接输入框）', hasInput, '');
  if (hasInput) {
    await urlInput.fill(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
    await sleep(1000);
    // 文案随语言变化：zh/en 都匹配
    const genBtn = page.locator('button', { hasText: /生成解说稿|Generate script/ }).first();
    await genBtn.waitFor({ state: 'visible', timeout: 15000 });
    for (let i = 0; i < 20; i++) {
      if (await genBtn.isEnabled().catch(() => false)) break;
      await sleep(500);
    }
    await genBtn.click();
    let drafted = false;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const localCta = page.locator('button', { hasText: /使用本地草稿|Use local draft/ }).first();
      if (await localCta.isVisible().catch(() => false)) {
        await localCta.click();
        continue;
      }
      if (await page.locator('#recap-hook').isVisible().catch(() => false)) { drafted = true; break; }
    }
    check('两步流程 Step1：解说稿可编辑表单出现', drafted, '');
    if (drafted) {
      const renderBtn = page.locator('button', { hasText: /渲染解说成片|Render recap film/ }).first();
      await renderBtn.click().catch(() => {});
      let film = false;
      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        if (await page.locator('video').first().isVisible().catch(() => false)) { film = true; break; }
      }
      check('两步流程 Step2：成片 video 播放器出现', film, '');
    }
  }
}

await browser.close();
await api.dispose();

const failed = results.filter((r) => !r.ok);
console.log(`\n=== recap E2E: ${results.length - failed.length}/${results.length} 通过 ===`);
if (failed.length) {
  console.log('失败项: ' + failed.map((f) => f.name).join(' | '));
  console.log('console 末尾:\n' + consoleLogs.slice(-12).join('\n'));
  process.exit(1);
}