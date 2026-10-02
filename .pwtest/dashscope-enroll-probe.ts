/**
 * 百炼音色复刻（voice-enrollment）接口探测 + 复刻音色合成验证。
 * 用 qwen-tts 产出的公网音频 URL 作为参考音，创建复刻音色并用它合成。
 *
 * 用法： node --import tsx .pwtest/dashscope-enroll-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

const TEXT = '大家好，今天给大家推荐一款特别好用的产品。';

async function tts(base: string, apiKey: string, voice: string) {
  const r = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-tts', input: { text: TEXT, voice }, parameters: {} }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, url: j?.output?.audio?.url || '', raw: JSON.stringify(j).slice(0, 300) };
}

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) {
    console.log('NO_CONFIG');
    return;
  }
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // 1) 参考音频（公网 URL）
  const ref = await tts(dk.baseUrl, dk.apiKey, 'Cherry');
  console.log(`[1 ref audio] http=${ref.status}`);
  console.log('   url =', ref.url.slice(0, 120));
  if (!ref.url) {
    console.log('   FAIL', ref.raw);
    return;
  }

  // prefix 限制 ≤10 字符（实测约束）
  const prefix = `cp${Date.now().toString(36).slice(-7)}`;
  for (const targetModel of ['cosyvoice-v2', 'cosyvoice-v1']) {
    const r = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/customization`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        model: 'voice-enrollment',
        input: { action: 'create_voice', target_model: targetModel, prefix, url: ref.url },
      }),
    });
    const t = await r.text();
    console.log(`\n[2 enrollment target=${targetModel}] http=${r.status}`);
    console.log('   ', t.slice(0, 400));
    if (r.ok && t.includes('voice_id')) {
      let voiceId = '';
      try {
        voiceId = JSON.parse(t)?.output?.voice_id || '';
      } catch {
        /* ignore */
      }
      if (voiceId) {
        const use = await tts(dk.baseUrl, dk.apiKey, voiceId);
        console.log(`\n[3 synth with cloned voice=${voiceId}] http=${use.status}`);
        console.log('   url =', use.url ? use.url.slice(0, 120) : 'NONE');
        console.log(use.url ? '\nENROLL_OK' : `   FAIL ${use.raw}`);
      }
      return;
    }
  }
  console.log('\nENROLL_FAIL: 三种 target_model 均未返回 voice_id');
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});