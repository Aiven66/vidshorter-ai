/**
 * 探测 LaMa ONNX 模型是否支持动态输入尺寸
 * 用法: AI_KEEP_MODELS=1 node --import tsx scripts/probe-lama.ts
 */
import { InferenceSession, Tensor } from 'onnxruntime-node';

async function tryRun(session: InferenceSession, w: number, h: number) {
  const plane = w * h;
  const image = new Float32Array(3 * plane).fill(0.5);
  const mask = new Float32Array(plane);
  // 中央方块掩码
  for (let y = Math.floor(h * 0.4); y < Math.floor(h * 0.6); y++) {
    for (let x = Math.floor(w * 0.4); x < Math.floor(w * 0.6); x++) {
      mask[y * w + x] = 1;
    }
  }
  const t0 = Date.now();
  const results = await session.run({
    image: new Tensor('float32', image, [1, 3, h, w]),
    mask: new Tensor('float32', mask, [1, 1, h, w]),
  });
  const out = results[session.outputNames[0]];
  const ms = Date.now() - t0;
  return { ok: true, dims: out.dims, ms };
}

async function main() {
  const session = await InferenceSession.create('/tmp/lama_fp32.onnx', {
    graphOptimizationLevel: 'all',
  });
  console.log('inputs:', session.inputNames);
  for (const [w, h] of [[512, 512], [512, 384], [384, 512], [256, 320], [320, 256], [640, 360]]) {
    try {
      const r = await tryRun(session, w, h);
      console.log(`OK ${w}x${h} -> out ${r.dims.join('x')} (${r.ms}ms)`);
    } catch (e) {
      console.log(`FAIL ${w}x${h} -> ${(e as Error).message.split('\n')[0].slice(0, 120)}`);
    }
  }
  // NaN 检查（全 0.5 输入 + 中央掩码）
  const plane = 512 * 512;
  const image = new Float32Array(3 * plane).fill(0.5);
  const mask = new Float32Array(plane);
  for (let y = 205; y < 307; y++) for (let x = 205; x < 307; x++) mask[y * 512 + x] = 1;
  const results = await session.run({
    image: new Tensor('float32', image, [1, 3, 512, 512]),
    mask: new Tensor('float32', mask, [1, 1, 512, 512]),
  });
  const out = results[session.outputNames[0]].data as Float32Array;
  let nan = 0, max = -Infinity, min = Infinity;
  for (const v of out) {
    if (!Number.isFinite(v)) nan++;
    else { if (v > max) max = v; if (v < min) min = v; }
  }
  console.log(`output range [${min.toFixed(3)}, ${max.toFixed(3)}], non-finite: ${nan}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
