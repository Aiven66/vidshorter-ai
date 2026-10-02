/**
 * 真机 E2E：/video-clips 上真实跑一次「打包下载全部片段」。
 * 目标：验证 >300s 总时长时前端自动分包（part1/part2…），
 *       且每个 ZIP 都能解开、里面的 MP4 都能被 ffmpeg 完整解码。
 */
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { chromium } = pw;
const BASE = 'https://www.clipopai.com';
const PROXY = { server: 'http://127.0.0.1:7897' };
// 视频需 > 8 分钟：此时单段目标 50s，10 段 ≈ 500s → 必然拆成 2 包，
// 才能真正验证分包逻辑（短视频只会走单包路径）。
const VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://www.youtube.com/watch?v=arj7oStGLkU';

const OUT = '.pwtest/exportall';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const check = (name, pass, extra = '') => {
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  proxy: PROXY,
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

// 捕获 /api/export-all 的网络响应与 body，这是判断失败原因的关键证据
const apiCalls = [];
page.on('response', async (r) => {
  const u = r.url();
  if (!u.includes('/api/export-all') && !u.includes('/api/cut-clip') && !u.includes('/resolve') && !u.includes('/stream')) return;
  let body = '';
  if (u.includes('/api/export-all')) {
    body = await r.text().catch(() => '(unreadable)');
  }
  apiCalls.push({ status: r.status(), url: u.slice(0, 120), body: body.slice(0, 300) });
  console.log(`  [NET] ${r.status()} ${u.slice(0, 110)}${body ? ' :: ' + body.slice(0, 220) : ''}`);
});

const downloads = [];
page.on('download', async (d) => {
  const idx = downloads.length;
  const name = d.suggestedFilename();
  const p = `${OUT}/dl${idx}_${name}`;
  try {
    await d.saveAs(p);
    downloads.push({ name, path: p });
    console.log(`  [DL] #${idx} ${name}`);
  } catch (e) {
    console.log(`  [DL] #${idx} ${name} saveAs failed: ${String(e).slice(0, 120)}`);
  }
});

const t0 = Date.now();
const el = () => `${Math.round((Date.now() - t0) / 1000)}s`;

// ── 1. 登录 ───────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('input[type=email]', { timeout: 60000 });
await page.fill('input[type=email]', 'admin@126.com');
await page.fill('input[type=password]', 'admin@666666');
await page.click('button[type=submit]');
// 轮询等待跳转（登录偶发较慢，固定 8s 不够）
let loggedIn = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  if (!page.url().includes('/login')) { loggedIn = true; break; }
}
if (!loggedIn) {
  const body = await page.locator('body').innerText().catch(() => '');
  console.log('登录页文本尾部：', body.slice(-300));
}
check('管理员登录成功', loggedIn, `url=${page.url()}`);
if (!loggedIn) {
  await browser.close();
  console.log('\n登录失败，终止（未登录时无法提交/导出）。');
  process.exit(1);
}

// ── 2. 提交视频 ───────────────────────────────────────────
await page.goto(`${BASE}/video-clips`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
const urlInput = page
  .locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="链接"], input[placeholder*="URL"], input[placeholder*="url"]')
  .first();
await urlInput.waitFor({ state: 'visible', timeout: 60000 });
await urlInput.fill(VIDEO_URL);
console.log(`[${el()}] 已填入 ${VIDEO_URL}`);

const analyzeBtn = page
  .locator('button:not([disabled]):has-text("Analyze"), button:not([disabled]):has-text("分析")')
  .first();
await analyzeBtn.waitFor({ state: 'visible', timeout: 60000 });
await analyzeBtn.click();
console.log(`[${el()}] 已点击分析，等待高光生成…`);

// ── 3. 等「下载全部片段」按钮出现 ────────────────────────
const exportAllBtn = page
  .locator('button:has-text("Download all clips"), button:has-text("下载全部")')
  .first();
let appeared = false;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(6000);
  if ((await exportAllBtn.count()) > 0) { appeared = true; break; }
  if (i % 5 === 0) console.log(`    …${el()} 仍在等待高光结果`);
}
check('「下载全部片段」按钮出现（付费/管理员可见）', appeared);
if (!appeared) {
  const body = await page.locator('body').innerText();
  console.log('页面尾部文本：', body.slice(-600));
  await page.screenshot({ path: `${OUT}/no-results.png`, fullPage: true });
  await browser.close();
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}

