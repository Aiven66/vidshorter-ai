// 本地工具：用 curl 16 段并发下载 AI 模型到 os.tmpdir()
// （Node 内置 fetch 不认 HTTP_PROXY，GitHub 直连不稳时用 curl 走系统代理）
// 运行: node scripts/fetch-models-parallel.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, createWriteStream, existsSync, statSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const BASE = 'https://github.com/Aiven66/vidshorter-ai/releases/download/ai-models-v1';
const MODELS = [
  { file: 'lama_fp32.onnx', size: 208044816 },
  { file: 'swin2sr_x2_fp32.onnx', size: 54428699 },
  { file: 'colorize_fp32.onnx', size: 128975480 },
];
const SEGMENTS = 16;

for (const m of MODELS) {
  const dest = path.join(os.tmpdir(), m.file);
  if (existsSync(dest) && statSync(dest).size === m.size) {
    console.log(`skip (cached): ${dest}`);
    continue;
  }
  const url = `${BASE}/${m.file}`;
  const t0 = Date.now();
  const workDir = path.join(os.tmpdir(), `ai-model-parts-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  const segSize = Math.ceil(m.size / SEGMENTS);

  await Promise.all(
    Array.from({ length: SEGMENTS }, async (_, s) => {
      const start = s * segSize;
      const end = Math.min(m.size - 1, start + segSize - 1);
      if (start > end) return;
      const part = path.join(workDir, `part-${String(s).padStart(2, '0')}`);
      await execFileAsync(
        'curl',
        [
          '-sSL', '--retry', '5', '--retry-delay', '2', '--connect-timeout', '15',
          '-r', `${start}-${end}`, '-o', part, url,
        ],
        { timeout: 600_000 }
      );
      const actual = statSync(part).size;
      if (actual !== end - start + 1) throw new Error(`${m.file} part ${s}: ${actual} != ${end - start + 1}`);
    })
  );

  // 顺序合并
  const out = createWriteStream(dest);
  for (let s = 0; s < SEGMENTS; s++) {
    const part = path.join(workDir, `part-${String(s).padStart(2, '0')}`);
    if (!existsSync(part)) continue;
    out.write(await (await import('node:fs/promises')).readFile(part));
  }
  await new Promise((resolve) => out.end(resolve));

  const actual = statSync(dest).size;
  rmSync(workDir, { recursive: true, force: true });
  if (actual !== m.size) throw new Error(`${m.file} size mismatch ${actual} != ${m.size}`);
  console.log(`ok: ${m.file} (${(m.size / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log('all models ready');
