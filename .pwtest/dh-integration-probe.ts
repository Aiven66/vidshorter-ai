/**
 * 数字人口播 —— 完整链路集成验证（服务端实现的原型）。
 *
 * 链路：MiniMax t2a_v2 合成口播音频 → 百炼临时上传托管（图 + 音频）→ wan2.2-s2v 提交
 *      → 轮询 → 取回 video_url → 下载校验可解码。
 *
 * 刻意用极短音频（约 3 秒）把验证成本压到最低（480P 约 0.5 元/秒）。
 *
 * 用法： node --import tsx .pwtest/dh-integration-probe.ts
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

async function getUploadPolicy(base: string, apiKey: string): Promise<OSSPolicy> {
  const r = await fetch(`${base}/api/v1/uploads?action=getPolicy&model=wan2.2-s2v`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const j = await r.json();
  return j.data as OSSPolicy;
}

async function uploadToPolicy(
  p: OSSPolicy,
  buf: Buffer,
  fileName: string,
  mime: string,
): Promise<string> {
  const key = `${p.upload_dir}/${fileName}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', p.oss_access_key_id);
  form.append('policy', p.policy);
  form.append('Signature', p.signature);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('x-oss-object-acl', p.x_oss_object_acl || 'private');
  if (p.x_oss_forbid_overwrite) form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), fileName);
  const r = await fetch(p.upload_host, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`oss upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${p.upload_host}/${key}`;
}

async function main() {
  const { getDashscopeConfig, getMinimaxConfig } = await import('../src/lib/server/model-config');
  const dk = await getDashscopeConfig();
  const mm = await getMinimaxConfig();
  if (!dk || !mm) {
    console.log('NO_CONFIG', { dk: !!dk, mm: !!mm });
    return;
  }

  // ── 1) MiniMax 合成口播音频 ──
  const ttsRes = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${mm.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: mm.voiceModel,
      text: NARRATION,
      stream: false,
      voice_setting: { voice_id: 'Chinese (Mandarin)_Gentle_Senior', speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    }),
  });
  const ttsJson = await ttsRes.json();
  const audio = Buffer.from(ttsJson?.data?.audio || '', 'hex');
  console.log(`[1] minimax tts bytes=${audio.length}`);
  if (!audio.length) {
    console.log('TTS_FAIL', JSON.stringify(ttsJson).slice(0, 300));
    return;
  }

  // ── 2) 百炼托管图 + 音频 ──
  const policy = await getUploadPolicy(dk.baseUrl, dk.apiKey);
  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());
  const stamp = Date.now();
  const imageUrl = await uploadToPolicy(policy, imgBuf, `img-${stamp}.jpg`, 'image/jpeg');
  const audioUrl = await uploadToPolicy(policy, audio, `aud-${stamp}.mp3`, 'audio/mpeg');
  console.log('[2] hosted image =', imageUrl.slice(0, 110));
  console.log('    hosted audio =', audioUrl.slice(0, 110));

  // ── 3) 提交 s2v ──
  const subRes = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dk.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'wan2.2-s2v',
      input: { image_url: imageUrl, audio_url: audioUrl },
      parameters: { resolution: '480P', style: 'speech' },
    }),
  });
  const subText = await subRes.text();
  const taskId = JSON.parse(subText)?.output?.task_id || '';
  console.log(`[3] submit http=${subRes.status} task_id=${taskId}`);
  if (!taskId) {
    console.log('SUBMIT_FAIL', subText.slice(0, 500));
    return;
  }

  // ── 4) 轮询 ──
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const q = await fetch(`${dk.baseUrl}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${dk.apiKey}` },
    });
    const t = await q.text();
    let status = '';
    let video = '';
    let msg = '';
    try {
      const j = JSON.parse(t);
      status = j?.output?.task_status || '';
      video = j?.output?.results?.video_url || '';
      msg = j?.output?.message || j?.message || '';
    } catch {
      /* ignore */
    }
    console.log(`    poll#${i + 1} status=${status}${msg ? ' msg=' + msg.slice(0, 120) : ''}`);
    if (status === 'SUCCEEDED') {
      console.log('\n[4] video_url =', video.slice(0, 140));
      const vb = Buffer.from(await (await fetch(video)).arrayBuffer());
      await writeFile('/tmp/clipop-dh-result.mp4', vb);
      console.log(`    downloaded bytes=${vb.length} -> /tmp/clipop-dh-result.mp4`);
      console.log('\nINTEGRATION_OK');
      return;
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      console.log('\n[4] FAILED raw:', t.slice(0, 600));
      return;
    }
  }
  console.log('\nTIMEOUT');
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});