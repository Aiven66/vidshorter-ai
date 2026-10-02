/**
 * 关键未知验证：DashScope 能否拉取 Supabase Storage 的 URL？
 *  - 若能 → 数字人输入媒体可托管在**私有桶 + 签名 URL**（不公开用户素材）
 *  - 若不能 → 回落「公开桶 + 随机路径」
 *
 * 用 wan2.2-s2v-detect（0.004元/张，200张免费）做廉价探测，无视频生成开销。
 *
 * 用法： node --import tsx .pwtest/storage-url-reach-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { createClient } from '@supabase/supabase-js';

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';
const BUCKET = 'dh-media';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = createClient(url, key, { auth: { persistSession: false } });

  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) {
    console.log('NO_DASHSCOPE_CONFIG');
    return;
  }

  // 0) 下载官方样例图
  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  console.log('sample image bytes =', imgBuf.length);

  // 1) 建桶（已存在则忽略）
  const mk = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  console.log(`create bucket ${BUCKET}: http=${mk.status}`, (await mk.text()).slice(0, 160));

  // 2) 上传 + 签名 URL
  const objPath = `probe-${Date.now()}.jpg`;
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${objPath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: new Uint8Array(imgBuf),
  });
  console.log(`upload: http=${up.status}`, (await up.text()).slice(0, 160));

  const signed = await client.storage.from(BUCKET).createSignedUrl(objPath, 3600);
  const signedUrl = signed.data?.signedUrl || '';
  console.log('signedUrl =', signedUrl.slice(0, 130));

  // 3) 用 detect 验证 DashScope 能否下载该 URL
  const body = { model: 'wan2.2-s2v-detect', input: { image_url: signedUrl } };
  const cand = [
    `${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`,
    `${dk.baseUrl}/api/v1/services/aigc/image2video/image-detect`,
  ];
  for (const ep of cand) {
    const r = await fetch(ep, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    console.log(`\n[detect] ${ep.replace(dk.baseUrl, '')} http=${r.status}`);
    console.log(t.slice(0, 600));
  }

  // 4) 对照：DashScope 是否真的能 GET 到该 URL
  //    （detect 返回「图片不合法」= 下载成功；返回下载失败 = 拉取不通）
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});