/**
 * E2E：「YouTube Shorts 成片」页面（/shorts）
 *
 * 用法：
 *   BASE=http://localhost:5100 node .pwtest/shorts-ui.mjs
 *   BASE=https://www.clipopai.com node .pwtest/shorts-ui.mjs
 *
 * 断言：
 *  1) 侧边栏出现 Shorts 入口（NEW）
 *  2) Hero + 输入卡片文案正确
 *  3) 极简：无「高级设置」、无本地上传、无本地 Agent 开关、无场景预设
 *  4) 无页面报错
 *  5) 提交 payload 带 desiredClipCount=3（拦截 /api/videos/process，不发真实请求）
 */
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
import fs from 'node:fs';

const { chromium } = pw;
const BASE = process.env.BASE || 'http://localhost:5100';
const PROXY = { server: 'http://127.0.0.1:7897', bypass: 'localhost,127.0.0.1' };
const VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://www.youtube.com/watch?v=arj7oStGLkU';

const OUT = '.pwtest/shorts-ui';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const check = (name, pass, extra = '') => {
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, proxy: PROXY });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 220)));

let processPayload = null;
// 拦截真实提交：只截获 payload，返回假 videoId，避免消耗积分/触发真实管线
await page.route('**/api/videos/process', async (route) => {
  if (route.request().method() !== 'POST') return route.continue();
  try { processPayload = JSON.parse(route.request().postData() || '{}'); } catch {}
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videoId: 'fake-shorts-e2e' }) });
});
await page.route('**/api/videos/process/status**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'failed', error: 'e2e-abort', progress: 100, message: 'e2e-abort', done: true }),
  });
});

const t0 = Date.now();
const el = () => `${Math.round((Date.now() - t0) / 1000)}s`;

// ── 1. 登录（管理员，绕过免费门控） ─────────────────────────
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
check('登录成功', loggedIn, `url=${page.url()} (${el()})`);

// ── 2. 侧边栏入口 ────────────────────────────────────────
await page.goto(`${BASE}/shorts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(3500);
// VideoProcessor 是 ssr:false 的动态 import：必须等输入卡片真正挂载后再断言文案，否则会误报
await page.locator('input[placeholder]').first().waitFor({ state: 'visible', timeout: 60000 });
const sidebarLink = page.locator('a[href="/shorts"]').first();
check('侧边栏存在 /shorts 入口', await sidebarLink.count() > 0);
const sidebarText = (await sidebarLink.innerText().catch(() => '')) || '';
check('侧边栏标签文案（Shorts Studio / Shorts 成片）', /Shorts Studio|Shorts 成片/.test(sidebarText), `text="${sidebarText.replace(/\n/g, ' ')}"`);

// ── 3. Hero + 输入卡片 ──────────────────────────────────
check('Hero 标题存在', /YouTube Shorts Studio|YouTube Shorts 成片/.test(await page.locator('h1').first().innerText().catch(() => '')));

const cardTitle = await page.locator('text=/Paste a long video link|粘贴长视频链接/').count();
check('输入卡片标题正确', cardTitle > 0);

const subtitleOk = await page.locator('text=/9:16 vertical · AI captions|9:16 竖屏 · AI 字幕/').count();
check('副标题展示 9:16 + 字幕 + 3 条 ≤60s', subtitleOk > 0);

const genBtn = page.locator('button:has-text("Make Vertical Shorts"), button:has-text("生成竖屏 Shorts")').first();
check('生成按钮文案正确', await genBtn.count() > 0);

const placeholder = await page.locator('input[placeholder]').first().getAttribute('placeholder').catch(() => '');
check('输入框 placeholder 为长视频链接', /Paste a YouTube or Bilibili video link|粘贴 YouTube \/ B站 长视频链接/.test(placeholder || ''), `ph="${placeholder}"`);

// ── 4. 极简校验：复杂选项必须隐藏 ────────────────────────
const advCount = await page.locator('text=Advanced settings').count()
  + await page.locator('text=高级设置').count();
check('已隐藏「高级设置」面板', advCount === 0, `count=${advCount}`);

const uploadCount = await page.locator('text=/Upload a local video file|上传本机视频文件/').count();
check('已隐藏本地上传区', uploadCount === 0, `count=${uploadCount}`);

const agentCount = await page.locator('text=/Use local Mac Agent|使用本机 Mac 用户端/').count();
check('已隐藏本地 Agent 开关', agentCount === 0, `count=${agentCount}`);

const scenarioCount = await page.locator('text=/Scenario|场景化预置/').count();
check('已隐藏场景预设', scenarioCount === 0, `count=${scenarioCount}`);

// ── 5. 提交 payload：desiredClipCount=3 ──────────────────
await page.fill('input[placeholder]', VIDEO_URL);
await page.waitForTimeout(400);
check('填入链接后按钮可用', await genBtn.isEnabled().catch(() => false));
await genBtn.click();
for (let i = 0; i < 30 && !processPayload; i++) await page.waitForTimeout(1000);
check('已捕获 /api/videos/process 提交', !!processPayload, processPayload ? JSON.stringify(processPayload).slice(0, 200) : 'no payload');
check('payload.desiredClipCount === 3', processPayload?.desiredClipCount === 3, `got=${processPayload?.desiredClipCount}`);

// ── 6. 页面错误 ─────────────────────────────────────────
check('无页面 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await page.screenshot({ path: `${OUT}/shorts.png`, fullPage: true }).catch(() => {});
await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} — ${el()}`);
process.exit(fail === 0 ? 0 : 1);