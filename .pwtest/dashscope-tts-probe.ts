/**
 * 百炼（DashScope）语音合成 + 音色复刻可用性验证。
 * MiniMax 余额不足时，用同一把 DashScope key 承接「TTS + 声音克隆」，两条链路收敛到一家。
 *
 * 验证项：
 *   A) qwen-tts 同步合成（新的多模态生成接口）
 *   B) cosyvoice-v1 合成（老接口，返回音频 URL）
 *   C) voice-enrollment 音色复刻（用 B 产出的音频做参考）
 *
 * 用法： node --import tsx .pwtest/dashscope-tts-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { writeFile } from 'fs/promises';

const TEXT = '你好，很高兴认识你，这是我的声音预览。';

async function main() {
  const dk = await (await import('../src/lib/server/model-config')).getDashscopeConfig();
  if (!dk) {
    console.log('NO_CONFIG');
    return;
  }
  const H = { Authorization: `Bearer ${dk.apiKey}`, 'Content-Type': 'application/json' };

  // ── A) qwen-tts ──
  const a = await fetch(`${dk.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      model: 'qwen-tts',
      input: { text: TEXT, voice: 'Cherry' },
      parameters: {},
    }),
  });
  const at = await a.text();
  console.log(`[A qwen-tts] http=${a.status}`);
  console.log(at.slice(0, 500));

  // ── B) cosyvoice-v1（老接口，同步返回音频 URL） ──
  const b = await fetch(`${dk.baseUrl}/api/v1/services/aigc/text2speech/speech-synthesis`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      model: 'cosyvoice-v1',
      input: { text: TEXT },
      parameters: { voice: 'longxiaochun', format: 'mp3', sample_rate: 22050 },
    }),
  });
  const bt = await b.text();
  console.log(`\n[B cosyvoice-v1] http=${b.status}`);
  console.log(bt.slice(0, 500));
  let cosyUrl = '';
  try {
    cosyUrl = JSON.parse(bt)?.output?.audio_url || '';
  } catch {
    /* ignore */
  }
  if (cosyUrl) {
    const buf = Buffer.from(await (await fetch(cosyUrl)).arrayBuffer());
    await writeFile('/tmp/clipop-dashscope-tts.mp3', buf);
    console.log(`  -> audio bytes=${buf.length} saved /tmp/clipop-dashscope-tts.mp3`);
  }

  // ── C) 音色复刻（CosyVoice voice-enrollment） ──
  if (!cosyUrl) {
    console.log('\n[C] 跳过：无参考音频 URL');
    return;
  }
  const prefix = `clipop${Date.now().toString(36)}`;
  const c = await fetch(`${dk.baseUrl}/api/v1/services/audio/tts/customization`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      model: 'voice-enrollment',
      input: {
        action: 'create_voice',
        target_model: 'cosyvoice-v1',
        prefix,
        url: cosyUrl,
      },
    }),
  });
  const ct = await c.text();
  console.log(`\n[C voice-enrollment] http=${c.status} prefix=${prefix}`);
  console.log(ct.slice(0, 600));
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});