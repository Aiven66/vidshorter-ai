/**
 * 竖屏智能追焦（Auto-Reframe）本地端到端探针。
 *
 * 构造 16:9 合成源：深灰背景 + 肤色「人物」色块从左向右匀速移动，经本机 dev 的
 * /api/cut-clip 竖屏分支导出，检查：
 *   1. 输出为 1080x1920；
 *   2. 输出帧里肤色块的水平重心**始终接近画面中心**（裁切窗跟着人物走），
 *      而不是像 blur-fit 那样固定居中；
 *   3. 无肤色源必须回落 blur-fit（不报错、输出仍合法）。
 *
 * 用法：node .pwtest/reframe-probe.mjs   （BASE 默认 http://localhost:5100）
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';

const EMAIL = process.env.EMAIL || 'admin@126.com';
const PASSWORD = process.env.PASSWORD || 'admin@666666';

const FF =
  process.env.FFMPEG ||
  '/Users/aiven/Desktop/AI/codex/projects/node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg';
const BASE = process.env.BASE || 'http://localhost:5100';
const DIR = process.env.DIR || '/tmp/rf-e2e';
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const SKIN = { r: 0xc0, g: 0x8a, b: 0x5a };
/** 非肤色醒目色块（青）：用来验证「无肤色源」确实走了 blur-fit（前景被限制在中间带）。 */
const CYAN = { r: 0x30, g: 0xd0, b: 0xd0 };
const DUR = 6;

/** 生成 16:9 源；rgb 给定时放入水平移动的色块（模拟人物主体）。 */
function genSource(name, rgb) {
  const p = `${DIR}/${name}.mp4`;
  const args = [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=0x1b1b22:s=1280x720:r=25:d=${DUR}`,
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${DUR}`,
  ];
  if (rgb) {
    const hex = '0x' + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    args.push(
      '-f', 'lavfi', '-i', `color=c=${hex}:s=260x420:r=25:d=${DUR}`,
      '-filter_complex', "[0:v][2:v]overlay=x='80+860*t/6':y=150[v]",
      '-map', '[v]', '-map', '1:a',
    );
  } else {
    args.push('-map', '0:v', '-map', '1:a');
  }
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p);
  execFileSync(FF, args);
  return p;
}

/** 取 admin 的 Supabase access_token（服务端门控需可核验身份，admin 角色放行）。 */
async function getToken() {
  const env = {};
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return '';
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await res.json().catch(() => ({}));
  return j.access_token || '';
}

