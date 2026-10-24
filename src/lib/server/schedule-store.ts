/**
 * 发布工作流 —— 排期记录的服务端持久化（跨设备）。
 *
 * 与 publish-store 同款方案：项目无 DDL 权限，复用 Supabase 私有桶
 * `clipop-config` 下的 per-user 对象 `schedule-<userId>.json`，仅 service role 可读写。
 *
 * 额外提供 `listScheduleUserIds()` 供提醒 cron 枚举（storage list）。
 */

import {
  isSchedulePlatform,
  type ScheduledPost,
  type SchedulePlatform,
} from '@/lib/publish-schedule';

const BUCKET = 'clipop-config';
const MAX_POSTS = 200;

interface ServiceCreds {
  url: string;
  key: string;
}

function serviceCreds(): ServiceCreds | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

export function isScheduleStoreConfigured(): boolean {
  return serviceCreds() !== null;
}

function objectKey(userId: string): string {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `schedule-${safe}.json`;
}

function userIdFromObject(name: string): string | null {
  const m = /^schedule-([a-zA-Z0-9_-]+)\.json$/.exec(name);
  return m ? m[1] : null;
}

function isoOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** 把任意输入净化为一条合法排期；非法条目返回 null。 */
export function sanitizeScheduledPost(raw: unknown): ScheduledPost | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const id = cleanText(o.id, 64);
  if (!id) return null;

  const platform: SchedulePlatform = isSchedulePlatform(o.platform) ? o.platform : 'tiktok';
  const nowIso = new Date().toISOString();

  const hashtags = Array.isArray(o.hashtags)
    ? o.hashtags
        .map((h) => (typeof h === 'string' ? h.trim() : ''))
        .filter((h) => h.length > 0)
        .slice(0, 10)
        .map((h) => (h.startsWith('#') ? h.slice(0, 41) : `#${h}`.slice(0, 41)))
    : [];

  const statusRaw = typeof o.status === 'string' ? o.status : 'scheduled';
  const status: ScheduledPost['status'] =
    statusRaw === 'published' || statusRaw === 'canceled' ? statusRaw : 'scheduled';

  const post: ScheduledPost = {
    id,
    platform,
    scheduledAt: isoOr(o.scheduledAt, nowIso),
    title: cleanText(o.title, 200),
    caption: cleanText(o.caption, 5000),
    hashtags,
    status,
    createdAt: isoOr(o.createdAt, nowIso),
  };

  const clipId = cleanText(o.clipId, 128);
  if (clipId) post.clipId = clipId;
  if (typeof o.remindedAt === 'string') post.remindedAt = isoOr(o.remindedAt, nowIso);
  if (typeof o.postUrl === 'string' && o.postUrl.trim()) {
    post.postUrl = o.postUrl.trim().slice(0, 2048);
  }
  return post;
}

export async function readSchedule(userId: string): Promise<ScheduledPost[]> {
  const creds = serviceCreds();
  if (!creds) return [];
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${objectKey(userId)}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const posts = (parsed as { posts?: unknown }).posts;
    if (!Array.isArray(posts)) return [];
    return posts
      .map(sanitizeScheduledPost)
      .filter((p): p is ScheduledPost => p !== null)
      .slice(0, MAX_POSTS);
  } catch {
    return [];
  }
}

async function writeSchedule(userId: string, posts: ScheduledPost[]): Promise<void> {
  const creds = serviceCreds();
  if (!creds) throw new Error('schedule-store: supabase service role not configured');
  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${objectKey(userId)}`, {
    method: 'POST',
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify({ posts: posts.slice(0, MAX_POSTS) }, null, 2),
  });
  if (!res.ok) {
    throw new Error(`schedule-store: write failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/** 新增或按 id 覆盖一条排期，返回最新全集。 */
export async function upsertScheduledPost(
  userId: string,
  post: ScheduledPost,
): Promise<ScheduledPost[]> {
  const posts = await readSchedule(userId);
  const idx = posts.findIndex((p) => p.id === post.id);
  if (idx >= 0) posts[idx] = post;
  else posts.unshift(post);
  const next = posts.slice(0, MAX_POSTS);
  await writeSchedule(userId, next);
  return next;
}

export async function deleteScheduledPost(userId: string, id: string): Promise<ScheduledPost[]> {
  const posts = await readSchedule(userId);
  const next = posts.filter((p) => p.id !== id);
  if (next.length !== posts.length) await writeSchedule(userId, next);
  return next;
}

/** 提醒 cron 用：列出所有存有排期的用户 id。未配置 / 失败 → 空数组。 */
export async function listScheduleUserIds(): Promise<string[]> {
  const creds = serviceCreds();
  if (!creds) return [];
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, search: 'schedule-' }),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const list = (await res.json()) as unknown;
    if (!Array.isArray(list)) return [];
    const ids: string[] = [];
    for (const item of list) {
      const name = (item as { name?: unknown }).name;
      if (typeof name !== 'string') continue;
      const uid = userIdFromObject(name);
      if (uid) ids.push(uid);
    }
    return ids;
  } catch {
    return [];
  }
}

/** 提醒 cron 用：把某用户的排期整份写回（批量标记 remindedAt）。 */
export async function writeScheduleForUser(userId: string, posts: ScheduledPost[]): Promise<void> {
  await writeSchedule(userId, posts);
}
