// P1-2 发布标记 + 手动回填（作品库回访闭环）
//
// 项目无 DDL 权限 → 发布状态只能存客户端。这里用独立的 localStorage 存储
// （按 userId 隔离，key 为 clipop_publish_<userId>），以 clip.id 为索引，
// 这样无论 clip 来自 localStorage 历史还是 Supabase 查询都能统一挂载。
// 所有字段均可选，向后兼容：老记录没有 publish 字段正常渲染。

export type PublishPlatform = 'tiktok' | 'reels' | 'shorts' | 'other';

export interface PublishInfo {
  platform: PublishPlatform;
  postUrl?: string;
  postedAt: string; // ISO
  views?: number;
  likes?: number;
  comments?: number;
  metricsUpdatedAt?: string; // ISO
}

export interface PublishSummary {
  published: number;
  views: number;
  likes: number;
  comments: number;
}

export const PUBLISH_PLATFORMS: PublishPlatform[] = ['tiktok', 'reels', 'shorts', 'other'];

function storeKey(userId: string): string {
  return `clipop_publish_${userId || 'anonymous'}`;
}

export function getPublishMap(userId: string): Record<string, PublishInfo> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, PublishInfo>) : {};
  } catch {
    return {};
  }
}

export function getPublishInfo(userId: string, clipId: string): PublishInfo | undefined {
  return getPublishMap(userId)[clipId];
}

function persist(userId: string, map: Record<string, PublishInfo>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(map));
  } catch {
    // 配额或隐私模式：静默忽略，标记属尽力而为
  }
}

export function setPublishInfo(
  userId: string,
  clipId: string,
  info: PublishInfo,
): Record<string, PublishInfo> {
  const map = getPublishMap(userId);
  map[clipId] = info;
  persist(userId, map);
  return map;
}

export function removePublishInfo(
  userId: string,
  clipId: string,
): Record<string, PublishInfo> {
  const map = getPublishMap(userId);
  delete map[clipId];
  persist(userId, map);
  return map;
}

export function summarizePublish(userId: string, clipIds?: string[]): PublishSummary {
  const map = getPublishMap(userId);
  const ids = clipIds ?? Object.keys(map);
  const summary: PublishSummary = { published: 0, views: 0, likes: 0, comments: 0 };
  for (const id of ids) {
    const info = map[id];
    if (!info) continue;
    summary.published += 1;
    summary.views += Number(info.views) || 0;
    summary.likes += Number(info.likes) || 0;
    summary.comments += Number(info.comments) || 0;
  }
  return summary;
}

// 把表单里的字符串安全转成非负整数（空串 → undefined）
export function parseMetric(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/** 用服务端返回的整份 map 覆盖本地缓存（跨设备：以服务端为准）。 */
export function cachePublishMap(userId: string, map: Record<string, PublishInfo>): void {
  persist(userId, map || {});
}

// ────────────────────────────────────────────────────────────
// 服务端同步（跨设备）：/api/publish
// 同源请求自动携带 clipop_access_token cookie，无需手工加 Authorization 头。
// 任何失败都返回 null / 静默忽略 —— 服务端不可用时本地 localStorage 仍是可用兜底。
// ────────────────────────────────────────────────────────────

function pickRecords(data: unknown): Record<string, PublishInfo> | null {
  if (!data || typeof data !== 'object') return null;
  const records = (data as { records?: unknown }).records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return null;
  return records as Record<string, PublishInfo>;
}

async function postPublish(body: object): Promise<Record<string, PublishInfo> | null> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return pickRecords(await res.json());
  } catch {
    return null;
  }
}

/** 拉取服务端发布记录；服务端不可用/未登录 → null（调用方应保留本地）。 */
export async function fetchServerPublishMap(): Promise<Record<string, PublishInfo> | null> {
  try {
    const res = await fetch('/api/publish', { method: 'GET', credentials: 'include' });
    if (!res.ok) return null;
    return pickRecords(await res.json());
  } catch {
    return null;
  }
}

/** 新增/更新一条记录到服务端；返回写入后的完整 map 或 null。 */
export function saveServerPublish(
  clipId: string,
  info: PublishInfo,
): Promise<Record<string, PublishInfo> | null> {
  return postPublish({ action: 'upsert', clipId, info });
}

/** 从服务端删除一条记录；返回删除后的完整 map 或 null。 */
export function deleteServerPublish(
  clipId: string,
): Promise<Record<string, PublishInfo> | null> {
  return postPublish({ action: 'delete', clipId });
}

/** 把本地记录一次性并入服务端（首次上云迁移）。 */
export function migrateLocalPublish(
  records: Record<string, PublishInfo>,
): Promise<Record<string, PublishInfo> | null> {
  return postPublish({ action: 'migrate', records });
}

// ────────────────────────────────────────────────────────────
// 迁移标记：本地记录只需上云一次。之后服务端即为唯一事实源，
// 否则「在 A 设备删除、B 设备本地仍留有旧记录」会被反复并回服务端（复活）。
// ────────────────────────────────────────────────────────────

function migratedKey(userId: string): string {
  return `clipop_publish_migrated_${userId || 'anonymous'}`;
}

export function hasMigrated(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(migratedKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function markMigrated(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(migratedKey(userId), '1');
  } catch {
    // 隐私模式/配额：忽略
  }
}
