#!/usr/bin/env node
/** qa-gfpgan-coreml2.js — CoreML EP variants: MLProgram fp16 + NeuralEngine
 *  vs NeuralNetwork + GPU. Find a config that makes per-frame GFPGAN viable. */
'use strict';
const { InferenceSession, Tensor } = require('onnxruntime-node');

const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
const S = 512, N = S * S;

function toTensor(seed) {
  const x = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) x[i] = Math.sin(i * 0.0001 + seed) * 0.5;
  return new Tensor('float32', x, [1, 3, S, S]);
}

const variants = [
  { label: 'coreml MLProgram+ANE', ep: { name: 'coreml', ModelFormat: 'MLProgram', MLComputeUnits: 'CPUAndGPUAndNeuralEngine' } },
  { label: 'coreml MLProgram+GPU', ep: { name: 'coreml', ModelFormat: 'MLProgram', MLComputeUnits: 'CPUAndGPU' } },
  { label: 'coreml NN+ANE', ep: { name: 'coreml', ModelFormat: 'NeuralNetwork', MLComputeUnits: 'CPUAndNeuralEngine' } },
];

(async () => {
  // reference CPU output for correctness comparison
  const cpu = await InferenceSession.create(MODEL, { graphOptimizationLevel: 'all' });
  const refOut = await cpu.run({ input: toTensor(0) });
  const ref = Object.values(refOut)[0].data;

  for (const v of variants) {
    try {
      const t0 = Date.now();
      const sess = await InferenceSession.create(MODEL, {
        executionProviders: [v.ep],
        graphOptimizationLevel: 'all',
      });
      const loadMs = Date.now() - t0;
      const t1 = Date.now();
      await sess.run({ input: toTensor(0) }); // warm (coreml compile)
      const warmMs = Date.now() - t1;
      const t2 = Date.now();
      const runs = 5;
      for (let r = 0; r < runs; r++) await sess.run({ input: toTensor(r + 1) });
      const ms = (Date.now() - t2) / runs;
      // correctness vs cpu
      const out = await sess.run({ input: toTensor(0) });
      const d = Object.values(out)[0].data;
      let se = 0;
      for (let i = 0; i < 30000; i += 7) { const dd = d[i] - ref[i]; se += dd * dd; }
      const cnt = Math.ceil(30000 / 7);
      const rmse = Math.sqrt(se / cnt);
      console.log(`${v.label}: load=${loadMs}ms warm=${warmMs}ms avg=${ms.toFixed(0)}ms/frame rmse_vs_cpu=${rmse.toFixed(4)} finite=${Number.isFinite(d[0])}`);
    } catch (e) {
      console.log(`${v.label}: FAILED — ${e.message.split('\n')[0]}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
