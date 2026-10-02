// /digital-human-live 云端真人数字人卡片 · 渲染回归探针
// 用法: BASE=https://www.clipopai.com EMAIL=... PASSWORD=... node .pwtest/dh-ui-probe.mjs
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = process.env.BASE || 'https://www.clipopai.com';
const EMAIL = process.env.EMAIL || 'admin@126.com';
const PASSWORD = process.env.PASSWORD || 'admin@666666';

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fail++;
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300));
});
page.on('requestfailed', (r) => console.log('  REQFAIL', r.url().slice(0, 140), r.failure()?.errorText));
page.on('response', (r) => {
  if (r.url().includes('/api/digital-human/')) console.log('  RESP', r.status(), r.url().slice(0, 140));
});

// 1) 登录（拿到 cookie，卡片才会显示可用态）
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]').catch(() => {});
await page.waitForTimeout(8000);

// 2) 打开页面（该页 client bundle 较大，hydration 较慢 → 用 waitForFunction 断言文本，最稳）
await page.goto(BASE + '/digital-human-live', { waitUntil: 'domcontentloaded', timeout: 120000 });

const waitText = (needle, timeout) =>
  page
    .waitForFunction((t) => document.body.innerText.includes(t), needle, { timeout, polling: 500 })
    .then(() => true)
    .catch(() => false);

check('云端真人数字人卡片渲染', await waitText('云端真人数字人', 45000));
// 模型徽标 = /capabilities 已回填的信号（cap.model 渲染为 <code>）。
// 注意：该路由生产冷启动实测约 37s（warm 后 0.5s），故超时放宽到 60s。
check('显示模型标识 wan2.2-s2v', await waitText('wan2.2-s2v', 60000));

const genBtn = await page.getByRole('button', { name: /生成真人数字人视频/ }).count();
check('生成按钮存在', genBtn > 0);

const presetVoices = await page.getByText('Cherry', { exact: false }).count();
check('预设音色 chips 存在', presetVoices > 0);

// 导航入口
const navHref = await page.locator('a[href="/digital-human-live"]').count();
check('左侧菜单含数字人带货短视频入口', navHref > 0);

// 只保留与业务相关的运行时错误：过滤 favicon/4xx 静态噪声，以及 Google Analytics
// 的第三方连接中断与 Next.js 路由 prefetch 主动取消（均与页面功能无关）。
const NOISE = /favicon|Failed to load resource: the server responded with a status of 40|google-analytics\.com|doubleclick\.net|ERR_CONNECTION_CLOSED|ERR_ABORTED/i;
const relevant = errors.filter((e) => !NOISE.test(e));
check('无客户端运行时错误', relevant.length === 0, relevant.slice(0, 3).join(' | '));

await page.screenshot({ path: '/tmp/clipop-dh-ui.png', fullPage: false });
console.log('  screenshot=/tmp/clipop-dh-ui.png');

await ctx.close();
await browser.close();
console.log(`\n${fail === 0 ? 'DH_UI_PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);