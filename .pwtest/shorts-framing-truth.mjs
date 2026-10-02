/**
 * 取证脚本：用生产 /api/cut-clip 真实产出「竖屏」片段，再抽帧落盘，
 * 用于人工核对「人物是否被裁掉」。不做断言，只产出证据。
 *
 * 用法：node .pwtest/shorts-framing-truth.mjs
 * 前置：.res.json 已由 resolve 生成（含 streamUrl/userAgent/visitorData/...）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'https://www.clipopai.com';
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const OUT = '/tmp/framing-truth';
mkdirSync(OUT, { recursive: true });

const meta = JSON.parse(readFileSync('.res.json', 'utf8'));
const START = Number(process.env.START || 51);
const DUR = Number(process.env.DUR || 50);

const body = {
  streamUrl: meta.streamUrl,
  ...(meta.audioUrl ? { audioUrl: meta.audioUrl } : {}),
  userAgent: meta.userAgent,
  visitorData: meta.visitorData,
  xClientName: meta.xClientName,
  clientVersion: meta.clientVersion,
  clientName: meta.client,
  videoId: process.env.VIDEO_ID || 'arj7oStGLkU',
  startTime: START,
  duration: DUR,
  endTime: START + DUR,
  plan: 'pro',
  orientation: 'vertical',
  subtitles: false,
};

console.log(`POST ${BASE}/api/cut-clip  vertical start=${START} dur=${DUR}`);
const t0 = Date.now();
const res = await fetch(`${BASE}/api/cut-clip`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const buf = Buffer.from(await res.arrayBuffer());
console.log(`HTTP ${res.status}  ${buf.length} bytes  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!res.ok) {
  console.log('ERR BODY:', buf.toString('utf8').slice(0, 400));
  process.exit(1);
}
const outFile = `${OUT}/vertical.mp4`;
writeFileSync(outFile, buf);
console.log(`saved ${outFile}`);

// 抽帧：整段均匀取 4 帧
const frames = 4;
for (let i = 0; i < frames; i++) {
  const t = (DUR / (frames + 1)) * (i + 1);
  const p = `${OUT}/frame-${i}-t${Math.round(t)}.png`;
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', String(t), '-i', outFile, '-frames:v', '1', p]);
  console.log(`frame -> ${p}`);
}

// 同时报告输出分辨率
try {
  const probe = execFileSync(FFMPEG, ['-i', outFile], { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(probe.toString());
} catch (e) {
  const s = String(e.stderr || '');
  const line = s.split('\n').find((l) => /Stream #0:0.*Video/.test(l)) || '';
  console.log('probe:', line.trim().slice(0, 200));
}