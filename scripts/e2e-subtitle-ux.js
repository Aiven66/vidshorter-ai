// E2E: AI 自动字幕烧录验证（生产，真实 UI 流程）
// 登录 admin → /video-clips 填链接 → 分析生成 clips → 勾选 AI 字幕开关 →
// 点击 Download → 捕获 MP4 → 解码校验 + 抽帧确认字幕文字烧入画面。
const { chromium } = require('/Users/aiven/Desktop/AI/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'https://www.clipopai.com';
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const OUT = '/Users/aiven/Desktop/AI/codex/.pwtest/subtitle_clip.mp4';
const FRAME = '/Users/aiven/Desktop/AI/codex/.pwtest/subtitle_frame.png';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', proxy: { server: 'http://127.0.0.1:7897' } });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  fs.mkdirSync('/Users/aiven/Desktop/AI/codex/.pwtest', { recursive: true });

  const consoleLogs = [];
  page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text().slice(0,180)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/cut-clip')) console.log(`  [NET] ${r.status()} cut-clip`);
  });

  // 1. 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'admin@126.com');
  await page.fill('#password', 'admin@666666');
  await page.click('button[type="submit"]');
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); if (!(await page.url()).includes('/login')) break; }
  console.log('[1] 登录后 URL:', await page.url());
  if ((await page.url()).includes('/login')) { console.log('[FAIL] 登录失败'); await browser.close(); process.exit(1); }

  // 2. 填链接 + 分析
  await page.goto(`${BASE}/video-clips`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const urlInput = page.locator('input[placeholder*="YouTube"], input[placeholder*="youtube"], input[placeholder*="链接"], input[placeholder*="URL"], input[placeholder*="url"]').first();
  await urlInput.waitFor({ state: 'visible', timeout: 30000 });
  await urlInput.fill(VIDEO);
  await page.waitForTimeout(500);
  const analyzeBtn = page.locator('button:not([disabled]):has-text("Analyze"), button:not([disabled]):has-text("分析"), button:not([disabled]):has-text("Generate"), button:not([disabled]):has-text("生成")').first();
  await analyzeBtn.waitFor({ state: 'visible', timeout: 20000 }).catch(()=>{});
  console.log('[2] 已填链接');
  if (await analyzeBtn.isVisible().catch(()=>false)) { await analyzeBtn.click(); console.log('[2] 已点分析'); }

  // 3. 等待 Download 按钮 + AI 字幕开关出现（最多 6 分钟）
  let dlBtn = null, subCheck = null;
  for (let i = 0; i < 72; i++) {
    await page.waitForTimeout(5000);
    if (!dlBtn) { const d = page.locator('button:has-text("Download"), button:has-text("下载")'); if ((await d.count()) > 0) dlBtn = d; }
    if (!subCheck) {
      const sc = page.locator('text=/AI Subtitles|AI 自动字幕|字幕/').first();
      if (await sc.count() > 0) subCheck = sc;
    }
    if (dlBtn && subCheck) break;
  }
  if (!dlBtn) { console.log('[FAIL] 未出现 Download 按钮'); console.log(consoleLogs.slice(-15).join('\n')); await browser.close(); process.exit(1); }
  console.log('[3] Download 出现:', await dlBtn.count(), ', 字幕开关:', !!subCheck);

  // 4. 勾选 AI 字幕（开关是上方 checkbox，找到其挂载 label）
  if (subCheck) {
    const wrapper = page.locator('div').filter({ hasText: /AI Subtitles|AI 自动字幕/ }).last();
    const cb = wrapper.locator('input[type="checkbox"]').first();
    if (await cb.count() > 0) { await cb.check({ force: true }); console.log('[4] 已勾选 AI 字幕'); }
    else { console.log('[4] 未找到字幕 checkbox，截图'); await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/sub_checkbox.png', fullPage: true }); }
  }

  // 5. 下载第一个 clip
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 300_000 }),
    dlBtn.first().click(),
  ]);
  await download.saveAs(OUT);
  console.log('[5] 捕获下载:', download.suggestedFilename());

  // 6. 校验解码 + 抽帧
  let dec = '';
  try { execFileSync('/opt/homebrew/bin/ffmpeg', ['-v','error','-i',OUT,'-f','null','-'], { encoding:'utf8', timeout:120000, stdio:['ignore','pipe','pipe'] }); dec='(无错误)'; }
  catch(e){ dec=(e.stdout||'')+(e.message||'').slice(0,300); }
  let info=''; try{ execFileSync('/opt/homebrew/bin/ffmpeg',['-i',OUT],{encoding:'utf8',timeout:30000}); }catch(e){ info=(e.stderr||'').split('\n').filter(l=>/Stream|Duration/i.test(l)).join(' | '); }
  const buf = fs.readFileSync(OUT);
  console.log('[6] size=', buf.length, 'ftyp=', buf.slice(4,8).toString(), '解码:', dec.slice(0,200));
  console.log('[6] 流信息:', info);
  try {
    execFileSync('/opt/homebrew/bin/ffmpeg', ['-y','-ss','5','-i',OUT,'-frames:v','1',FRAME], { encoding:'utf8', timeout:60000 });
    console.log('[6] 帧已抽出（打开查看底部是否有字幕）:', FRAME);
  } catch(e){ console.log('[6] 抽帧失败:', (e.message||'').slice(0,150)); }

  console.log('\n===== console 尾部 =====');
  consoleLogs.slice(-20).forEach(l => console.log(' ', l));
  await browser.close();
})();