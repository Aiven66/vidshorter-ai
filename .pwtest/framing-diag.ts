/**
 * 诊断：把真实竖屏取景函数跑在真实 CF Worker 流上，回答两个问题：
 *   1) computeVerticalTrackXExpr 是否产出关键帧（还是回退居中）？
 *   2) 取景窗口到底落在源画面（640x360）的哪个位置？
 * 同时把源帧落盘并画出「居中窗口」参考矩形，便于人工核对。
 *
 * 用法：http_proxy=... https_proxy=... pnpm tsx .pwtest/framing-diag.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { computeVerticalTrackXExpr } from '@/lib/server/video-framing';

const execFileAsync = promisify(execFile);
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const OUT = '/tmp/framing-diag';

const meta = JSON.parse(readFileSync('.res.json', 'utf8'));
const CF = 'https://youtube-proxy.vidshorter-ai.workers.dev';
const VIDEO_ID = 'arj7oStGLkU';
const START = 51;
const DUR = 50;

const u = new URL(CF.replace(/\/$/, '') + '/stream');
u.searchParams.set('videoId', VIDEO_ID);
u.searchParams.set('maxHeight', '360');
u.searchParams.set('muxed', '1');
if (meta.streamUrl) u.searchParams.set('streamUrl', meta.streamUrl);
if (meta.userAgent) u.searchParams.set('userAgent', meta.userAgent);
if (meta.visitorData) u.searchParams.set('visitorData', meta.visitorData);
u.searchParams.set('xClientName', String(meta.xClientName ?? 1));
if (meta.clientVersion) u.searchParams.set('clientVersion', meta.clientVersion);
if (meta.clientName || meta.client) u.searchParams.set('clientName', meta.clientName || meta.client);
const muxedUrl = u.toString();

const httpHeaders = 'Accept: */*\r\nAccept-Encoding: identity\r\n';

async function main() {
// 1) 源帧：抓 start 与 start+25 两帧（保持 640x360）
for (const [name, t] of [['src-start', START], ['src-mid', START + 25]] as const) {
  await execFileAsync(FFMPEG, [
    '-y', '-v', 'error', '-ss', String(t),
    '-rw_timeout', '30000000', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-headers', httpHeaders, '-i', muxedUrl,
    '-frames:v', '1', `${OUT}/${name}.png`,
  ], { timeout: 90_000 });
  console.log(`src frame -> ${OUT}/${name}.png`);
}

// 2) 真实取景函数
console.log('--- computeVerticalTrackXExpr ---');
const expr = await computeVerticalTrackXExpr({
  ffmpegPath: FFMPEG,
  muxedStreamUrl: muxedUrl,
  httpHeaders,
  startTime: START,
  duration: DUR,
});
console.log('RETURNED:', expr === '' ? '(empty => centered fallback)' : expr.slice(0, 500));

// 3) 解析出所有出现的 x 常量（<=438 才可能是窗口 x）
const xs = [...new Set((expr.match(/\d+/g) || []).map(Number).filter((n) => n <= 438 && n >= 0))].sort((a, b) => a - b);
console.log('x constants in expr:', xs.join(', ') || '(none)');

// 4) 在源帧上画参考矩形：绿=居中窗口(219)，红=expr 的最小 x，蓝=expr 的最大 x
const CROP_W = Math.round((360 * 9) / 16 / 2) * 2; // 202
const CENTER_X = Math.round((640 - CROP_W) / 2);
const rects = [
  { x: CENTER_X, color: '#00ff00', label: 'center' },
  ...(xs.length ? [{ x: xs[0], color: '#ff0000', label: 'track-min' }] : []),
  ...(xs.length > 1 ? [{ x: xs[xs.length - 1], color: '#0000ff', label: 'track-max' }] : []),
];
for (const r of rects) console.log(`rect ${r.label}: x=${r.x} .. ${r.x + CROP_W}`);
const svgRects = rects
  .map((r) => `<rect x="${r.x}" y="0" width="${CROP_W}" height="360" fill="none" stroke="${r.color}" stroke-width="3"/>`)
  .join('');
const overlay = Buffer.from(`<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">${svgRects}</svg>`);
await sharp(`${OUT}/src-start.png`).composite([{ input: overlay, top: 0, left: 0 }]).toFile(`${OUT}/annotated.png`);
console.log(`annotated -> ${OUT}/annotated.png`);

// 5) 用 expr 本地产出竖屏，抽帧（与线上产物对照）
const vf = `crop=${CROP_W}:ih:${expr && expr.trim() ? `clip(${expr.replace(/,/g, '\\,')}\\,0\\,iw-(${CROP_W}))` : `(iw-(${CROP_W}))/2`}:0,scale=1080:1920`;
writeFileSync(`${OUT}/vf.txt`, vf);
console.log('vf:', vf.slice(0, 300));
}

main().catch((e) => {
  console.error('DIAG FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});