// E2E: 高光笔记 LLM 升级生产验证（www.clipopai.com）
// 登录 admin → /video-notes 输入 Bilibili 公开视频 → 生成笔记 →
// 断言 engine=llm/local + UI 渲染 → 保存 → /notes 列表可见。
// 运行: node scripts/e2e-video-notes.mjs
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = 'https://www.clipopai.com';
const PROXY = 'http://127.0.0.1:7897';
const EMAIL = 'admin@126.com';
const PASSWORD = 'admin@666666';

// 视频源：Bilibili 公开视频（多数无匿名可用的 CC 字幕 → engine=local）；
// 兜底 YouTube（官方自动字幕，经 Invidious 镜像从 Vercel 抓取 → engine=llm 概率高）
const URLS = [
  'https://www.bilibili.com/video/BV1GJ411x7h7', // Never Gonna Give You Up（官方 MV）
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Astley（YouTube 自动字幕）
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    proxy: { server: PROXY },
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleLogs = [];
  page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
  page.on('pageerror', (e) => consoleLogs.push(`[pageerror] ${String(e).slice(0, 160)}`));

  // 捕获 /api/video-notes/generate 响应，读取 engine 字段
  let genResponse = null;
  page.on('response', async (r) => {
    if (r.url().includes('/api/video-notes/generate') && r.status() === 200) {
      try {
        genResponse = await r.json();
      } catch {}
    }
  });

  // 1. 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    if (!(await page.url()).includes('/login')) break;
  }
  if ((await page.url()).includes('/login')) {
    console.log('[FAIL] 登录失败'); await browser.close(); process.exit(1);
  }
  console.log('[1] 登录成功:', await page.url());

  // 2. 打开 /video-notes
  await page.goto(`${BASE}/video-notes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[type="url"]', { timeout: 30000 });
  console.log('[2] /video-notes 已加载');

  // 3. 逐个 URL 生成，直到拿到结构化笔记
  let engine = null;
  let savedHref = null;
  for (const url of URLS) {
    genResponse = null;
    await page.locator('input[type="url"]').fill(url);
    const genBtn = page.locator('button:has(.lucide-file-text)').first();
    await genBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (!(await genBtn.isVisible().catch(() => false))) {
      console.log(`[3] 找不到生成按钮 (url=${url})`);
      continue;
    }
    await genBtn.click();
    // 等待响应（最多 150s）
    for (let i = 0; i < 75 && !genResponse; i++) await sleep(2000);
    if (!genResponse) {
      console.log(`[3] ${url} 生成超时/失败`);
      continue;
    }
    engine = genResponse.engine || 'local';
    console.log(`[3] ${url} → engine=${engine}, summary=${(genResponse.note?.summary || '').slice(0, 60)}`);
    if (engine === 'llm' && genResponse.note?.highlights?.length) break;
  }
  if (!genResponse) {
    console.log('[FAIL] 所有 URL 生成失败');
    console.log(consoleLogs.slice(-15).join('\n'));
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/notes_fail.png', fullPage: true });
    await browser.close(); process.exit(1);
  }

  // 4. UI 断言：结果视图渲染出 summary / highlights / takeaways / corePoints
  const note = genResponse.note;
  if (!note.summary || typeof note.summary !== 'string') throw new Error('[FAIL] summary 缺失');
  if (!Array.isArray(note.highlights) || note.highlights.length === 0) throw new Error('[FAIL] highlights 缺失');
  if (!Array.isArray(note.takeaways) || note.takeaways.length === 0) throw new Error('[FAIL] takeaways 缺失');
  if (!Array.isArray(note.corePoints) || note.corePoints.length === 0) throw new Error('[FAIL] corePoints 缺失');
  console.log(`[4] JSON 结构 OK: highlights=${note.highlights.length}, takeaways=${note.takeaways.length}, corePoints=${note.corePoints.length}`);

  // 等待结果视图 DOM 渲染（保存按钮出现）
  const saveBtn = page.locator('button:has(.lucide-save)').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  const resultVisible = await saveBtn.isVisible().catch(() => false);
  if (!resultVisible) {
    console.log('[FAIL] 结果视图未渲染');
    console.log(consoleLogs.slice(-15).join('\n'));
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/notes_result.png', fullPage: true });
    await browser.close(); process.exit(1);
  }
  console.log('[4] 结果视图已渲染');

  // 5. 保存
  await saveBtn.click();
  const viewLink = page.locator('a[href^="/notes/"]').first();
  await viewLink.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  if (!(await viewLink.isVisible().catch(() => false))) {
    console.log('[FAIL] 保存后未出现查看链接');
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/notes_save.png', fullPage: true });
    await browser.close(); process.exit(1);
  }
  savedHref = await viewLink.getAttribute('href');
  console.log('[5] 保存成功:', savedHref);

  // 6. 打开保存的笔记详情页，断言 summary 可见
  await page.goto(`${BASE}${savedHref}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  const summaryVisible = await page.locator(`text=${note.summary.slice(0, 30)}`).first().isVisible().catch(() => false);
  console.log(`[6] 详情页 summary 可见: ${summaryVisible}`);
  if (!summaryVisible) {
    await page.screenshot({ path: '/Users/aiven/Desktop/AI/codex/.pwtest/notes_detail.png', fullPage: true });
  }

  // 7. /notes 列表可见
  await page.goto(`${BASE}/notes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
  const title = (genResponse.videoTitle || '').slice(0, 30);
  const listVisible = title ? await page.locator(`text=${title}`).first().isVisible().catch(() => false) : false;
  console.log(`[7] /notes 列表包含标题 "${title}": ${listVisible}`);

  await browser.close();
  const verdict = summaryVisible && listVisible && engine;
  console.log(`\n=== E2E ${verdict ? 'PASS' : 'PARTIAL'} engine=${engine} saved=${savedHref} ===`);
  if (!verdict) process.exit(1);
})().catch((e) => {
  console.error('E2E error:', e);
  process.exit(1);
});
