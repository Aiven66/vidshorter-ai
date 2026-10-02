import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';

const { chromium } = pw;
const BASE = 'https://www.clipopai.com';
const PROXY = { server: 'http://127.0.0.1:7897' };
let fail = 0;
const check = (name, pass, extra = '') => {
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, proxy: PROXY });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

// ── 登录管理员 ─────────────────────────────────────────────
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('input[type=email]', { timeout: 60000 });
await page.fill('input[type=email]', 'admin@126.com');
await page.fill('input[type=password]', 'admin@666666');
await page.click('button[type=submit]');
await page.waitForTimeout(8000);
check('管理员登录成功', !page.url().includes('/login'), `url=${page.url()}`);

// ── /video-clips 页面 ─────────────────────────────────────
await page.goto(BASE + '/video-clips', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('h1', { timeout: 60000 });
await page.waitForTimeout(4000);

const body = await page.locator('body').innerText();
check('Hero 渲染', (await page.locator('h1').first().innerText()).includes('Viral Shorts'));
check('处理卡片就绪（已登录不提示登录）', !body.includes('Login to start processing videos'));
check('分析按钮存在', await page.getByRole('button', { name: /Analyze/i }).first().isVisible());

check('常见问题(FAQ)已隐藏', !body.includes('Frequently Asked Questions'));
check('如何使用已隐藏', !body.includes('How It Works'));
check('编辑展示已隐藏', !body.includes('From long video to polished short clips'));
check('功能特性已隐藏', !body.includes('Powerful AI Video Clipping'));

const advBtn = page.getByRole('button', { name: /Advanced settings/i });
check('「高级设置」按钮可见', await advBtn.isVisible());
check('快捷预设默认收起（不可见）', (await page.getByText('Quick presets', { exact: false }).count()) === 0);
check('竖屏菜单默认收起（不可见）', (await page.getByText('9:16 Portrait', { exact: false }).count()) === 0);

await advBtn.click();
await page.waitForTimeout(1000);
check('展开后快捷预设可见', await page.getByText('Quick presets', { exact: false }).isVisible());
check('展开后竖屏菜单可见（付费）', (await page.getByText('9:16 Portrait', { exact: false }).count()) > 0);
check('展开后生成选项可见（付费）', (await page.getByText('Number of clips', { exact: false }).count()) > 0);
check('展开后卡拉OK开关可见（付费）', (await page.getByText('Karaoke Subtitles', { exact: false }).count()) > 0);

// 字幕样式菜单受 exportSubtitles||exportKaraoke 门控：默认关闭时不应出现，
// 打开卡拉OK后才出现（这是设计行为，不是缺陷）。
check('字幕样式默认不出现（字幕未开启）', (await page.getByText('Subtitle style', { exact: false }).count()) === 0);
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent.trim() === 'Karaoke Subtitles');
  const row = el?.parentElement;
  const input = row?.querySelector('input[type=checkbox]');
  if (input) input.click();
});
await page.waitForTimeout(800);
check('开启卡拉OK后字幕样式菜单出现（付费）', (await page.getByText('Subtitle style', { exact: false }).count()) > 0);
// 收尾：关掉卡拉OK，避免影响后续断言
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent.trim() === 'Karaoke Subtitles');
  const input = el?.parentElement?.querySelector('input[type=checkbox]');
  if (input) input.click();
});
await page.waitForTimeout(500);

// ── 已上线的分包逻辑 ──────────────────────────────────────
const bundleScan = await page.evaluate(async () => {
  const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src).filter((s) => s.includes('/_next/'));
  const all = [];
  for (const src of srcs) {
    try { all.push(await (await fetch(src)).text()); } catch { /* ignore */ }
  }
  const joined = all.join('\n');
  return {
    hasBatch: joined.includes('clipopai-clips-part'),
    // 旧的 300s 硬失败文案必须已从产物中消失
    hasOldLimitMsg: joined.includes('Total clip duration too long'),
    // 扩展名推导必须优先识别 zip（否则 ZIP 被命名成 .webm 打不开）
    hasZipExt: /\.type\.includes\(["']zip["']\)/.test(joined),
  };
});
check('线上 bundle 已含分包下载逻辑', bundleScan.hasBatch);
check('旧的 300s 硬失败文案已移除', !bundleScan.hasOldLimitMsg);
check('ZIP 扩展名推导已修复', bundleScan.hasZipExt);

check('无 pageerror', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: '.pwtest/prod-video-clips.png' });
await browser.close();
console.log(fail === 0 ? '\nALL PROD UI CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);