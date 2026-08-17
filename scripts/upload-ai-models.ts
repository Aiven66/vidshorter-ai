/**
 * 一次性脚本：把三个 AI 模型上传到 Supabase Storage 公开桶 ai-models
 * 服务端冷启动从这里拉取模型（同区域快、稳定），HF 作为备用源。
 *
 * 运行: node --import tsx scripts/upload-ai-models.ts
 */
import { createHash } from 'node:crypto';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env.prod', override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const BUCKET = 'ai-models';

/** 与服务端 ai-inference.ts 保持一致的模型对象路径 */
const MODELS: Array<{ path: string; file: string }> = [
  { path: 'lama_fp32.onnx', file: '/tmp/ai-models/lama_fp32.onnx' },
  { path: 'swin2sr_x2_fp32.onnx', file: '/tmp/ai-models/swin2sr_x2_fp32.onnx' },
  { path: 'colorize_fp32.onnx', file: '/tmp/ai-models/colorize_fp32.onnx' },
  // 备用 HF 直链（服务端 fallback 用，此处仅记录）
  // lama:     https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
  // swin2sr:  https://huggingface.co/Xenova/swin2SR-classical-sr-x2-64/resolve/main/onnx/model.onnx
];

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

async function main() {
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. 确保公开桶存在（幂等）
  const { data: buckets } = await client.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await client.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '500MB',
    });
    if (error) throw new Error(`createBucket failed: ${error.message}`);
    console.log(`✓ created public bucket "${BUCKET}"`);
  }

  // 2. 逐个上传（已存在且大小一致则跳过）
  for (const { path, file } of MODELS) {
    if (!existsSync(file)) throw new Error(`missing local model file: ${file}`);
    const size = statSync(file).size;
    const digest = await sha256(file);

    const { data: existing } = await client.storage.from(BUCKET).list('', { search: path });
    const sameSize = existing?.some((o) => o.name === path && o.metadata?.size === size);
    if (sameSize) {
      console.log(`↷ skip ${path} (${size} bytes, already uploaded)`);
      continue;
    }

    console.log(`↑ uploading ${path} (${(size / 1024 / 1024).toFixed(1)} MB)…`);
    const buffer = await (await import('node:fs/promises')).readFile(file);
    const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (error) throw new Error(`upload ${path} failed: ${error.message}`);

    const { data: pub } = client.storage.from(BUCKET).getPublicUrl(path);
    console.log(`✓ ${path}`);
    console.log(`  bytes=${size} sha256=${digest}`);
    console.log(`  url=${pub.publicUrl}`);
  }

  console.log('\nAll models hosted. Server cold start will fetch from this bucket.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
