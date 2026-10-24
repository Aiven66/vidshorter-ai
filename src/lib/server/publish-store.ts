/**
 * 发布运营台 —— 发布记录的服务端持久化（跨设备）。
 *
 * 项目无 DDL 权限（不能建表），因此复用 model-config / nav-config 同款方案：
 * Supabase 私有桶 `clipop-config` 下的 per-user 对象 `publish-<userId>.json`，
 * 仅 service role 可读写，前端拿不到直连权限。
 *
 * - 未配置 service role（本地/离线）→ 读取返回空且不抛错，由前端回落 localStorage。
 * - 所有写入都先经过 sanitize，杜绝越权/脏数据落盘。
 */

import type { PublishInfo, PublishPlatform } from '@/lib/publish-tracker';

const BUCKET = 'clipop-config';
const PLATFORMS: PublishPlatform[] = ['tiktok', 'reels', 'shorts', 'other'];

export type PublishRecordMap = Record<string, PublishInfo>;

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

export function isPublishStoreConfigured(): boolean {
  return serviceCreds() !== null;
}

/** 对象 key：userId 只可能是 Supabase auth uid，这里再净化一次杜绝路径穿越。 */
function objectKey(userId: string): string {
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `publish-${safe}.json`;
}

function sanitizeMetric(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/**
 * 把任意输入净化为合法 PublishInfo（非法 platform → 'other'，负数/非数字指标丢弃）。
 * 返回 null 表示整体不可用（非对象）。
 */
export function sanitizePublishInfo(raw: unknown): PublishInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  const platform: PublishPlatform =
    typeof o.platform === 'string' && (PLATFORMS as string[]).includes(o.platform)
      ? (o.platform as PublishPlatform)
      : 'other';

  const info: PublishInfo = {
    platform,
    postedAt: typeof o.postedAt === 'string' && o.postedAt ? o.postedAt : nowIso,
    metricsUpdatedAt:
      typeof o.metricsUpdatedAt === 'string' && o.metricsUpdatedAt ? o.metricsUpdatedAt : nowIso,
  };
  if (typeof o.postUrl === 'string' && o.postUrl.trim()) {
    info.postUrl = o.postUrl.trim().slice(0, 2048);
  }
  const views = sanitizeMetric(o.views);
  if (views !== undefined) info.views = views;
  const likes = sanitizeMetric(o.likes);
  if (likes !== undefined) info.likes = likes;
  const comments = sanitizeMetric(o.comments);
  if (comments !== undefined) info.comments = comments;
  const followers = sanitizeMetric(o.followers);
  if (followers !== undefined) info.followers = followers;
  return info;
}

/** 读取某用户的全部发布记录。未配置 / 无对象 / 失败 → 空对象。 */
export async function readPublishRecords(userId: string): Promise<PublishRecordMap> {
  const creds = serviceCreds();
  if (!creds) return {};
  try {
    const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${objectKey(userId)}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const parsed = await res.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PublishRecordMap)
      : {};
  } catch {
    return {};
  }
}

async function writePublishRecords(userId: string, map: PublishRecordMap): Promise<void> {
  const creds = serviceCreds();
  if (!creds) throw new Error('publish-store: supabase service role not configured');
  const res = await fetch(`${creds.url}/storage/v1/object/${BUCKET}/${objectKey(userId)}`, {
    method: 'POST',
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: JSON.stringify(map, null, 2),
  });
  if (!res.ok) {
    throw new Error(`publish-store: write failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/** 新增/更新一条发布记录，返回写入后的完整 map。 */
export async function upsertPublishRecord(
  userId: string,
  clipId: string,
  info: PublishInfo,
): Promise<PublishRecordMap> {
  const map = await readPublishRecords(userId);
  map[clipId] = info;
  await writePublishRecords(userId, map);
  return map;
}

/** 删除一条发布记录（不存在则原样返回），返回完整 map。 */
export async function deletePublishRecord(
  userId: string,
  clipId: string,
): Promise<PublishRecordMap> {
  const map = await readPublishRecords(userId);
  if (map[clipId]) {
    delete map[clipId];
    await writePublishRecords(userId, map);
  }
  return map;
}

/**
 * 一次性迁移：把前端本地记录并入服务端。
 * 同 clipId 以「metricsUpdatedAt/postedAt 更新的一方」为准，避免旧本地数据覆盖新服务端数据。
 */
export async function mergePublishRecords(
  userId: string,
  incoming: PublishRecordMap,
): Promise<PublishRecordMap> {
  const map = await readPublishRecords(userId);
  let changed = false;
  for (const [clipId, info] of Object.entries(incoming || {})) {
    if (!clipId || !info) continue;
    const existing = map[clipId];
    if (!existing) {
      map[clipId] = info;
      changed = true;
      continue;
    }
    const a = existing.metricsUpdatedAt || existing.postedAt || '';
    const b = info.metricsUpdatedAt || info.postedAt || '';
    if (b > a) {
      map[clipId] = info;
      changed = true;
    }
  }
  if (changed) await writePublishRecords(userId, map);
  return map;
}