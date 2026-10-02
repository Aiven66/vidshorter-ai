/**
 * MiniMax 声音克隆链路实测探针。
 *  1) 用 msedge-tts 现场合成一段 ≥10s 的中文参考音频（克隆最小时长要求 10s）
 *  2) POST /v1/files/upload (purpose=voice_clone) → file_id
 *  3) POST /v1/voice_clone → 自定义 voice_id
 *  4) POST /v1/t2a_v2 用克隆音色合成一段音频 → 校验返回 audio 非空
 *
 * 用法： node --import tsx .pwtest/minimax-clone-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { writeFile } from 'fs/promises';
import { getMinimaxConfig } from '../src/lib/server/model-config';

/** 克隆/上传的最小 10s 时长要求 → 准备一段足够长的中文参考文本 */
const REF_TEXT =
  '大家好，欢迎来到我的频道。今天想和你聊一个特别实用的话题，' +
  '就是如何在忙碌的生活里，依然保持专注和热情。' +
  '我试过很多方法，最后发现真正有效的是把大目标拆成每天可以完成的小步骤。' +
  '当你每天都能完成一点点，信心就会慢慢积累起来。' +
  '希望这段分享对你有帮助，我们下期再见。';

async function main() {
  const cfg = await getMinimaxConfig();
  if (!cfg) {
    console.log('NO_CONFIG');
    return;
  }
  const base = 'https://api.minimaxi.com';
  console.log('key_prefix =', cfg.apiKey.slice(0, 12) + '...', 'len =', cfg.apiKey.length);
  console.log('groupId    =', cfg.groupId);
  console.log('voiceModel =', cfg.voiceModel);

  // ── 1) 参考音频：用 MiniMax 自带系统音色合成（避免 msedge-tts 断流，且链路自洽） ──
  const refPath = '/tmp/clipop-clone-ref.mp3';
  const sysRes = await fetch(`${base}/v1/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-02-hd',
      text: REF_TEXT,
      stream: false,
      voice_setting: { voice_id: 'Chinese (Mandarin)_Gentle_Senior', speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    }),
  });
  const sysText = await sysRes.text();
  let sysHex = '';
  try {
    const j = JSON.parse(sysText);
    sysHex = j?.data?.audio || '';
    if (!sysHex) console.log('[sys tts] base_resp =', JSON.stringify(j?.base_resp));
  } catch {
    /* ignore */
  }
  if (!sysHex) {
    console.log(`\n[sys tts] http=${sysRes.status} FAILED`, sysText.slice(0, 400));
    return;
  }
  const ref = Buffer.from(sysHex, 'hex');
  await writeFile(refPath, ref);
  console.log(`\n[ref audio] bytes=${ref.length} -> ${refPath}`);

  // ── 2) 上传 ──
  const form = new FormData();
  form.append('purpose', 'voice_clone');
  form.append('file', new Blob([new Uint8Array(ref)], { type: 'audio/mpeg' }), 'clone_ref.mp3');
  const upRes = await fetch(`${base}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  });
  const upText = await upRes.text();
  console.log(`\n[upload] http=${upRes.status}`);
  console.log(upText.slice(0, 600));
  let fileId: number | null = null;
  try {
    fileId = JSON.parse(upText)?.file?.file_id ?? null;
  } catch {
    /* ignore */
  }
  if (!fileId) {
    console.log('\nNO_FILE_ID -> 停止');
    return;
  }
  console.log('file_id =', fileId);

  // ── 3) 克隆 ──
  const voiceId = `clipop${Date.now().toString(36)}`;
  const cloneRes = await fetch(`${base}/v1/voice_clone`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, voice_id: voiceId, model: 'speech-02-hd' }),
  });
  const cloneText = await cloneRes.text();
  console.log(`\n[voice_clone] http=${cloneRes.status} voice_id=${voiceId}`);
  console.log(cloneText.slice(0, 700));
  let demo = '';
  try {
    demo = JSON.parse(cloneText)?.demo_audio || '';
  } catch {
    /* ignore */
  }
  if (demo) console.log('demo_audio =', demo.slice(0, 120));

  // ── 4) 用克隆音色合成 ──
  const ttsRes = await fetch(`${base}/v1/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'speech-02-hd',
      text: '你好，很高兴认识你，这是我的声音预览。',
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
    }),
  });
  const ttsText = await ttsRes.text();
  console.log(`\n[t2a_v2 with cloned voice] http=${ttsRes.status}`);
  let hex = '';
  let statusMsg = '';
  try {
    const j = JSON.parse(ttsText);
    hex = j?.data?.audio || '';
    statusMsg = j?.base_resp?.status_msg || '';
  } catch {
    /* ignore */
  }
  console.log('base_resp =', statusMsg || '(none)');
  console.log('audio_hex_len =', hex.length);
  if (hex) {
    const buf = Buffer.from(hex, 'hex');
    await writeFile('/tmp/clipop-clone-preview.mp3', buf);
    console.log(`CLONE_OK bytes=${buf.length} -> /tmp/clipop-clone-preview.mp3`);
  } else {
    console.log('CLONE_FAIL', ttsText.slice(0, 400));
  }
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});