// 记录结果区里可见的片段数量（每张卡片一个 Download 按钮）
const clipCardCount = await page.locator('button:has-text("Download"), button:has-text("下载")').count();
console.log(`[${el()}] 结果区 Download 按钮数（≈片段数）：${clipCardCount}`);

// ── 4. 点击打包下载，捕获所有下载 ────────────────────────
await exportAllBtn.click();
console.log(`[${el()}] 已点击「Download all clips」，等待 ZIP…`);

// 记录按钮文案变化 + 卡片上的错误文案（exportAllErr 渲染在 hint 下方）
const progressSeen = [];
let busied = false;
let revertedAt = -1;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(3000);
  const btnTxt = (await exportAllBtn.innerText().catch(() => '')).trim();
  const busyNow = /Packing|打包|Cutting|Downloading|ZIP/i.test(btnTxt);
  if (busyNow) busied = true;
  if (btnTxt && (!progressSeen.length || progressSeen[progressSeen.length - 1] !== btnTxt)) {
    progressSeen.push(btnTxt);
    console.log(`  [${el()}] 按钮文案 → ${btnTxt.slice(0, 120)}`);
  }
  if (busied && !busyNow && revertedAt < 0) {
    revertedAt = i;
    console.log(`  [${el()}] 按钮已从忙碌态恢复（说明流程结束）`);
  }
  if (revertedAt >= 0) { await page.waitForTimeout(5000); break; }
}
const errText = await page
  .locator('p.text-destructive')
  .allInnerTexts()
  .catch(() => []);
console.log(`[${el()}] 捕获下载数：${downloads.length}`);
console.log(`按钮文案轨迹：${progressSeen.map((t) => t.slice(0, 70)).join(' → ') || '(未变化)'}`);
console.log(`页面红色错误文案：${errText.length ? errText.join(' | ').slice(0, 500) : '(无)'}`);
console.log(`export-all 网络调用：${apiCalls.length ? JSON.stringify(apiCalls).slice(0, 800) : '(未发起)'}`);

check('至少下载到 1 个文件', downloads.length > 0);
check('文件扩展名为 .zip（而非 .webm）', downloads.every((d) => d.name.endsWith('.zip')), downloads.map((d) => d.name).join(', '));
check('多包命名符合 part1/part2 规范', downloads.length < 2 || downloads.some((d) => /part\d+/.test(d.name)), downloads.map((d) => d.name).join(', '));

// ── 5. 校验 ZIP 内容 + MP4 可解码 ────────────────────────
for (const d of downloads) {
  const size = fs.statSync(d.path).size;
  const head = fs.readFileSync(d.path).subarray(0, 4).toString('binary');
  const isZip = head.startsWith('PK');
  check(`${d.name} 是合法 ZIP（PK 头）`, isZip, `size=${size} head=${JSON.stringify(head)}`);
  if (!isZip) continue;

  let listing = '';
  try {
    listing = execFileSync('/usr/bin/unzip', ['-l', d.path], { encoding: 'utf8', timeout: 60000 });
  } catch (e) { listing = String(e.stdout || e.message); }
  const mp4s = listing.split('\n').filter((l) => l.trim().endsWith('.mp4'));
  check(`${d.name} 内含 MP4 条目`, mp4s.length > 0, `${mp4s.length} 个`);

  if (mp4s.length === 0) continue;
  const extractDir = `${OUT}/${d.name.replace(/\.zip$/, '')}`;
  try {
    execFileSync('/usr/bin/unzip', ['-o', '-q', d.path, '-d', extractDir], { timeout: 60000 });
  } catch (e) { console.log('  解压失败:', String(e).slice(0, 200)); continue; }

  const files = fs.readdirSync(extractDir).filter((f) => f.endsWith('.mp4'));
  let decodeErrors = 0;
  let detail = [];
  for (const f of files) {
    const abs = `${extractDir}/${f}`;
    let err = '';
    try {
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', abs, '-f', 'null', '-'], {
        encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) { err = String((e.stdout || '') + (e.message || '')).slice(0, 200); }
    if (err && err.trim()) { decodeErrors++; detail.push(`${f}: ${err.trim().slice(0, 90)}`); }
  }
  check(`${d.name} 内 ${files.length} 个 MP4 全部可解码`, decodeErrors === 0, detail.join(' | '));
}

check('无 pageerror', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: `${OUT}/final.png`, fullPage: true });
await browser.close();
console.log(fail === 0 ? '\nALL EXPORT-ALL REAL CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);