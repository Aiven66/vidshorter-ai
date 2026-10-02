// E2E: 验证"出片成功即一键分享"按钮渲染 + 桌面端复制链接降级反馈
const { chromium } = require('/Users/aiven/Desktop/AI/node_modules/playwright');

const BASE = process.env.SHARE_TEST_BASE || 'https://www.clipopai.com';
console.log('[base]', BASE);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', proxy: { server: 'http://127.0.0.1:7897', bypass: '127.0.0.1,localhost' } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  // 强制走桌面降级链路：禁用 Web Share，授权剪贴板写入，验证"复制链接+绿色对勾"反馈
  if (process.env.SHARE_TEST_FORCE_FALLBACK) {
    await ctx.grantPermissions(['clipboard-write'], { origin: BASE });
    await ctx.addInitScript(() => {
      try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch {}
      return;
    });
  }
  const page = await ctx.newPage();
  const consoleLogs = [];
  page.on('console', (m) => { const t = m.text(); if (/Share|share|clipboard/i.test(t)) consoleLogs.push(`[${m.type()}] ${t.slice(0, 200)}`); });

  // 1. 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'admin@126.com');
  await page.fill('#password', 'admin@666666');
  await page.click('button[type="submit"]');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    if (!(await page.url()).includes('/login')) break;
  }
  console.log('[1] 登录后 URL:', await page.url());
  if ((await page.url()).includes('/login')) { console.log('[FAIL] 登录失败'); await browser.close(); process.exit(1); }

  // 2. 首页（VideoProcessor 所在）填入链接生成
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="链接"], input[placeholder*="URL"], input[placeholder*="url"]').first();
  await urlInput.waitFor({ state: 'visible', timeout: 30000 });
  await urlInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  console.log('[2] 已填入视频链接');

  const analyzeBtn = page.locator('button:not([disabled]):has-text("Analyze"), button:not([disabled]):has-text("分析"), button:not([disabled]):has-text("Generate"), button:not([disabled]):has-text("生成")').first();
  await analyzeBtn.waitFor({ state: 'visible', timeout: 20000 });
  await analyzeBtn.click();
  console.log('[3] 已点击分析按钮，等待出片...');

  // 3. 等待分享按钮出现（最多6分钟）
  let shareBtn = null;
  for (let i = 0; i < 72; i++) {
    await page.waitForTimeout(5000);
    const sh = page.locator('button[title="Share"], button[title="分享"]');
    if ((await sh.count()) > 0) { shareBtn = sh; break; }
    if (i % 6 === 0) console.log(`    ...${i * 5}s`);
  }
  if (!shareBtn) {
    console.log('[FAIL] 未出现分享按钮');
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/e2e_share_no.png', fullPage: true });
    await browser.close(); process.exit(1);
  }
  console.log('[4] 分享按钮已出现，数量:', await shareBtn.count());

  // 4. 记录点击前图标，点击后应出现绿色对勾（桌面端降级：复制链接反馈）
  const firstShare = shareBtn.first();
  const beforeSvg = await firstShare.locator('svg').first().getAttribute('class').catch(() => '');
  await firstShare.click();
  await page.waitForTimeout(800);
  const afterSvg = await firstShare.locator('svg').first().getAttribute('class').catch(() => '');
  console.log('[5] 点击前图标class:', beforeSvg, '| 点击后:', afterSvg);
  const hasGreenCheck = /text-green-500/.test(afterSvg || '');
  console.log('[6] 反馈对勾出现:', hasGreenCheck ? '✓ PASS' : '?');

  // 5. 尝试读取剪贴板（headless 需权限，可能为空，仅记录）
  let clip = '';
  try { clip = await page.evaluate(() => navigator.clipboard.readText ? navigator.clipboard.readText() : ''); } catch (e) { clip = '(无法读剪贴板)'; }
  console.log('[7] 剪贴板内容:', String(clip).slice(0, 120) || '(空/无权限)');

  await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/e2e_share.png', fullPage: true });
  console.log('\n===== console (share/clipboard) =====');
  consoleLogs.slice(-15).forEach((l) => console.log(' ', l));
  await browser.close();
  console.log('\n若 [4] PASS 且 [6] 出现对勾，则分享按钮与桌面降级链路已生效。');
})();