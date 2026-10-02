import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';

const { chromium } = pw;
const BASE = process.env.BASE || 'http://localhost:5100';
let fail = 0;
const check = (name, pass, extra = '') => {
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(BASE + '/video-clips', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForSelector('h1', { timeout: 120000 });
await page.waitForTimeout(3000);

const body = await page.locator('body').innerText();

// 1) 核心工具仍在
check('Hero 标题渲染', (await page.locator('h1').first().innerText()).includes('Viral Shorts'));
check('URL 输入框存在', (await page.locator('input').count()) > 0);
check('分析按钮存在', await page.getByRole('button', { name: /Analyze/i }).first().isVisible());

// 2) 营销区块已隐藏
check('常见问题(FAQ)已隐藏', !body.includes('Frequently Asked Questions'));
check('如何使用已隐藏', !body.includes('How It Works'));
check('编辑展示已隐藏', !body.includes('From long video to polished short clips'));
check('功能特性已隐藏', !body.includes('Powerful AI Video Clipping'));

// 3) 高级设置默认收起
const advBtn = page.getByRole('button', { name: /Advanced settings/i });
check('「高级设置」按钮可见', await advBtn.isVisible());
check('快捷预设默认不可见', (await page.getByText('Quick presets', { exact: false }).count()) === 0);
check('画质菜单默认不可见', (await page.getByText('9:16 Portrait', { exact: false }).count()) === 0);

// 4) 展开后才出现
await advBtn.click();
await page.waitForTimeout(800);
check('展开后快捷预设可见', await page.getByText('Quick presets', { exact: false }).isVisible());
check('展开后自定义预设按钮可见', await page.getByRole('button', { name: /^Custom$/ }).isVisible());
check('展开后画质 SD/HD 菜单可见', (await page.getByText('SD', { exact: true }).count()) > 0 && (await page.getByText('HD', { exact: true }).count()) > 0);

// 5) 无运行时/水合错误
check('无 pageerror', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: '.pwtest/local-video-clips.png', fullPage: false });
await browser.close();
console.log(fail === 0 ? '\nALL LOCAL CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);