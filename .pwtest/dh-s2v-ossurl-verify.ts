/**
 * 验证百炼临时文件“oss://”URL + X-DashScope-OssResourceResolve 头，能否驱动 wan2.2-s2v。
 * 用法： node --import tsx .pwtest/dh-s2v-ossurl-verify.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });
import { writeFile } from 'fs/promises';

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';

interface P { policy: string; signature: string; upload_dir: string; upload_host: string; oss_access_key_id: string; x_oss_object_acl?: string; x_oss_forbid_overwrite?: string }

async function getPolicy(base: string, k: string, model: string): Promise<P> {
  const r = await fetch(`${base}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${k}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error('policy ' + JSON.stringify(j).slice(0, 200));
  return j.data as P;
}

async function upload(p: P, buf: Buffer, name: string, mime: string): Promise<string> {
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
  return `oss://${key}`;
}

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');
  const MODEL = 'wan2.2-s2v';

  // 1) 旁白（qwen-tts 返回公网 URL，直接下载）
  const t = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-tts', input: { text: '你好，很高兴认识你。', voice: 'Cherry' }, parameters: {} }),
  });
  const audioUrl = (await t.json())?.output?.audio?.url || '';
  const audio = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
  console.log('[1] audio bytes =', audio.length, '（qwen-tts 输出为 wav，直接用其公网 URL）');

  // 2) 仅图片托管为 oss://；音频用 TTS 公网 URL（避免扩展名/容器不匹配的坑）
  const policy = await getPolicy(dk.baseUrl, dk.apiKey, MODEL);
  const img = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  const stamp = Date.now();
  const imageUrl = await upload(policy, img, `img-${stamp}.jpg`, 'image/jpeg');
  const audioOss = audioUrl;
  console.log('[2] image =', imageUrl);
  console.log('    audio =', audioOss.slice(0, 110));

  // 3) 提交 s2v（带 OssResourceResolve 头）
  const sub = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dk.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      'X-DashScope-OssResourceResolve': 'enable',
    },
    body: JSON.stringify({ model: MODEL, input: { image_url: imageUrl, audio_url: audioOss }, parameters: { resolution: '480P', style: 'speech' } }),
  });
  const subText = await sub.text();
  const taskId = (() => { try { return JSON.parse(subText)?.output?.task_id || ''; } catch { return ''; } })();
  console.log(`[3] submit http=${sub.status} task_id=${taskId}`);
  if (!taskId) return console.log('SUBMIT_FAIL', subText.slice(0, 600));

  // 4) 轮询
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const q = await fetch(`${dk.baseUrl}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${dk.apiKey}` } });
    const txt = await q.text();
    let status = '', video = '', msg = '';
    try { const j = JSON.parse(txt); status = j?.output?.task_status || ''; video = j?.output?.results?.video_url || ''; msg = j?.output?.message || j?.message || ''; } catch {}
    console.log(`    poll#${i + 1} ${status}${msg ? ' msg=' + msg.slice(0, 140) : ''}`);
    if (status === 'SUCCEEDED') {
      const vb = Buffer.from(await (await fetch(video)).arrayBuffer());
      await writeFile('/tmp/clipop-dh-ossurl.mp4', vb);
      console.log(`\n[4] OK video bytes=${vb.length} url=${video.slice(0, 120)}\nOSS_URL_CHAIN_OK`);
      return;
    }
    if (status === 'FAILED' || status === 'UNKNOWN') return console.log('\n[4] FAILED', txt.slice(0, 700));
  }
  console.log('\nTIMEOUT');
}

main().catch((e) => { console.error('PROBE_ERROR', e?.message || e); process.exit(1); });