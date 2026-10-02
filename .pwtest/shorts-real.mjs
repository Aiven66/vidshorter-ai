/**
 * 真机 E2E：「YouTube Shorts 成片」/shorts 真实跑一次生成 + 下载。
 * 目标：证明「输入长视频链接 → 输出适合竖屏的高光短视频」真的成立：
 *   1) 真实提交 /api/videos/process，等结果区出现 3 条成片
 *   2) 点击第 1 条成片的 Download，捕获真实下载文件
 *   3) ffprobe 校验：是 MP4、含 H.264 视频 + 音频、竖屏（h > w，约 9:16）、时长 ≤70s
 *
 * 用法：BASE=https://www.clipopai.com node .pwtest/shorts-real.mjs
 */
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const { chromium } = pw;
const BASE = process.env.BASE || 'https://www.clipopai.com';
const PROXY = { server: 'http://127.0.0.1:7897', bypass: 'localhost,127.0.0.1' };
const VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://www.youtube.com/watch?v=arj7oStGLkU';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const OUT = '.pwtest/shorts-real';
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
page.on('pageerror', (e) => errors.push(String(e).slice(0, 220)));

// 记录关键后端调用的状态，失败时定位原因
page.on('response', (r) => {
  const u = r.url();
  if (/\/api\/(videos\/process|cut-clip|resolve|video-proxy)/.test(u)) {
    console.log(`  [NET] ${r.status()} ${u.slice(0, 110)}`);
  }
});

const downloads = [];
page.on('download', async (d) => {
  const p = `${OUT}/dl${downloads.length}_${d.suggestedFilename()}`;
  try { await d.saveAs(p); downloads.push({ name: d.suggestedFilename(), path: p }); }
  catch (e) { console.log(`  [DL] saveAs 失败: ${String(e).slice(0, 120)}`); }
});

const t0 = Date.now();
const el = () => `${Math.round((Date.now() - t0) / 1000)}s`;

// ── 1. 登录 ───────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('input[type=email]', { timeout: 60000 });
await page.fill('input[type=email]', 'admin@126.com');
await page.fill('input[type=password]', 'admin@666666');
await page.click('button[type=submit]');
let loggedIn = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  if (!page.url().includes('/login')) { loggedIn = true; break; }
}
check('管理员登录成功', loggedIn, `url=${page.url()} (${el()})`);
if (!loggedIn) { await browser.close(); process.exit(1); }

