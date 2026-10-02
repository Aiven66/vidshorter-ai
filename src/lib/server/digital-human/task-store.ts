/**
 * 数字人任务 / 复刻音色 —— 服务端持久化。
 *
 * 选型：沿用 model-config.ts 的**零 DDL** 方案——私有桶 `clipop-config` 下放 JSON 对象，
 * 匿名不可读，仅服务端 service role 可读写。项目无 Supabase PAT，无法建表/迁移。
 *   - 任务：digital-human/tasks/{taskId}.json
 *   - 音色：digital-human/voices/{userId}.json（每用户一个数组）
 */

const BUCKET = 'clipop-config';
const TASK_PREFIX = 'digital-human/tasks';
const VOICE_PREFIX = 'digital-human/voices';

function serviceCreds(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

export function isTaskStoreConfigured(): boolean {
  return serviceCreds() !== null;
}

async function readJson<T>(path: string): Promise<T | null> {
  const creds = serviceCreds();
  if (!creds) return null;
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${path}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const creds = serviceCreds();
  if (!creds) throw new Error('digital-human store: supabase service role not configured');
  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(data, null, 2),
  });
  if (!res.ok) {
    throw new Error(`digital-human store: write ${path} failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// ── 任务 ─────────────────────────────────────────────────────────────────────

export type DigitalHumanTaskStatus = 'submitted' | 'processing' | 'succeeded' | 'failed';

export interface DigitalHumanTask {
  id: string;
  userId: string;
  /** 百炼异步任务 id（24h 内可查） */
  providerTaskId: string;
  status: DigitalHumanTaskStatus;
  resolution: '480P' | '720P';
  /** 使用的音色（预设名或复刻 voice_id） */
  voice: string;
  /** 转存到 Supabase 后的 24h 签名 URL */
  videoUrl?: string;
  /** 百炼原始 URL（带 Expires，会过期） */
  providerVideoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const TASK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function taskPath(id: string): string {
  return `${TASK_PREFIX}/${id.replace(/[^\w-]/g, '')}.json`;
}

export async function saveTask(task: DigitalHumanTask): Promise<void> {
  await writeJson(taskPath(task.id), task);
}

export async function getTask(id: string): Promise<DigitalHumanTask | null> {
  const t = await readJson<DigitalHumanTask>(taskPath(id));
  if (!t) return null;
  // 超过 24h 百炼也不再可查，直接判废
  if (Date.now() - new Date(t.createdAt).getTime() > TASK_MAX_AGE_MS && t.status !== 'succeeded') {
    return { ...t, status: 'failed', error: t.error || '任务已超过 24 小时有效期' };
  }
  return t;
}

// ── 复刻音色 ─────────────────────────────────────────────────────────────────

export interface ClonedVoice {
  /** 本平台内的 id（列表用） */
  id: string;
  name: string;
  /** 百炼 voice_id（形如 cosyvoice-v2-xxx） */
  voiceId: string;
  createdAt: string;
}

function voicePath(userId: string): string {
  return `${VOICE_PREFIX}/${userId.replace(/[^\w-]/g, '')}.json`;
}

export async function listVoices(userId: string): Promise<ClonedVoice[]> {
  const data = await readJson<{ voices?: ClonedVoice[] }>(voicePath(userId));
  return Array.isArray(data?.voices) ? data!.voices! : [];
}

export async function addVoice(userId: string, voice: ClonedVoice): Promise<ClonedVoice[]> {
  const voices = await listVoices(userId);
  const next = [voice, ...voices].slice(0, 30);
  await writeJson(voicePath(userId), { voices: next });
  return next;
}