// 导出即付费墙回归探针：页面无运行时错误 + 客户端 bundle 已带上门控标识。
// 用法: BASE=http://127.0.0.1:5100 node .pwtest/export-paywall-probe.mjs
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = process.env.BASE || 'http://127.0.0.1:5100';
const PATHS = ['/', '/video-clips', '/dashboard'];

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fail++;
};

const browser = await chromium.launch({ channel: 'chrome' });

for (const p of PATHS) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const txt = m.text();
    // dev-only 噪音：自定义 server 下 HMR websocket 握手失败，与业务无关
    if (txt.includes('webpack-hmr') || txt.includes('WebSocket connection')) return;
    errors.push('[console] ' + txt.slice(0, 200));
  });
  const res = await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 120000 });
  check(`${p} 返回 200`, res?.status() === 200, `status=${res?.status()}`);
  await page.waitForTimeout(2500);
  check(`${p} 无运行时错误`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// 客户端 bundle 必须包含导出即付费墙标识（证明新代码已进入前端产物）
const page = await browser.newPage();
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(3000);
const scriptSrcs = await page.$$eval('script[src]', (els) => els.map((e) => e.src));
let found = false;
const needles = ['export_requires_paid', 'exportPaywall', 'export_paywall'];
for (const src of scriptSrcs) {
  try {
    const txt = await (await fetch(src)).text();
    if (needles.some((n) => txt.includes(n))) { found = true; console.log(`  ↳ 命中前端 chunk: ${src.split('/').pop()}`); break; }
  } catch { /* ignore */ }
}
check('客户端 bundle 含导出付费墙标识', found, `已扫描 ${scriptSrcs.length} 个 script`);
await page.close();

await browser.close();
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);