// E2E v2: 真实复现用户下载高光视频流程（临时脚本）
const { chromium } = require('/Users/aiven/Desktop/AI/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'https://www.clipopai.com';

(async () => {
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:7897' } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  const consoleLogs = [];
  page.on('console', (m) => {
    const t = m.text();
    consoleLogs.push(`[${m.type()}] ${t.slice(0, 220)}`);
  });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/api/cut-clip') || u.includes('/api/download-youtube-clip') || u.includes('/api/remux-mp4') || u.includes('/api/video-proxy') || u.includes('/resolve') || u.includes('/stream')) {
      console.log(`  [NET] ${r.status()} ${u.slice(0, 150)}`);
    }
  });

  // 1. 登录（轮询等待跳转，最多60s）
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
  if ((await page.url()).includes('/login')) {
    const body = await page.innerText('body');
    console.log('[FAIL] 登录失败:', body.slice(0, 200));
    await browser.close(); process.exit(1);
  }

  // 2. 到 /video-clips 填入链接（Input 无 type 限定，用 placeholder 定位）
  await page.goto(`${BASE}/video-clips`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  // video-processor 是动态导入（ssr:false），等它挂载
  const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="链接"], input[placeholder*="URL"], input[placeholder*="url"]').first();
  await urlInput.waitFor({ state: 'visible', timeout: 30000 });
  await urlInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  console.log('[2] 已填入视频链接');

  // 3. 点生成按钮（Sparkles + analyze）
  const analyzeBtn = page.locator('button:not([disabled]):has-text("Analyze"), button:not([disabled]):has-text("分析"), button:not([disabled]):has-text("Generate"), button:not([disabled]):has-text("生成")').first();
  await analyzeBtn.waitFor({ state: 'visible', timeout: 20000 });
  await analyzeBtn.click();
  console.log('[3] 已点击分析按钮，等待高光生成...');

  // 4. 等待下载按钮出现（最多6分钟）
  let dlBtn = null;
  for (let i = 0; i < 72; i++) {
    await page.waitForTimeout(5000);
    const c = page.locator('button:has-text("Download"), button:has-text("下载")');
    if ((await c.count()) > 0) { dlBtn = c; break; }
    if (i % 6 === 0) console.log(`    ...${i * 5}s`);
  }
  if (!dlBtn) {
    console.log('[FAIL] 未出现下载按钮');
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/e2e_v2_no_clips.png', fullPage: true });
    console.log('console 尾部:', consoleLogs.slice(-20).join('\n'));
    await browser.close(); process.exit(1);
  }
  console.log('[4] 下载按钮已出现，数量:', await dlBtn.count());

  // 5. 点击第一个下载并捕获文件
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 300_000 }),
    dlBtn.first().click(),
  ]);
  const dlPath = '/Users/aiven/Desktop/AI/codex/.pwtest/e2e_v2_clip.bin';
  await download.saveAs(dlPath);
  console.log('[5] 捕获下载:', download.suggestedFilename());

  // 6. 校验
  let decodeErr = '';
  try {
    decodeErr = execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', dlPath, '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000, stdio: ['ignore','pipe','pipe'] });
  } catch (e) { decodeErr = (e.stdout || '') + (e.message || '').slice(0, 300); }
  let info = '';
  try { execFileSync('/opt/homebrew/bin/ffmpeg', ['-i', dlPath], { encoding: 'utf8', timeout: 30000 }); } catch (e) {
    info = (e.stderr || '').split('\n').filter(l => l.includes('Stream') || l.includes('Duration')).join(' | ');
  }
  const buf = fs.readFileSync(dlPath);
  console.log('[6] size=', buf.length, 'ftyp=', buf.slice(4, 8).toString(), 'moov@', buf.indexOf('moov'), 'mdat@', buf.indexOf('mdat'));
  console.log('[6] 流信息:', info);
  console.log('[6] 解码错误:', decodeErr ? decodeErr.slice(0, 400) : '(无 — 可播放)');

  console.log('\n===== console 尾部 =====');
  consoleLogs.slice(-25).forEach(l => console.log(' ', l));
  await browser.close();
})();
