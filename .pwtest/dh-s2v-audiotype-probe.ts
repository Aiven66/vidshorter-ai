/**
 * 诊断 s2v 音频输入：qwen-tts 产物格式 + 直接用 https 公网 URL 是否通过。
 * 用法： node --import tsx .pwtest/dh-s2v-audiotype-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });
import { writeFile } from 'fs/promises';

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // qwen-tts 产物
  const t = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ model: 'qwen-tts', input: { text: '你好，很高兴认识你。', voice: 'Cherry' }, parameters: {} }),
  });
  const j = await t.json();
  const url: string = j?.output?.audio?.url || '';
  console.log('[qwen-tts] url =', url.slice(0, 160));
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile('/tmp/clipop-tts-out.bin', buf);
  console.log('  bytes =', buf.length, 'magic =', buf.slice(0, 12).toString('hex'), 'ascii =', JSON.stringify(buf.slice(0, 4).toString('latin1')));

  // Image 托管为 oss://
  const pr = await fetch(`${dk.baseUrl}/api/v1/uploads?action=getPolicy&model=wan2.2-s2v`, { headers: { Authorization: `Bearer ${dk.apiKey}` } });
  const p = (await pr.json()).data;
  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  const imgKey = `${p.upload_dir}/img-${Date.now()}.jpg`;
  const f1 = new FormData();
  f1.append('OSSAccessKeyId', p.oss_access_key_id);
  f1.append('policy', p.policy);
  f1.append('Signature', p.signature);
  f1.append('key', imgKey);
  f1.append('success_action_status', '200');
  f1.append('x-oss-object-acl', p.x_oss_object_acl);
  f1.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  f1.append('file', new Blob([new Uint8Array(imgBuf)], { type: 'image/jpeg' }), 'img.jpg');
  const up1 = await fetch(p.upload_host, { method: 'POST', body: f1 });
  const imageOss = `oss://${imgKey}`;
  console.log('[img] upload =', up1.status, imageOss);

  const headers = {
    Authorization: `Bearer ${dk.apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
    'X-DashScope-OssResourceResolve': 'enable',
  };

  // A) 音频直接用 qwen-tts 的公网 https URL
  const A = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'wan2.2-s2v', input: { image_url: imageOss, audio_url: url }, parameters: { resolution: '480P', style: 'speech' } }),
  });
  console.log('\n[A audio=https 公网 URL] http=', A.status, (await A.text()).slice(0, 300));

  // B) 音频托管为 oss://，key 用 .wav 扩展名
  const audKey = `${p.upload_dir}/aud-${Date.now()}.wav`;
  const f2 = new FormData();
  f2.append('OSSAccessKeyId', p.oss_access_key_id);
  f2.append('policy', p.policy);
  f2.append('Signature', p.signature);
  f2.append('key', audKey);
  f2.append('success_action_status', '200');
  f2.append('x-oss-object-acl', p.x_oss_object_acl);
  f2.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  f2.append('file', new Blob([new Uint8Array(buf)], { type: 'audio/wav' }), 'aud.wav');
  const up2 = await fetch(p.upload_host, { method: 'POST', body: f2 });
  console.log('[aud] upload =', up2.status, `oss://${audKey}`);
  const B = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'wan2.2-s2v', input: { image_url: imageOss, audio_url: `oss://${audKey}` }, parameters: { resolution: '480P', style: 'speech' } }),
  });
  console.log('[B audio=oss:// .wav] http=', B.status, (await B.text()).slice(0, 300));
}

main().catch((e) => { console.error('PROBE_ERROR', e?.message || e); process.exit(1); });