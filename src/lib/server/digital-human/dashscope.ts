/**
 * 阿里云百炼（DashScope）—— 数字人口播 + 声音克隆 **真实调用链路**。
 *
 * 以下端点均于 2026-10-02 实测通过（北京地域）：
 *
 *  1) 临时文件托管（把本地图片给模型当输入用）
 *     GET  {base}/api/v1/uploads?action=getPolicy&model=<model>  → OSS 直传凭证（ACL **强制 private**）
 *     POST {upload_host}（multipart，字段顺序敏感）                → 返回 `oss://{upload_dir}/{filename}`
 *     ⚠️ 该 oss:// URL **不能**直接 HTTP GET（403）；模型调用时必须带请求头
 *        `X-DashScope-OssResourceResolve: enable`，否则报 InvalidParameter.DataInspection。
 *     ⚠️ 文件名扩展名必须与**真实容器**一致：qwen-tts 返回的是 wav，若存成 .mp3 会报
 *        「File type is not supported. Allowed types are: .wav, .mp3.」
 *
 *  2) 数字人口播：wan2.2-s2v（异步，实测 480P 约 2 分钟出片）
 *     POST {base}/api/v1/services/aigc/image2video/video-synthesis → output.task_id
 *     GET  {base}/api/v1/tasks/{task_id}                          → output.task_status / results.video_url
 *     约束：音频 wav/mp3、<15MB、**时长 <20s**；图片 边长 400–7000px。
 *     音频可直接用 TTS 返回的公网 URL（https），无需再托管。
 *
 *  3) 声音复刻：voice-enrollment
 *     POST {base}/api/v1/services/audio/tts/customization
 *     body { model:'voice-enrollment', input:{ action:'create_voice', target_model:'cosyvoice-v2', prefix, url } }
 *     → output.voice_id（prefix **必须 ≤10 字符**）
 *
 *  4) 语音合成（预设 + 复刻音色），均返回 output.audio.url
 *     - 复刻音色：POST {base}/api/v1/services/audio/tts/SpeechSynthesizer
 *        body { model:'cosyvoice-v2', input:{ text, voice, format:'mp3', sample_rate:24000 } }
 *     - 预设音色：POST {base}/api/v1/services/aigc/multimodal-generation/generation
 *        body { model:'qwen-tts', input:{ text, voice }, parameters:{} }
 */

import { requireDashscopeConfig, DashscopeError, type DashscopeCreds } from './config';

export { requireDashscopeConfig, DashscopeError };
export type { DashscopeCreds };

/** 数字人视频合成模型 */
export const TALKING_VIDEO_MODEL = 'wan2.2-s2v';
/** 声音复刻的目标合成模型 */
export const CLONE_TARGET_MODEL = 'cosyvoice-v2';
/** 预设音色合成模型 */
export const PRESET_TTS_MODEL = 'qwen-tts';
/** qwen-tts 可用预设音色 */
export const PRESET_VOICES = ['Cherry', 'Serena', 'Ethan', 'Chelsie'] as const;

/**
 * wan2.2-s2v 硬约束：音频时长须 <20s。
 * 实测中文约 0.2s/字（10 字 ≈ 2.3s，含首尾静音），72 字约 15s，留足安全余量。
 */
export const MAX_NARRATION_CHARS = 72;

// ── 临时文件托管 ─────────────────────────────────────────────────────────────

interface OssPolicy {
  policy: string;
  signature: string;
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  x_oss_object_acl?: string;
  x_oss_forbid_overwrite?: string;
}

