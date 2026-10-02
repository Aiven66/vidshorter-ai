/**
 * 验证：百炼临时上传能否用 public-read ACL，使 URL 可被 s2v 数据检查访问。
 * 用法： node --import tsx .pwtest/dh-s2v-public-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

const SAMPLE_IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');

  const pr = await fetch(`${dk.baseUrl}/api/v1/uploads?action=getPolicy&model=wan2.2-s2v`, {
    headers: { Authorization: `Bearer ${dk.apiKey}` },
  });
  const p = (await pr.json()).data as Record<string, string>;
  console.log('[policy]', JSON.stringify(p).slice(0, 500));

  const imgBuf = Buffer.from(await (await fetch(SAMPLE_IMG)).arrayBuffer());

  for (const acl of ['public-read', 'private']) {
    const key = `${p.upload_dir}/probe-${acl}-${Date.now()}.jpg`;
    const form = new FormData();
    form.append('OSSAccessKeyId', p.oss_access_key_id);
    form.append('policy', p.policy);
    form.append('Signature', p.signature);
    form.append('key', key);
    form.append('success_action_status', '200');
    form.append('x-oss-object-acl', acl);
    if (p.x_oss_forbid_overwrite) form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
    form.append('file', new Blob([new Uint8Array(imgBuf)], { type: 'image/jpeg' }), 'probe.jpg');
    const up = await fetch(p.upload_host, { method: 'POST', body: form });
    const url = `${p.upload_host}/${key}`;
    console.log(`\n[upload acl=${acl}] http=${up.status} ${up.ok ? '' : (await up.text()).slice(0, 200)}`);
    if (!up.ok) continue;
    console.log('   url =', url.slice(0, 110));
    console.log('   GET  =', (await fetch(url)).status);

    // 用该 URL 直接提交 s2v（音频用公开的 alicdn 不可用，改用 qwen-tts 公网结果）
    const t = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-tts', input: { text: '你好。', voice: 'Cherry' }, parameters: {} }),
    });
    const audioUrl = (await t.json())?.output?.audio?.url || '';
    const sub = await fetch(`${dk.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({
        model: 'wan2.2-s2v',
        input: { image_url: url, audio_url: audioUrl },
        parameters: { resolution: '480P', style: 'speech' },
      }),
    });
    const txt = await sub.text();
    console.log(`   s2v submit http=${sub.status}`, txt.slice(0, 260));
  }
}

main().catch((e) => { console.error('PROBE_ERROR', e?.message || e); process.exit(1); });