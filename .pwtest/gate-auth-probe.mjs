// 付费墙防伪回归探针：无 token 伪造 plan 必须被拒；真实登录态（带 cookie）必须放行。
// 用法: BASE=https://www.clipopai.com EMAIL=... PASSWORD=... node .pwtest/gate-auth-probe.mjs
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

// 页面上下文里发同源请求 → 浏览器自动带上 clipop_access_token cookie
const probe = (page, path, body) =>
  page.evaluate(async ({ path, body }) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let text = '';
    try { text = (await res.text()).slice(0, 160); } catch {}
    return { status: res.status, text };
  }, { path, body });

const browser = await chromium.launch({ channel: 'chrome' });

// 1) 未登录：伪造 plan=pro 必须 403（旧实现会放行 → 付费墙漏洞）
const anon = await browser.newContext();
const anonPage = await anon.newPage();
await anonPage.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
let r = await probe(anonPage, '/api/export-all', { plan: 'pro' });
check('未登录 伪造 plan=pro 被拒', r.status === 403, `status=${r.status} ${r.text}`);
r = await probe(anonPage, '/api/compile-clips', { plan: 'pro' });
check('未登录 compile-clips 伪造被拒', r.status === 403, `status=${r.status}`);
await anon.close();

// 2) 真实登录：拿到 cookie 后服务端应识别身份并放行（非 403 = 通过门控）
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]').catch(() => {});
await page.waitForTimeout(8000);

const hasCookie = await page.evaluate(() => document.cookie.includes('clipop_access_token'));
check('登录后写入 clipop_access_token cookie', hasCookie);
console.log('  url =', page.url());

r = await probe(page, '/api/export-all', { plan: 'free' }); // 即便谎报 free，也应以服务端身份为准
check('登录态 export-all 通过门控（非 403）', r.status !== 403, `status=${r.status} ${r.text}`);
r = await probe(page, '/api/compile-clips', { plan: 'free' });
check('登录态 compile-clips 通过门控（非 403）', r.status !== 403, `status=${r.status} ${r.text}`);

await ctx.close();
await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);