// ── 2. 提交长视频链接 ────────────────────────────────────
await page.goto(`${BASE}/shorts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const urlInput = page.locator('input[placeholder]').first();
await urlInput.waitFor({ state: 'visible', timeout: 60000 });
await urlInput.fill(VIDEO_URL);
const genBtn = page.locator('button:has-text("Make Vertical Shorts"), button:has-text("生成竖屏 Shorts")').first();
await genBtn.waitFor({ state: 'visible', timeout: 60000 });
await genBtn.click();
console.log(`[${el()}] 已提交真实生成：${VIDEO_URL}`);

// ── 3. 等结果区出现成片（每张卡片一个 Download 按钮） ────
const dlBtn = page.locator('button:has-text("Download"), button:has-text("下载")');
let clipCount = 0;
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(6000);
  clipCount = await dlBtn.count();
  if (clipCount > 0) break;
  if (i % 5 === 0) console.log(`    …${el()} 等待成片（当前 Download 按钮数 ${clipCount}）`);
}
// 结果可能分批到达：再观察一段时间取稳定值，避免在只渲染出 1 条时就下结论
if (clipCount > 0) {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const now = await dlBtn.count();
    if (now > clipCount) clipCount = now;
    else break;
  }
}
check('结果区出现成片（≥1 条 Download 按钮）', clipCount > 0, `count=${clipCount}`);
// 产品规格：Shorts 成片固定 3 条
check('成片条数恰为 3（desiredClipCount 被服务端采纳）', clipCount === 3, `count=${clipCount}`);
if (clipCount === 0) {
  const body = await page.locator('body').innerText().catch(() => '');
  console.log('页面尾部文本：', body.slice(-700));
  await page.screenshot({ path: `${OUT}/no-clips.png`, fullPage: true });
  await browser.close();
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}
console.log(`[${el()}] 成片条目数（Download 按钮）=${clipCount}`);

// 竖屏缩略图容器应为 9:16（aspect-[9/16] → 高 > 宽）
const thumb = page.locator('div.aspect-\\[9\\/16\\]').first();
const thumbBox = await thumb.boundingBox().catch(() => null);
check('结果缩略图为竖屏容器（9:16，h > w）', !!thumbBox && thumbBox.height > thumbBox.width,
  thumbBox ? `w=${Math.round(thumbBox.width)} h=${Math.round(thumbBox.height)}` : 'no box');

await page.screenshot({ path: `${OUT}/clips.png`, fullPage: true });

// ── 4. 下载第 1 条成片 ───────────────────────────────────
await dlBtn.first().click();
console.log(`[${el()}] 已点击第 1 条成片的 Download，等待下载…`);
// YouTube link_only 片段走「浏览器实时录制」下载：50s 片段需实时录满，给足 12 分钟
for (let i = 0; i < 240 && downloads.length === 0; i++) {
  await page.waitForTimeout(3000);
  if (i % 20 === 0) console.log(`    …${el()} 等待下载（录制中）`);
}
check('捕获到下载文件', downloads.length > 0, downloads.map((d) => d.name).join(', '));

if (downloads.length === 0) {
  const errText = await page.locator('p.text-destructive').allInnerTexts().catch(() => []);
  console.log('页面红色错误文案：', errText.join(' | ').slice(0, 400) || '(无)');
  await page.screenshot({ path: `${OUT}/dl-fail.png`, fullPage: true });
  await browser.close();
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}

// ── 5. ffprobe 校验：真 MP4 + 竖屏 + 音频 + 时长 ─────────
const d = downloads[0];
const size = fs.statSync(d.path).size;
const head = fs.readFileSync(d.path).subarray(4, 8).toString('binary');
check(`${d.name} 是 MP4（ftyp 头）`, head === 'ftyp', `head=${JSON.stringify(head)} size=${size}`);

let probe = null;
try {
  probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', d.path], { encoding: 'utf8', timeout: 60000 }));
} catch (e) { console.log('ffprobe 失败:', String(e).slice(0, 300)); }

const streams = probe?.streams || [];
const video = streams.find((s) => s.codec_type === 'video');
const audio = streams.find((s) => s.codec_type === 'audio');
check('含视频流', !!video, video ? `${video.codec_name} ${video.width}x${video.height}` : '无');
check('编解码为 H.264', video?.codec_name === 'h264', `codec=${video?.codec_name}`);
check('含音频流（不是无声画面）', !!audio, audio ? audio.codec_name : '无');
if (video) {
  const ratio = video.height / video.width;
  check('画面为竖屏 9:16（h > w）', video.height > video.width, `${video.width}x${video.height}`);
  check('比例接近 9:16（1.6~1.9）', ratio > 1.6 && ratio < 1.9, `h/w=${ratio.toFixed(3)}`);
}
const dur = Number(probe?.format?.duration || video?.duration || 0);
check('时长 ≤70s', dur > 0 && dur <= 70, `duration=${dur.toFixed(1)}s`);

// 完整解码（无损坏）
let decodeErr = '';
try {
  execFileSync(FFMPEG, ['-v', 'error', '-i', d.path, '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { decodeErr = String((e.stdout || '') + (e.message || '')).slice(0, 200); }
check('ffmpeg 可完整解码（无损坏）', !decodeErr.trim(), decodeErr.trim().slice(0, 150));

check('无 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.screenshot({ path: `${OUT}/final.png`, fullPage: true });
await browser.close();
console.log(fail === 0 ? '\nALL SHORTS REAL CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);