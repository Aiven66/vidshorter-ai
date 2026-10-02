/**
 * E2E：高光笔记「逐字稿」页签 + 翻译。
 *
 * 用法：
 *   BASE=http://localhost:3000 node .pwtest/notes-transcript.mjs            # 本地（无 LLM key → 断言明文报错）
 *   BASE=https://www.clipopai.com node .pwtest/notes-transcript.mjs          # 生产（断言真翻译）
 *   EXPECT_TRANSLATION=1 强制要求翻译成功（生产用）
 *   TEST_VIDEO_URL=...   自定义视频
 */
import pw from '/Users/aiven/Desktop/AI/node_modules/playwright/index.js';
import fs from 'node:fs';

const { chromium } = pw;
const BASE = process.env.BASE || 'http://localhost:3000';
const PROXY = { server: 'http://127.0.0.1:7897', bypass: 'localhost,127.0.0.1' };
const EXPECT_TRANSLATION = process.env.EXPECT_TRANSLATION === '1';
// TED talk（有官方英文字幕，逐字稿稳定可获取）
const VIDEO_URL = process.env.TEST_VIDEO_URL || 'https://www.youtube.com/watch?v=arj7oStGLkU';

const OUT = '.pwtest/notes-transcript';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const check = (name, pass, extra = '') => {
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  proxy: PROXY,
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

let generatePayload = null;
let translateStatus = null;
let translateBody = null;
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/api/video-notes/generate')) {
    generatePayload = await r.json().catch(() => null);
  }
  if (u.includes('/api/video-notes/translate')) {
    translateStatus = r.status();
    translateBody = await r.json().catch(() => null);
  }
});

const t0 = Date.now();
const el = () => `${Math.round((Date.now() - t0) / 1000)}s`;

// ── 1. 登录 ───────────────────────────────────────────────
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
check('管理员登录成功', loggedIn, `url=${page.url()}`);
if (!loggedIn) {
  await browser.close();
  console.log('\n登录失败，终止。');
  process.exit(1);
}

// ── 2. 生成笔记 ───────────────────────────────────────────
await page.goto(`${BASE}/video-notes`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(4000);
const urlInput = page.locator('input[type=url]').first();
await urlInput.waitFor({ state: 'visible', timeout: 60000 });
await urlInput.fill(VIDEO_URL);
const genBtn = page
  .locator('button:not([disabled]):has-text("Generate Note"), button:not([disabled]):has-text("生成笔记")')
  .first();
await genBtn.waitFor({ state: 'visible', timeout: 60000 });
await genBtn.click();
console.log(`[${el()}] 已提交 ${VIDEO_URL}`);

// 等页签出现（结果区渲染完成）
const transcriptTab = page.locator('button:has-text("Transcript"), button:has-text("逐字稿")').first();
let appeared = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(4000);
  if ((await transcriptTab.count()) > 0) { appeared = true; break; }
  if (i % 5 === 0) console.log(`    …${el()} 等待笔记生成`);
}
check('结果区出现「逐字稿」页签', appeared);
if (!appeared) {
  const body = await page.locator('body').innerText().catch(() => '');
  console.log('页面尾部文本：', body.slice(-500));
  await page.screenshot({ path: `${OUT}/no-result.png`, fullPage: true });
  await browser.close();
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(1);
}

const transcriptLen = generatePayload?.transcript?.length ?? 0;
console.log(`[${el()}] generate 返回逐字稿行数：${transcriptLen}，truncated=${generatePayload?.transcriptTruncated}，engine=${generatePayload?.engine}`);
console.log(`[${el()}] 逐字稿诊断：source=${generatePayload?.transcriptDiag?.source}`);
for (const a of generatePayload?.transcriptDiag?.attempts || []) console.log(`      · ${a}`);
check('generate 响应含 transcript 数组', Array.isArray(generatePayload?.transcript), `len=${transcriptLen}`);

// ── 3. 打开逐字稿页签 ────────────────────────────────────
await transcriptTab.click();
await page.waitForTimeout(3000);
// 注意：不能用 'main, body'（多元素命中会触发 strict mode 报错，被 catch 吞成空串）
const panelText = await page.locator('body').innerText().catch(() => '');
const emptyState =
  /No transcript is available|暂无可获取的字幕逐字稿|暫無可取得的字幕逐字稿/.test(panelText);
// 空态必须同时给出明文原因（绝不静默失败）
const blockedHint =
  /blocking transcript access|暂时限制了服务器获取该视频的字幕|暫時限制了伺服器取得該影片的字幕/.test(panelText);
check('逐字稿页签内容渲染（有稿或有明确空态）', transcriptLen > 0 || emptyState, `empty=${emptyState}`);
if (transcriptLen === 0) {
  check('空态给出明文原因', blockedHint, `blocked=${blockedHint}`);
  console.log(`[${el()}] 逐字稿面板文本片段：${JSON.stringify(panelText.slice(0, 600))}`);
  await page.screenshot({ path: `${OUT}/empty-panel.png`, fullPage: true });
}

const rowCount = await page.locator('button[title*="Play at"], button[title*="播放至"]').count();
console.log(`[${el()}] 逐字稿时间戳按钮数：${rowCount}`);
check('逐字稿行数与接口一致', rowCount === Math.min(transcriptLen, 1500) || (transcriptLen === 0 && emptyState),
  `rows=${rowCount} api=${transcriptLen}`);

