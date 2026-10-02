#!/usr/bin/env node
/** qa-gfpgan-coreml.js — benchmark GFPGAN on CoreML EP (M-series GPU) vs CPU */
'use strict';
const path = require('path');
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
const S = 512, N = S * S;

function toTensor(seed) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) x[i] = Math.sin(i * 0.0001 + seed) * 0.5;
  return new Tensor('float32', x, [1, 3, S, S]);
}

(async () => {
  for (const ep of ['coreml', 'cpu']) {
    try {
      const t0 = Date.now();
      const sess = await InferenceSession.create(MODEL, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      });
      const loadMs = Date.now() - t0;
      // warmup (first coreml run includes compile)
      let out = await sess.run({ input: toTensor(0) });
      const t1 = Date.now();
      const runs = 5;
      for (let r = 0; r < runs; r++) out = await sess.run({ input: toTensor(r + 1) });
      const ms = (Date.now() - t1) / runs;
      const d = Object.values(out)[0].data;
      console.log(`EP=${ep}: load=${loadMs}ms warm+${runs}runs avg=${ms.toFixed(0)}ms/frame | out[0..2]=${d[0].toFixed(3)},${d[1].toFixed(3)},${d[2].toFixed(3)} (finite=${Number.isFinite(d[0])})`);
      // sanity: output should differ across inputs
      const out2 = await sess.run({ input: toTensor(99) });
      const d2 = Object.values(out2)[0].data;
      let diff = 0;
      for (let i = 0; i < 1000; i++) diff += Math.abs(d[i] - d2[i]);
      console.log(`EP=${ep}: input-sensitivity diff(1k samples)=${diff.toFixed(2)} (should be > 0)`);
    } catch (e) {
      console.log(`EP=${ep}: FAILED — ${e.message}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
