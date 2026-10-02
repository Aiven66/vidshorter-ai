/**
 * CosyVoice 非实时 HTTP 合成（正确端点）验证。
 * 依据官方文档：POST /api/v1/services/audio/tts/SpeechSynthesizer
 * 用法： node --import tsx .pwtest/dashscope-cosy-http-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

const TEXT = '大家好，今天给大家推荐一款特别好用的产品。';

async function qwenTts(base: string, apiKey: string, voice: string) {
  const r = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-tts', input: { text: TEXT, voice }, parameters: {} }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.output?.audio?.url || '';
}

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) return console.log('NO_CONFIG');
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // 1) 造一个复刻音色
  const refUrl = await qwenTts(dk.baseUrl, dk.apiKey, 'Cherry');
  if (!refUrl) return console.log('NO_REF_URL');
  const prefix = `ch${Date.now().toString(36).slice(-7)}`;
  const enr = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/customization`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      model: 'voice-enrollment',
      input: { action: 'create_voice', target_model: 'cosyvoice-v2', prefix, url: refUrl },
    }),
  });
  const voiceId = (await enr.json().catch(() => ({})))?.output?.voice_id || '';
  console.log('[1] voiceId =', voiceId);
  if (!voiceId) return;

  // 2) 正确端点候选
  const bases = [
    dk.baseUrl,
    'https://dashscope.aliyuncs.com',
  ];
  const paths = ['/api/v1/services/audio/tts/SpeechSynthesizer'];

  for (const base of bases) {
    for (const p of paths) {
      const body = {
        model: 'cosyvoice-v2',
        input: { text: TEXT, voice: voiceId, format: 'mp3', sample_rate: 24000 },
      };
      const r = await fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
      const ct = r.headers.get('content-type') || '';
      console.log(`\n[post ${base}${p}] http=${r.status} ct=${ct}`);
      if (ct.includes('json')) {
        const t = await r.text();
        console.log('  ', t.slice(0, 600));
      } else {
        const buf = Buffer.from(await r.arrayBuffer());
        console.log(`   binary bytes=${buf.length} magic=${buf.slice(0, 4).toString('hex')}`);
      }
    }
  }
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});