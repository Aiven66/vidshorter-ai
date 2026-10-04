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