// ── 3.5 已保存笔记详情页 /notes/[id] 也必须有「逐字稿」页签 ──────
// 用户在「视频右侧的高光笔记区域」看不到页签时的现场很可能是这里，必须覆盖。
const saveBtn = page
  .locator('button:has-text("Save to Note"), button:has-text("保存到笔记")')
  .first();
if ((await saveBtn.count()) > 0) {
  const savedResp = page.waitForResponse(
    (r) => r.url().includes('/api/video-notes') && r.request().method() === 'POST' && !r.url().includes('generate'),
    { timeout: 30000 },
  );
  await saveBtn.click();
  let savedId = null;
  try {
    const r = await savedResp;
    savedId = (await r.json().catch(() => null))?.id ?? null;
  } catch { /* 保存超时由下面的断言体现 */ }
  check('笔记保存成功', !!savedId, `id=${savedId || '(无)'}`);
  if (savedId) {
    await page.goto(`${BASE}/notes/${savedId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const detailTab = page.locator('button:has-text("Transcript"), button:has-text("逐字稿")').first();
    let detailTabOk = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      if ((await detailTab.count()) > 0) { detailTabOk = true; break; }
    }
    check('已保存笔记页 /notes/[id] 出现「逐字稿」页签', detailTabOk);
    if (detailTabOk) {
      await detailTab.click();
      // 逐字稿是切页签后按需拉取，上游被风控时会重试多个源，可能耗时 60s+，必须轮询
      let detailOk = false;
      for (let i = 0; i < 45; i++) {
        await page.waitForTimeout(2000);
        const detailText = await page.locator('body').innerText().catch(() => '');
        if (transcriptLen > 0) {
          if ((await page.locator('button[title*="Play at"], button[title*="播放至"]').count()) > 0) {
            detailOk = true;
            break;
          }
        } else if (
          /No transcript is available|暂无可获取的字幕逐字稿|暫無可取得的字幕逐字稿|Failed to load the transcript|逐字稿加载失败|逐字稿載入失敗/.test(
            detailText,
          )
        ) {
          detailOk = true;
          break;
        }
      }
      check('已保存笔记页逐字稿页签内容渲染', detailOk, `len=${transcriptLen}`);
      await page.screenshot({ path: `${OUT}/saved-note-transcript.png`, fullPage: true });
    }
  }
} else {
  check('结果区存在「Save to Note」按钮', false, '按钮未找到，跳过 /notes/[id] 验证');
}

if (transcriptLen === 0) {
  // 无字幕时无法验证翻译，明确报告为环境问题（非功能缺陷）
  console.log('\n[警告] 该视频本次未取到字幕，翻译链路未被验证（外部字幕源问题）。');
  await page.screenshot({ path: `${OUT}/empty-transcript.png`, fullPage: true });
  await browser.close();
  console.log(`\n${fail} CHECK(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── 4. 翻译 ──────────────────────────────────────────────
const langSelect = page.locator('#transcript-target-lang');
await langSelect.waitFor({ state: 'visible', timeout: 20000 });
const targetLang = BASE.includes('localhost') ? 'en' : 'zh-Hans';
await langSelect.selectOption(targetLang);
const translateBtn = page
  .locator('button:has-text("Translate"), button:has-text("翻译")')
  .first();
await translateBtn.click();
console.log(`[${el()}] 已点击翻译 → ${targetLang}，等待结果…`);

const errLocator = page.locator('p.text-destructive');
let done = false;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(3000);
  if (translateStatus !== null) { done = true; break; }
  if ((await errLocator.count()) > 0) { done = true; break; }
}
console.log(`[${el()}] translate 状态=${translateStatus} body尾=${translateBody ? JSON.stringify(translateBody).slice(-200) : '(无)'}`);

if (EXPECT_TRANSLATION) {
  check('翻译接口返回 200', translateStatus === 200, `status=${translateStatus}`);
  check('翻译返回逐字稿行数一致',
    Array.isArray(translateBody?.segments) && translateBody.segments.length === transcriptLen,
    `got=${translateBody?.segments?.length} expect=${transcriptLen}`);
  const untranslated = translateBody?.untranslated ?? 0;
  check('全部行均已翻译（untranslated=0）', untranslated === 0, `untranslated=${untranslated}`);
  // 译文确实不同于原文（抽查前 20 行）
  const diffCount = (translateBody?.segments || []).slice(0, 20).filter((s, i) => s.text !== generatePayload.transcript[i]?.text).length;
  check('译文与原文不同（前 20 行抽查）', diffCount >= 15, `diff=${diffCount}/20`);
  const tabsText = await page.locator('body').innerText().catch(() => '');
  check('UI 出现「只看原文/显示原文」与翻译后控件', /Show original|显示原文/.test(tabsText));
} else {
  // 本地无 LLM key：必须明文报错（绝不静默降级）
  check('无 LLM key 时翻译给出明文原因（非静默失败）',
    translateStatus === 503 && /暂不可用|unavailable/i.test(translateBody?.error || ''),
    `status=${translateStatus} err=${translateBody?.error || '(无)'}`);
  const redErr = await errLocator.allInnerTexts().catch(() => []);
  check('页面展示红色错误提示', redErr.length > 0, redErr.join(' | ').slice(0, 200));
}

check('无 pageerror', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: `${OUT}/final.png`, fullPage: true });
await browser.close();
console.log(fail === 0 ? '\nALL NOTES-TRANSCRIPT CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);