#!/usr/bin/env node
/** qa-gfpgan-fp16.js — benchmark fp16 GFPGAN on WebGPU + CoreML + CPU, verify quality */
'use strict';
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODELS = {
  fp32: '/tmp/rh-models/gfpgan_1.4.onnx',
  fp16: '/tmp/rh-models/gfpgan_1.4_fp16.onnx',
};
const S = 512, N = S * S;

function toTensor(seed) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) x[i] = Math.sin(i * 0.0001 + seed) * 0.5;
  return new Tensor('float32', x, [1, 3, S, S]);
}

(async () => {
  // reference: fp32 cpu
  const cpu = await InferenceSession.create(MODELS.fp32, { graphOptimizationLevel: 'all' });
  const refOut = await cpu.run({ input: toTensor(0) });
  const ref = Object.values(refOut)[0].data;

  for (const [label, file, eps] of [
    ['fp16+webgpu', MODELS.fp16, ['webgpu']],
    ['fp16+coreml', MODELS.fp16, [{ name: 'coreml', ModelFormat: 'MLProgram', MLComputeUnits: 'CPUAndGPUAndNeuralEngine' }]],
    ['fp16+cpu', MODELS.fp16, ['cpu']],
  ]) {
    try {
      const t0 = Date.now();
      const sess = await InferenceSession.create(file, { executionProviders: eps, graphOptimizationLevel: 'all' });
      const loadMs = Date.now() - t0;
      await sess.run({ input: toTensor(0) });
      const t2 = Date.now();
      const runs = 5;
      for (let r = 0; r < runs; r++) await sess.run({ input: toTensor(r + 1) });
      const ms = (Date.now() - t2) / runs;
      const out = await sess.run({ input: toTensor(0) });
      const d = Object.values(out)[0].data;
      let se = 0, cnt = 0;
      for (let i = 0; i < 30000; i += 7) { const dd = d[i] - ref[i]; se += dd * dd; cnt++; }
      console.log(`${label}: load=${loadMs}ms avg=${ms.toFixed(0)}ms/frame rmse=${Math.sqrt(se / cnt).toFixed(4)} finite=${Number.isFinite(d[0])}`);
    } catch (e) {
      console.log(`${label}: FAILED — ${e.message.split('\n')[0]}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
