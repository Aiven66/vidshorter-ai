/**
 * 决定性验证：DashScope 能否拉取 Supabase 的公网 URL（无签名参数）？
 *  对照组 = 阿里云官方公开图片（已知可达）
 *  若官方组成功、Supabase 组失败 → Supabase 境外域名对 DashScope 不可达，
 *  必须改用 DashScope 自带临时上传 API 托管输入媒体。
 *
 * 用法： node --import tsx .pwtest/storage-public-reach-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { createClient } from '@supabase/supabase-js';

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';
const BUCKET = 'dh-media';
const DETECT = 'services/aigc/image2video/video-synthesis';

async function tryDetect(base: string, apiKey: string, imageUrl: string, label: string) {
  const r = await fetch(`${base}/api/v1/${DETECT}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'wan2.2-s2v-detect', input: { image_url: imageUrl } }),
  });
  const t = await r.text();
  console.log(`\n[${label}] http=${r.status}`);
  console.log('  url =', imageUrl.slice(0, 100));
  console.log('  res =', t.slice(0, 500));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) {
    console.log('NO_DASHSCOPE_CONFIG');
    return;
  }

  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());

  // 公开桶
  const pub = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  console.log(`create/update bucket public: http=${pub.status}`, (await pub.text()).slice(0, 120));

  const objPath = `pub-${Date.now()}.jpg`;
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${objPath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: new Uint8Array(imgBuf),
  });
  console.log(`upload: http=${up.status}`);
  const publicUrl = client.storage.from(BUCKET).getPublicUrl(objPath).data.publicUrl;
  console.log('publicUrl =', publicUrl);

  // 本机能否取到该 publicUrl（自检）
  const self = await fetch(publicUrl);
  console.log(`local fetch publicUrl: http=${self.status} bytes=${(await self.arrayBuffer()).byteLength}`);

  // A) 对照组：阿里云官方图
  await tryDetect(dk.baseUrl, dk.apiKey, SAMPLE_IMG, 'CTRL 阿里云官方图');

  // B) 实验组：Supabase 公开 URL
  await tryDetect(dk.baseUrl, dk.apiKey, publicUrl, 'EXP  Supabase 公开 URL');
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});