/**
 * DashScope wan2.2-s2v 数字人链路实测探针。
 * 目的：确认后台配置的 DASHSCOPE_API_KEY 是否具备 视频合成（数字人）权限，
 * 以及 workspace/域名 的正确形式。
 *
 * 用法： node --import tsx .pwtest/dashscope-s2v-probe.ts
 */
import { config } from 'dotenv';
config({ path: '.env.production' });

import { getDashscopeConfig } from '../src/lib/server/model-config';

const IMG =
  'https://img.alicdn.com/imgextra/i3/O1CN011FObkp1T7Ttowoq4F_!!6000000002335-0-tps-1440-1797.jpg';
const AUD =
  'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250825/iaqpio/input_audio.MP3';

async function main() {
  const cfg = await getDashscopeConfig();
  if (!cfg) {
    console.log('NO_CONFIG');
    return;
  }
  console.log('key_prefix =', cfg.apiKey.slice(0, 12) + '...', 'len =', cfg.apiKey.length);
  console.log('baseUrl    =', cfg.baseUrl);
  console.log('dhModel    =', cfg.digitalHumanModel);

  // ── 1) OpenAI 兼容 chat（已知通道，作为 Key 有效性基线） ──
  const chatRes = await fetch(`${cfg.baseUrl}/compatible-mode/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: 'reply with the single word: pong' }],
      max_tokens: 8,
    }),
  });
  console.log(`\n[chat] http=${chatRes.status}`, (await chatRes.text()).slice(0, 200));

  // ── 2) 视频合成提交（数字人链路关键路径） ──
  const submitRes = await fetch(
    `${cfg.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wan2.2-s2v',
        input: { image_url: IMG, audio_url: AUD },
        parameters: { resolution: '480P' },
      }),
    },
  );
  const submitText = await submitRes.text();
  console.log(`\n[submit wan2.2-s2v] http=${submitRes.status}`);
  console.log(submitText.slice(0, 800));

  let taskId = '';
  try {
    taskId = JSON.parse(submitText)?.output?.task_id || '';
  } catch {
    /* ignore */
  }
  if (!taskId) {
    console.log('\nNO_TASK_ID -> 提交未成功，停止轮询');
    return;
  }
  console.log('\ntask_id =', taskId);

  // ── 3) 轮询任务（最多 5 分钟） ──
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const q = await fetch(`${cfg.baseUrl}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    const t = await q.text();
    let st = '';
    let video = '';
    try {
      const j = JSON.parse(t);
      st = j?.output?.task_status || '';
      video = j?.output?.video_url || '';
    } catch {
      /* ignore */
    }
    console.log(`  poll#${i + 1} http=${q.status} status=${st} ${video ? 'video=' + video.slice(0, 90) : ''}`);
    if (st === 'SUCCEEDED' || st === 'FAILED' || st === 'UNKNOWN') {
      console.log(t.slice(0, 800));
      break;
    }
  }
}

main().catch((e) => {
  console.error('PROBE_ERROR', e?.message || e);
  process.exit(1);
});