async function post(file, orientation) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'video/mp4' }), 'src.mp4');
  form.append('startTime', '0');
  form.append('duration', String(DUR));
  form.append('plan', 'pro');
  if (orientation) form.append('orientation', orientation);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/cut-clip`, {
    method: 'POST',
    body: form,
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, sec: ((Date.now() - t0) / 1000).toFixed(1) };
}

/** 一帧里指定颜色像素的水平重心（0..1）、垂直跨度占比与面积占比。 */
async function blobStats(pngPath, rgb) {
  const { data, info } = await sharp(pngPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: ch } = info;
  let sx = 0;
  let n = 0;
  let yMin = H;
  let yMax = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      if (
        Math.abs(data[i] - rgb.r) < 26 &&
        Math.abs(data[i + 1] - rgb.g) < 26 &&
        Math.abs(data[i + 2] - rgb.b) < 26
      ) {
        sx += x;
        n++;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }
  return {
    centroid: n ? sx / n / W : null,
    ratio: n / (W * H),
    vspan: yMax >= 0 ? (yMax - yMin + 1) / H : 0,
  };
}

async function runCase(label, file, orientation, mode, rgb) {
  const { status, buf, sec } = await post(file, orientation);
  console.log(`\n===== ${label} ===== HTTP ${status}  ${(buf.length / 1024).toFixed(0)}KB  ${sec}s`);
  if (status !== 200) {
    console.log('BODY:', buf.toString('utf8').slice(0, 600));
    return;
  }
  const out = `${DIR}/${label}.mp4`;
  writeFileSync(out, buf);
  try {
    execFileSync(FF, ['-y', '-v', 'error', '-i', out, '-vf', 'fps=1', `${DIR}/${label}-f_%02d.png`]);
  } catch (e) {
    console.log('frame extract failed:', String(e.stderr).slice(-300));
  }
  let dims = '?';
  try {
    const st = await sharp(`${DIR}/${label}-f_01.png`).metadata();
    dims = `${st.width}x${st.height}`;
  } catch {}
  console.log(`output dims: ${dims}`);

  const frames = readdirSync(DIR).filter((f) => f.startsWith(`${label}-f_`) && f.endsWith('.png')).sort();
  const stats = [];
  for (const f of frames) {
    const s = await blobStats(`${DIR}/${f}`, rgb);
    stats.push(s);
    console.log(
      `  ${f}: centroid=${s.centroid === null ? 'none' : s.centroid.toFixed(3)}  area=${(s.ratio * 100).toFixed(2)}%  vspan=${(s.vspan * 100).toFixed(1)}%`,
    );
  }
  const av = stats.filter((s) => s.centroid !== null);
  if (av.length === 0) {
    console.log('  FAIL: 输出里找不到主体色块');
    return;
  }
  const maxDev = Math.max(...av.map((s) => Math.abs(s.centroid - 0.5)));
  const areas = av.map((s) => s.ratio);
  const maxArea = Math.max(...areas);
  const vspans = av.map((s) => s.vspan);
  const vAvg = vspans.reduce((a, b) => a + b, 0) / vspans.length;
  console.log(
    `  -> 最大偏离中心 ${(maxDev * 100).toFixed(1)}%  面积 ${(Math.min(...areas) * 100).toFixed(1)}%~${(maxArea * 100).toFixed(1)}%  垂直跨度均值 ${(vAvg * 100).toFixed(1)}%`,
  );

  // 紧凑 9:16 裁切（整幅高度取景）的主体面积是可精确预测的固定值：
  //   面积 = (260*1080/404)*(420*1920/720) / (1080*1920) ≈ 37.5%
  // blur-fit 则把主体压进中间 1080x608 的前景带（面积 ≤ ~18%，且随主体进出而波动）。
  if (mode === 'track') {
    console.log(maxDev <= 0.18 ? '  PASS: 主体基本居中（裁切窗跟随人物）' : '  FAIL: 追焦未生效');
    console.log(maxArea > 0.30 ? '  PASS: 面积符合紧凑 9:16 裁切（非 blur-fit）' : '  FAIL: 面积偏小，疑似走了 blur-fit');
  } else if (mode === 'blurfit') {
    console.log(maxArea < 0.28 ? '  PASS: 面积符合 blur-fit（未走紧凑裁切）' : '  FAIL: 疑似错误的紧凑裁切（未回落）');
  } else if (mode === 'plain') {
    console.log(dims === '1280x720' ? '  PASS: 横屏链路未被追焦影响（源分辨率直通）' : `  FAIL: 横屏输出尺寸异常 ${dims}`);
  }
}

/**
 * 生产主路径回归：YouTube 流源（CF Worker /resolve → /api/cut-clip 竖屏 + 字幕）。
 * 走的是与本地文件不同的 cutFromStreamUrl 分支（ffmpeg 直接读 HTTP 输入 + 追焦分析）。
 * 断言：200、输出 1080x1920、`ffmpeg -v error` 全解码无报错。
 */
async function streamCase(label, videoId) {
  const env = {};
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const cf = String(process.env.CF_WORKER_URL || env.CF_WORKER_URL || '').trim();
  if (!cf) {
    console.log(`\n===== ${label} ===== SKIP: .env.local 无 CF_WORKER_URL`);
    return;
  }
  const rurl = new URL(cf);
  rurl.pathname = `${rurl.pathname.replace(/\/$/, '')}/resolve`;
  rurl.searchParams.set('videoId', videoId);
  rurl.searchParams.set('maxHeight', '720');
  rurl.searchParams.set('muxed', '1');
  // 本机 node fetch 不走系统代理 → 允许用 curl 取好 resolve 结果后经 RESOLVE_JSON 传入。
  const meta = process.env.RESOLVE_JSON
    ? JSON.parse(readFileSync(process.env.RESOLVE_JSON, 'utf8'))
    : await (await fetch(rurl.toString())).json().catch(() => null);
  if (!meta?.streamUrl) {
    console.log(`\n===== ${label} ===== SKIP: /resolve 无 streamUrl（${JSON.stringify(meta).slice(0, 200)}）`);
    return;
  }

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/cut-clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({
      streamUrl: meta.streamUrl,
      ...(meta.audioUrl ? { audioUrl: meta.audioUrl } : {}),
      userAgent: meta.userAgent,
      visitorData: meta.visitorData,
      xClientName: meta.xClientName,
      clientVersion: meta.clientVersion,
      clientName: meta.client,
      videoId,
      startTime: 51,
      duration: 40,
      endTime: 91,
      plan: 'pro',
      orientation: 'vertical',
      // 字幕/粗剪需要 dev 侧 node 直连 YouTube 拉字幕（本机 node fetch 不走代理），
      // 故此处关闭，专注验证「竖屏追焦 + 流源直读」这一段集成。
      subtitles: false,
      jumpCut: false,
    }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`\n===== ${label} ===== HTTP ${res.status}  ${(buf.length / 1024).toFixed(0)}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (res.status !== 200) {
    console.log('BODY:', buf.toString('utf8').slice(0, 600));
    return;
  }
  const out = `${DIR}/${label}.mp4`;
  writeFileSync(out, buf);
  let dims = '?';
  try {
    execFileSync(FF, ['-y', '-v', 'error', '-i', out, '-frames:v', '1', `${DIR}/${label}-f_01.png`]);
    const st = await sharp(`${DIR}/${label}-f_01.png`).metadata();
    dims = `${st.width}x${st.height}`;
    execFileSync(FF, ['-v', 'error', '-i', out, '-f', 'null', '-']);
    console.log('  PASS: 流源竖屏导出 200 + 全解码无错误');
  } catch (e) {
    console.log('  FAIL: 解码报错', String(e.stderr || e).slice(-300));
  }
  console.log(`  output dims: ${dims}`);
  console.log(dims === '1080x1920' ? '  PASS: 输出 1080x1920' : `  FAIL: 输出尺寸异常 ${dims}`);
}

const TOKEN = await getToken();
console.log(`auth token: ${TOKEN ? `ok (len=${TOKEN.length})` : 'MISSING (门控会 403)'}`);

await runCase('track-skin', genSource('src-skin', SKIN), 'vertical', 'track', SKIN);
await runCase('fallback-cyan', genSource('src-cyan', CYAN), 'vertical', 'blurfit', CYAN);
await runCase('landscape-skin', `${DIR}/src-skin.mp4`, null, 'plain', SKIN);
await streamCase('stream-vertical', process.env.VIDEO_ID || 'arj7oStGLkU');
console.log(`\n输出文件在 ${DIR}/`);