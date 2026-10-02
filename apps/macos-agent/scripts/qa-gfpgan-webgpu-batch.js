#!/usr/bin/env node
/** qa-gfpgan-webgpu-batch.js — WebGPU batch throughput test */
'use strict';
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
const S = 512, N = S * S;

function toTensorBatch(bs) {
  const x = new Float32Array(3 * N * bs);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.0001) * 0.5;
  return new Tensor('float32', x, [bs, 3, S, S]);
}

(async () => {
  const sess = await InferenceSession.create(MODEL, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
  });
  for (const bs of [1, 2, 4]) {
    try {
      await sess.run({ input: toTensorBatch(bs) }); // warm
      const t = Date.now();
      const runs = 3;
      for (let r = 0; r < runs; r++) await sess.run({ input: toTensorBatch(bs) });
      const ms = (Date.now() - t) / runs;
      console.log(`batch=${bs}: ${ms.toFixed(0)}ms/batch = ${(ms / bs).toFixed(0)}ms/frame`);
    } catch (e) {
      console.log(`batch=${bs}: FAILED — ${e.message.split('\n')[0]}`);
      break;
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
