// E2E: AI 自动字幕烧录确定性验证（生产）
// 阶段A(页面)  resolve muxed 流拿 meta + 拿 token
// 阶段B(Node)   fetch /api/cut-clip 下载 无字幕/有字幕 两版 MP4
// 阶段C        ffmpeg 抽帧 + sharp 量化底部白色文字占比 → 确定性判定
const { chromium } = require('/Users/aiven/Desktop/AI/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'https://www.clipopai.com';
const VIDEO_ID = 'dQw4w9WgXcQ';
const DIR = '/Users/aiven/Desktop/AI/codex/.pwtest';
const OUT_NO = `${DIR}/sub_no.mp4`;
const OUT_YES = `${DIR}/sub_yes.mp4`;
const F_NO = `${DIR}/sub_no_frame.png`;
const F_YES = `${DIR}/sub_yes_frame.png`;
const START = 20, DUR = 6; // 最短歌词片段（含字幕），减少下载+重编码内存占用，绕开 Vercel serverless OOM

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', proxy: { server: 'http://127.0.0.1:7897' } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  fs.mkdirSync(DIR, { recursive: true });

  // 1. 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#email', { timeout: 30000 });
  await page.fill('#email', 'admin@126.com');
  await page.fill('#password', 'admin@666666');
  await page.click('button[type="submit"]');
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(2000); if (!(await page.url()).includes('/login')) break; }
  console.log('[1] 登录后 URL:', await page.url());
  if ((await page.url()).includes('/login')) { console.log('[FAIL] 登录失败'); await browser.close(); process.exit(1); }
  await page.goto(`${BASE}/video-clips`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // 2. 页面 resolve + 拿 token（返回给 Node）
  const meta = await page.evaluate(async ({ videoId, start, CF }) => {
    let tok = '';
    for (const k of Object.keys(localStorage)) {
      if (/supabase|sb-|auth/i.test(k)) {
        try { const o = JSON.parse(localStorage.getItem(k)); const t = o?.access_token || o?.session?.access_token; if (t) { tok = t; break; } } catch {}
      }
    }
    const resolveUrl = new URL(CF);
    resolveUrl.pathname = `${resolveUrl.pathname.replace(/\/$/, '')}/resolve`;
    resolveUrl.searchParams.set('videoId', videoId);
    resolveUrl.searchParams.set('maxHeight', '720');
    // 关键：不加 muxed 才会返回 audioUrl(音频)+streamUrl(视频) 双流，cut-clip 主路径需要双流混音
    const r = await fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`/resolve ${r.status}`);
    const m = await r.json();
    if (!m.streamUrl) throw new Error('no streamUrl');
    return {
      streamUrl: m.streamUrl, audioUrl: m.audioUrl || null,
      userAgent: m.userAgent, visitorData: m.visitorData,
      xClientName: m.xClientName, clientVersion: m.clientVersion,
      clientName: m.clientName ?? m.client, token: tok,
    };
  }, { videoId: VIDEO_ID, start: START, CF: await page.evaluate(() => String(window.__CF_WORKER_URL__||'').trim()) });
  console.log('[2] resolve ok, token len=', meta.token.length, 'audio=', !!meta.audioUrl);
  await browser.close();

  // 3. Node 端 cut-clip 下载两版
  async function cut(sub, out) {
    const body = {
      streamUrl: meta.streamUrl,
      ...(meta.audioUrl ? { audioUrl: meta.audioUrl } : {}),
      userAgent: meta.userAgent, visitorData: meta.visitorData,
      xClientName: meta.xClientName, clientVersion: meta.clientVersion,
      clientName: meta.clientName,
      videoId: VIDEO_ID, startTime: START, duration: DUR, endTime: START + DUR,
      plan: 'starter', subtitles: sub,
    };
    const res = await fetch(`${BASE}/api/cut-clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(meta.token ? { Authorization: `Bearer ${meta.token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240000),
    });
    const buf = Buffer.from(await res.arrayBuffer().catch(()=>new ArrayBuffer(0)));
    const ftyp = buf.slice(4,8).toString();
    if (!res.ok || ftyp !== 'ftyp') { console.log(`[3] ${sub?'有':'无'}字幕 cut-clip HTTP ${res.status} ftyp=${ftyp} len=${buf.length}`, buf.slice(0,300).toString()); return false; }
    fs.writeFileSync(out, buf);
    console.log(`[3] ${sub?'有':'无'}字幕 MP4 已存: ${buf.length} bytes (ftyp=${ftyp})`);
    return true;
  }
  const okNo = await cut(false, OUT_NO);
  const okYes = await cut(true, OUT_YES);
  if (!okNo || !okYes) { console.log('[FAIL] cut-clip 未产出两版'); process.exit(1); }

  // 4. 抽帧
  const midSec = Math.floor(DUR / 2);
  for (const [src,dst] of [[OUT_NO,F_NO],[OUT_YES,F_YES]]) {
    try { execFileSync('/opt/homebrew/bin/ffmpeg', ['-y','-ss',String(midSec),'-i',src,'-frames:v','1','-update','1',dst], { encoding:'utf8', timeout:60000, stdio:['ignore','pipe','pipe'] }); }
    catch(e){ console.log('[4] 抽帧失败', src, (e.message||'').slice(0,150)); }
  }

  // 5. sharp 量化底部白色文字占比
  const sharp = (await import('sharp')).default;
  async function whiteRatio(p) {
    const h = (await sharp(p).metadata()).height;
    const { data, info: mi } = await sharp(p).extract({ left: 0, top: Math.floor(h*0.75), width: (await sharp(p).metadata()).width, height: Math.ceil(h*0.25) }).raw().toBuffer({ resolveWithObject: true });
    const ch = mi.channels || 3; let bright=0, total=0;
    for (let i=0;i<data.length;i+=ch){ const r=data[i],g=data[i+1],b=data[i+2]; total++; if(r>225&&g>225&&b>225) bright++; }
    return total ? bright/total : 0;
  }
  const a = await whiteRatio(F_NO).catch(()=>0);
  const b = await whiteRatio(F_YES).catch(()=>0);
  console.log(`[5] 底部白色像素占比: 无字幕=${(a*100).toFixed(3)}%  有字幕=${(b*100).toFixed(3)}%`);
  const diff = b - a;
  if (diff > 0.002) console.log(`[PASS] 有字幕版底部白色文字显著更多 (+${(diff*100).toFixed(2)}pp) → AI 字幕已烧录`);
  else console.log(`[TODO] 差异不足 (${(diff*100).toFixed(3)}pp)，请目检帧文件: ${F_NO} / ${F_YES}`);
  console.log('帧文件:', F_NO, '/', F_YES);
})();