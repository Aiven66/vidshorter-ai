// qa-electron-webgpu.js — run via: npx electron scripts/qa-electron-webgpu.js
// Verifies GFPGAN on WebGPU EP inside the Electron MAIN process.
'use strict';
const { app } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const { InferenceSession, Tensor } = require('onnxruntime-node');
    const S = 512, N = S * S;
    const MODEL = '/tmp/rh-models/gfpgan_1.4.onnx';
    const t0 = Date.now();
    const sess = await InferenceSession.create(MODEL, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
    const loadMs = Date.now() - t0;
    const x = new Tensor('float32', new Float32Array(3 * N).fill(0.1), [1, 3, S, S]);
    await sess.run({ input: x });
    const t1 = Date.now();
    for (let r = 0; r < 3; r++) await sess.run({ input: x });
    const ms = (Date.now() - t1) / 3;
    console.log(`ELECTRON-MAIN webgpu: load=${loadMs}ms avg=${ms.toFixed(0)}ms/frame`);
    console.log('RESULT: OK');
  } catch (e) {
    console.log('RESULT: FAILED —', e.message.split('\n')[0]);
  } finally {
    app.quit();
  }
});
