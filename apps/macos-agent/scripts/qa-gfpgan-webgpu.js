#!/usr/bin/env node
/** qa-gfpgan-webgpu.js — try the bundled WebGPU EP for GFPGAN */
'use strict';
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
const S = 512, N = S * S;

function toTensor(seed) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) x[i] = Math.sin(i * 0.0001 + seed) * 0.5;
  return new Tensor('float32', x, [1, 3, S, S]);
}

(async () => {
  try {
    const t0 = Date.now();
    const sess = await InferenceSession.create(MODEL, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    const loadMs = Date.now() - t0;
    await sess.run({ input: toTensor(0) });
    const t1 = Date.now();
    const runs = 5;
    for (let r = 0; r < runs; r++) await sess.run({ input: toTensor(r + 1) });
    const ms = (Date.now() - t1) / runs;
    const out = await sess.run({ input: toTensor(0) });
    const d = Object.values(out)[0].data;
    console.log(`webgpu: load=${loadMs}ms warm=${Date.now() - t1 - runs * ms}ms avg=${ms.toFixed(0)}ms/frame finite=${Number.isFinite(d[0])}`);
  } catch (e) {
    console.log('webgpu FAILED:', e.message.split('\n').slice(0, 3).join(' | '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
