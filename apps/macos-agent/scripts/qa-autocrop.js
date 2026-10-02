// QA helper: detect face box in a video frame (auto mouth-crop for lip-sync QA)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { InferenceSession, Tensor } = require('onnxruntime-node');
const FF = require(path.join(__dirname, '..', 'node_modules/@ffmpeg-installer/ffmpeg')).path;

const modelsDir = path.join(process.env.HOME, 'Library/Application Support/clipop-macos-agent/realhuman-models');

function letterboxResize(rgb, W, H, w, h) {
  const scale = Math.min(w / W, h / H);
  const ow = Math.round(W * scale), oh = Math.round(H * scale);
  const ox = Math.floor((w - ow) / 2), oy = Math.floor((h - oh) / 2);
  const buf = Buffer.alloc(w * h * 3, 114);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const si = ((Math.floor(y / scale)) * W + Math.floor(x / scale)) * 3;
      const di = ((y + oy) * w + x + ox) * 3;
      buf[di] = rgb[si]; buf[di + 1] = rgb[si + 1]; buf[di + 2] = rgb[si + 2];
    }
  }
  return { buf, scale, ox, oy };
}

(async () => {
  const video = process.argv[2] || '/tmp/rh_e2e_out.mp4';
  const t = process.argv[3] || '3';
  // extract one frame
  const frame = execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-ss', t, '-i', video,
    '-frames:v', '1', '-pix_fmt', 'rgb24', '-s', '720x1280', '-f', 'rawvideo', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const session = await InferenceSession.create(path.join(modelsDir, 'yoloface_8n.onnx'));
  const LB = letterboxResize(frame, 720, 1280, 640, 640);
  const input = new Float32Array(1 * 3 * 640 * 640);
  const n = 640 * 640;
  for (let i = 0; i < n; i++) {
    input[i] = LB.buf[i * 3] / 255; input[n + i] = LB.buf[i * 3 + 1] / 255; input[2 * n + i] = LB.buf[i * 3 + 2] / 255;
  }
  const res = await session.run({ input: new Tensor('float32', input, [1, 3, 640, 640]) });
  const data = res.output.data, out = res.output.dims;
  const nAnchor = out[2];
  let best = -1, bestScore = 0.5;
  for (let i = 0; i < nAnchor; i++) {
    const s = data[4 * nAnchor + i];
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best < 0) { console.error('no face'); process.exit(1); }
  const cx = data[best], cy = data[nAnchor + best];
  const w = data[2 * nAnchor + best], h = data[3 * nAnchor + best];
  const x1 = (cx - w / 2 - LB.ox) / LB.scale, y1 = (cy - h / 2 - LB.oy) / LB.scale;
  const x2 = (cx + w / 2 - LB.ox) / LB.scale, y2 = (cy + h / 2 - LB.oy) / LB.scale;
  const fw = x2 - x1, fh = y2 - y1;
  // mouth region: center ~0.74 of face height, width ~0.42
  const mx = x1 + fw * 0.29, my = y1 + fh * 0.64;
  const mw = fw * 0.42, mh = fh * 0.22;
  console.log(JSON.stringify({
    box: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)], score: +bestScore.toFixed(3),
    mouthCrop: `${Math.round(mw)}:${Math.round(mh)}:${Math.round(mx)}:${Math.round(my)}`,
  }));
})();