async function getUploadPolicy(creds: DashscopeCreds, model: string): Promise<OssPolicy> {
  const r = await fetch(
    `${creds.baseUrl}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
    { headers: { Authorization: `Bearer ${creds.apiKey}` }, cache: 'no-store' },
  );
  const text = await r.text();
  let data: OssPolicy | undefined;
  try {
    data = (JSON.parse(text) as { data?: OssPolicy }).data;
  } catch {
    /* fallthrough */
  }
  if (!r.ok || !data?.upload_host) {
    throw new DashscopeError('UPLOAD_POLICY_FAILED', `getPolicy ${r.status} ${text.slice(0, 200)}`);
  }
  return data;
}

/**
 * 把 Buffer 托管到百炼临时空间，返回 `oss://...`（有效期 48h）。
 * 调用模型时必须带 `X-DashScope-OssResourceResolve: enable` 头。
 * @param ext 必须与真实容器一致（jpg / png / wav / mp3 …）
 */
export async function hostOnDashscope(
  creds: DashscopeCreds,
  buf: Buffer,
  ext: string,
  mime: string,
  model: string = TALKING_VIDEO_MODEL,
): Promise<string> {
  const p = await getUploadPolicy(creds, model);
  const stamp = Date.now();
  const filename = `${model.replace(/[^\w]+/g, '-')}-${stamp}.${ext}`;
  const key = `${p.upload_dir}/${filename}`;
  const form = new FormData();
  // 字段顺序与官方示例一致；缺 OSSAccessKeyId / x-oss-object-acl 都会 403
  form.append('OSSAccessKeyId', p.oss_access_key_id);
  form.append('policy', p.policy);
  form.append('Signature', p.signature);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('x-oss-object-acl', p.x_oss_object_acl || 'private');
  if (p.x_oss_forbid_overwrite) form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename);

  const r = await fetch(p.upload_host, { method: 'POST', body: form });
  if (!r.ok) {
    throw new DashscopeError('UPLOAD_FAILED', `oss upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return `oss://${key}`;
}

// ── 语音合成 ─────────────────────────────────────────────────────────────────

/** 复刻音色的 voice_id 形如 `cosyvoice-v2-xxxx`；据此选择合成通道。 */
function isClonedVoice(voice: string): boolean {
  return /^cosyvoice/i.test(voice);
}

/** 读出 `output.audio.url`（qwen-tts 与 CosyVoice 返回结构一致）。 */
function readAudioUrl(text: string): string {
  try {
    return (JSON.parse(text) as { output?: { audio?: { url?: string } } })?.output?.audio?.url || '';
  } catch {
    return '';
  }
}

async function synthesizeClonedUrl(creds: DashscopeCreds, text: string, voice: string): Promise<string> {
  const r = await fetch(`${creds.baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CLONE_TARGET_MODEL,
      input: { text, voice, format: 'mp3', sample_rate: 24000 },
    }),
  });
  const t = await r.text();
  const url = readAudioUrl(t);
  if (!url) throw new DashscopeError('TTS_FAILED', `cosyvoice ${r.status} ${t.slice(0, 300)}`);
  return url;
}

async function synthesizePresetUrl(creds: DashscopeCreds, text: string, voice: string): Promise<string> {
  const r = await fetch(`${creds.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: PRESET_TTS_MODEL, input: { text, voice }, parameters: {} }),
  });
  const t = await r.text();
  const url = readAudioUrl(t);
  if (!url) {
    throw new DashscopeError(
      'TTS_FAILED',
      `qwen-tts ${r.status} ${t.slice(0, 300)}（预设音色仅支持 ${PRESET_VOICES.join(' / ')}）`,
    );
  }
  return url;
}

/**
 * 合成旁白，返回**公网可访问的音频 URL**（qwen-tts 返回 wav、复刻音色返回 mp3）。
 * 该 URL 可直接喂给 wan2.2-s2v，无需再次托管。
 */
export async function synthesizeNarrationUrl(
  creds: DashscopeCreds,
  opts: { text: string; voice: string },
): Promise<string> {
  const text = opts.text.trim();
  if (!text) throw new DashscopeError('EMPTY_TEXT', '旁白文本为空', 400);
  if (text.length > MAX_NARRATION_CHARS) {
    throw new DashscopeError(
      'TEXT_TOO_LONG',
      `旁白过长（${text.length} 字）。wan2.2-s2v 单次音频须 <20 秒，请精简到 ${MAX_NARRATION_CHARS} 字以内。`,
      400,
    );
  }
  return isClonedVoice(opts.voice)
    ? await synthesizeClonedUrl(creds, text, opts.voice)
    : await synthesizePresetUrl(creds, text, opts.voice);
}

// ── 声音复刻 ─────────────────────────────────────────────────────────────────

/**
 * 用参考音频（公网可访问 URL）创建一个复刻音色。
 * @param prefix 音色前缀，**必须 ≤10 字符**（百炼硬限制）
 */
export async function createClonedVoice(
  creds: DashscopeCreds,
  opts: { referenceUrl: string; prefix: string },
): Promise<string> {
  const prefix = opts.prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'dhvoice';
  const r = await fetch(`${creds.baseUrl}/api/v1/services/audio/tts/customization`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'voice-enrollment',
      input: { action: 'create_voice', target_model: CLONE_TARGET_MODEL, prefix, url: opts.referenceUrl },
    }),
  });
  const text = await r.text();
  let voiceId = '';
  try {
    voiceId = (JSON.parse(text) as { output?: { voice_id?: string } })?.output?.voice_id || '';
  } catch {
    /* fallthrough */
  }
  if (!voiceId) throw new DashscopeError('VOICE_CLONE_FAILED', `voice-enrollment ${r.status} ${text.slice(0, 300)}`);
  return voiceId;
}

// ── 数字人口播（wan2.2-s2v，异步） ────────────────────────────────────────────

export type TalkingVideoStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface TalkingVideoResult {
  status: TalkingVideoStatus;
  videoUrl?: string;
  message?: string;
}

/** 提交数字人视频合成任务，返回百炼 task_id（24h 内可查）。 */
export async function submitTalkingVideo(
  creds: DashscopeCreds,
  opts: { imageUrl: string; audioUrl: string; resolution?: '480P' | '720P' },
): Promise<string> {
  const r = await fetch(`${creds.baseUrl}/api/v1/services/aigc/image2video/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      // oss:// 输入必须带此头，否则 InvalidParameter.DataInspection
      'X-DashScope-OssResourceResolve': 'enable',
    },
    body: JSON.stringify({
      model: TALKING_VIDEO_MODEL,
      input: { image_url: opts.imageUrl, audio_url: opts.audioUrl },
      parameters: { resolution: opts.resolution || '480P', style: 'speech' },
    }),
  });
  const text = await r.text();
  let taskId = '';
  try {
    taskId = (JSON.parse(text) as { output?: { task_id?: string } })?.output?.task_id || '';
  } catch {
    /* fallthrough */
  }
  if (!taskId) throw new DashscopeError('SUBMIT_FAILED', `s2v ${r.status} ${text.slice(0, 400)}`);
  return taskId;
}

/** 查询数字人视频任务状态。 */
export async function pollTalkingVideo(creds: DashscopeCreds, taskId: string): Promise<TalkingVideoResult> {
  const r = await fetch(`${creds.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}` },
    cache: 'no-store',
  });
  const text = await r.text();
  try {
    const j = JSON.parse(text) as {
      output?: { task_status?: string; results?: { video_url?: string }; message?: string };
      message?: string;
    };
    return {
      status: (j.output?.task_status || 'UNKNOWN') as TalkingVideoStatus,
      videoUrl: j.output?.results?.video_url,
      message: j.output?.message || j.message,
    };
  } catch {
    throw new DashscopeError('POLL_FAILED', `poll ${r.status} ${text.slice(0, 300)}`);
  }
}