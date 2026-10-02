/**
 * 快速探针：用 multipart 上传一段本地 16:9 测试片，直接打到生产 /api/cut-clip 的
 * 「本地上传」分支（cutLocalFile），分别跑 landscape / vertical，原样打印响应体。
 * 目的：把 ffmpeg filter_complex 解析问题从 YouTube 依赖里隔离出来。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, statSync } from 'node:fs';

const BASE = process.env.BASE || 'https://www.clipopai.com';
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const SRC = '/tmp/vprobe/src.mp4';
mkdirSync('/tmp/vprobe', { recursive: true });

// 生成 16:9 测试片（8s，含音频），模拟「会议/幻灯片」横屏源
if (!process.env.SKIP_GEN) {
  execFileSync(FFMPEG, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', SRC,
  ]);
}
const buf = readFileSync(SRC);
console.log(`src: ${SRC}  ${(statSync(SRC).size / 1024).toFixed(0)}KB`);

async function probe(label, orientation) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'video/mp4' }), 'src.mp4');
  form.append('startTime', '0');
  form.append('duration', '4');
  form.append('plan', 'pro');
  form.append('subtitles', 'false');
  if (orientation) form.append('orientation', orientation);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/cut-clip`, { method: 'POST', body: form });
  const ab = await res.arrayBuffer();
  const body = Buffer.from(ab);
  console.log(`\n===== ${label} =====`);
  console.log(`HTTP ${res.status}  ${body.length} bytes  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (res.ok) {
    const out = `/tmp/vprobe/${label}.mp4`;
    (await import('node:fs')).writeFileSync(out, body);
    try {
      execFileSync(FFMPEG, ['-i', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      const line = String(e.stderr || '').split('\n').find((l) => /Stream #0:0.*Video/.test(l)) || '';
      console.log('probe:', line.trim().slice(0, 160));
    }
  } else {
    console.log('RAW BODY:\n' + body.toString('utf8'));
  }
}

await probe('landscape', null);
await probe('vertical', 'vertical');