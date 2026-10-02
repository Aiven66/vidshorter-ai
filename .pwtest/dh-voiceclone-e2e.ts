/**
 * 声音克隆真实链路 E2E：
 *   生成参考音频(wav) → Supabase ticket 直传 → 1h 签名 URL → 百炼 voice-enrollment 建音色
 *   → SpeechSynthesizer 用复刻音色合成 → 下载校验。
 * 关键待验证点：**阿里云服务端能否抓取 Supabase 签名 URL 作为参考音频**。
 *
 * 用法： node --import tsx .pwtest/dh-voiceclone-e2e.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });
import { writeFile } from 'fs/promises';

const PROBE_USER = 'probe-dh-voice';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // 1) 参考音频（qwen-tts 产出 wav）
  const t = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ model: 'qwen-tts', input: { text: '大家好，今天给大家推荐一款特别好用的产品，性价比非常高。', voice: 'Cherry' }, parameters: {} }),
  });
  const wavUrl = (await t.json())?.output?.audio?.url || '';
  if (!wavUrl) return console.log('NO_TTS_URL');
  const wav = Buffer.from(await (await fetch(wavUrl)).arrayBuffer());
  console.log('[1] ref wav bytes =', wav.length);

  // 2) Supabase ticket 直传（走真实服务端函数）
  const store = await import('../src/lib/server/ai-tools/storage');
  const ticket = await store.createUploadTicket(PROBE_USER, 'ref.wav');
  console.log('[2] ticket path =', ticket.objectPath);
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav', 'x-upsert': 'true' },
    body: new Uint8Array(wav),
  });
  console.log('    PUT =', put.status, put.ok ? '' : (await put.text()).slice(0, 200));
  if (!put.ok) return;

  // 3) 1h 签名 URL（交给百炼）
  const signedUrl = await store.createInputSignedUrl(PROBE_USER, ticket.objectPath);
  console.log('[3] signed url host =', new URL(signedUrl).host, '| GET =', (await fetch(signedUrl)).status);

  // 4) voice-enrollment
  const prefix = `de${Date.now().toString(36).slice(-6)}`;
  const enr = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/customization`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ model: 'voice-enrollment', input: { action: 'create_voice', target_model: 'cosyvoice-v2', prefix, url: signedUrl } }),
  });
  const enrText = await enr.text();
  const voiceId = (() => { try { return JSON.parse(enrText)?.output?.voice_id || ''; } catch { return ''; } })();
  console.log(`[4] enrollment http=${enr.status} voiceId=${voiceId || 'NONE'}`);
  if (!voiceId) return console.log('ENROLL_FAIL', enrText.slice(0, 500));

  // 5) 用复刻音色合成
  const syn = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ model: 'cosyvoice-v2', input: { text: '你好，很高兴认识你，这是我的声音预览。', voice: voiceId, format: 'mp3', sample_rate: 24000 } }),
  });
  const synText = await syn.text();
  const outUrl = (() => { try { return JSON.parse(synText)?.output?.audio?.url || ''; } catch { return ''; } })();
  console.log(`[5] synth http=${syn.status} url=${outUrl ? outUrl.slice(0, 90) : 'NONE'}`);
  if (!outUrl) return console.log('SYNTH_FAIL', synText.slice(0, 400));
  const out = Buffer.from(await (await fetch(outUrl)).arrayBuffer());
  await writeFile('/tmp/clipop-voiceclone-preview.mp3', out);
  console.log(`    preview bytes=${out.length} -> /tmp/clipop-voiceclone-preview.mp3\nVOICE_CLONE_CHAIN_OK`);
}

main().catch((e) => { console.error('PROBE_ERROR', e?.message || e); process.exit(1); });