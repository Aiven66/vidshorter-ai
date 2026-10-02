/**
 * 数字人口播真实链路验证（不依赖 MiniMax）：
 *   qwen-tts 合成旁白 → 百炼临时上传托管图+音频 → wan2.2-s2v 提交 → 轮询 → 下载校验。
 * 关键待验证点：**私有 ACL 的百炼 OSS URL 能否直接作为 s2v 的 input**。
 *
 * 用法： node --import tsx .pwtest/dh-s2v-verify.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { writeFile } from 'fs/promises';

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';
const NARRATION = '你好，很高兴认识你。';

interface OSSPolicy {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  x_oss_object_acl?: string;
  x_oss_forbid_overwrite?: string;
}

async function getPolicy(base: string, apiKey: string): Promise<OSSPolicy> {
  const r = await fetch(`${base}/api/v1/uploads?action=getPolicy&model=wan2.2-s2v`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (await r.json()).data as OSSPolicy;
}

async function upload(p: OSSPolicy, buf: Buffer, name: string, mime: string): Promise<string> {
  const key = `${p.upload_dir}/${name}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', p.oss_access_key_id);
  form.append('policy', p.policy);
  form.append('Signature', p.signature);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('x-oss-object-acl', p.x_oss_object_acl || 'private');
  if (p.x_oss_forbid_overwrite) form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), name);
  const r = await fetch(p.upload_host, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`oss ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${p.upload_host}/${key}`;
}

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');

  // 1) qwen-tts 旁白
  const t = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-tts', input: { text: NARRATION, voice: 'Cherry' }, parameters: {} }),
  });
  const audioUrl = (await t.json())?.output?.audio?.url || '';
  console.log('[1] qwen-tts url =', audioUrl.slice(0, 90));
  if (!audioUrl) return;
  const audio = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
  console.log('    audio bytes =', audio.length);

  // 2) 托管
  const policy = await getPolicy(dk.baseUrl, dk.apiKey);
  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  const stamp = Date.now();
  const imageUrl = await upload(policy, imgBuf, `img-${stamp}.jpg`, 'image/jpeg');
  const hostedAudio = await upload(policy, audio, `aud-${stamp}.wav`, 'audio/wav');
  console.log('[2] image =', imageUrl.slice(0, 100));
  console.log('    audio =', hostedAudio.slice(0, 100));
  console.log('    image GET =', (await fetch(imageUrl)).status, '(403 预期，private)');

  // 3) 提交 s2v
  const sub = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dk.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'wan2.2-s2v',
      input: { image_url: imageUrl, audio_url: hostedAudio },
      parameters: { resolution: '480P', style: 'speech' },
    }),
  });
  const subText = await sub.text();
  const taskId = (() => { try { return JSON.parse(subText)?.output?.task_id || ''; } catch { return ''; } })();
  console.log(`[3] submit http=${sub.status} task_id=${taskId}`);
  if (!taskId) return console.log('SUBMIT_FAIL', subText.slice(0, 500));

  // 4) 轮询
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const q = await fetch(`${dk.baseUrl}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${dk.apiKey}` },
    });
    const txt = await q.text();
    let status = '', video = '', msg = '';
    try { const j = JSON.parse(txt); status = j?.output?.task_status || ''; video = j?.output?.results?.video_url || ''; msg = j?.output?.message || j?.message || ''; } catch {}
    console.log(`    poll#${i + 1} ${status}${msg ? ' msg=' + msg.slice(0, 140) : ''}`);
    if (status === 'SUCCEEDED') {
      console.log('\n[4] video_url =', video.slice(0, 140));
      const vb = Buffer.from(await (await fetch(video)).arrayBuffer());
      await writeFile('/tmp/clipop-dh-verify.mp4', vb);
      console.log(`    bytes=${vb.length} -> /tmp/clipop-dh-verify.mp4\nPRIVATE_OSS_INPUT_OK`);
      return;
    }
    if (status === 'FAILED' || status === 'UNKNOWN') return console.log('\n[4] FAILED raw:', txt.slice(0, 700));
  }
  console.log('\nTIMEOUT');
}

main().catch((e) => { console.error('PROBE_ERROR', e?.message || e); process.exit(1); });