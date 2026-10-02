/**
 * 用复刻音色合成 —— 找 CosyVoice 的正确 HTTP 合成端点。
 * 用法： node --import tsx .pwtest/dashscope-cosy-synth-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

const TEXT = '大家好，今天给大家推荐一款特别好用的产品。';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // 参考音频
  const refRes = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ model: 'qwen-tts', input: { text: TEXT, voice: 'Cherry' }, parameters: {} }),
  });
  const refUrl = (await refRes.json())?.output?.audio?.url || '';
  const prefix = `cx${Date.now().toString(36).slice(-7)}`;
  const enr = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/customization`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      model: 'voice-enrollment',
      input: { action: 'create_voice', target_model: 'cosyvoice-v2', prefix, url: refUrl },
    }),
  });
  const voiceId = (await enr.json())?.output?.voice_id || '';
  console.log('voiceId =', voiceId);
  if (!voiceId) return;

  const cands: Array<[string, unknown]> = [
    [
      'multimodal-generation (model=cosyvoice-v2)',
      { path: '/api/v1/services/aigc/multimodal-generation/generation', body: { model: 'cosyvoice-v2', input: { text: TEXT, voice: voiceId }, parameters: {} } },
    ],
    [
      'speech-synthesis (model=cosyvoice-v2)',
      { path: '/api/v1/services/aigc/text2speech/speech-synthesis', body: { model: 'cosyvoice-v2', input: { text: TEXT }, parameters: { voice: voiceId, format: 'mp3' } } },
    ],
    [
      'speech-synthesis-v2 (model=cosyvoice-v2)',
      { path: '/api/v1/services/aigc/multimodal-generation/speech-synthesis', body: { model: 'cosyvoice-v2', input: { text: TEXT }, parameters: { voice: voiceId, format: 'mp3' } } },
    ],
  ];

  for (const [label, cfg] of cands) {
    const c = cfg as { path: string; body: unknown };
    const r = await fetch(`${dk.baseUrl}${c.path}`, { method: 'POST', headers: H, body: JSON.stringify(c.body) });
    const t = await r.text();
    console.log(`\n[${label}] http=${r.status}`);
    console.log('  ', t.slice(0, 450));
  }
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});