/**
 * 发布工作流（v6 路径 B）——排期与交接的共享类型 / 纯函数。
 *
 * 设计前提：仓库没有 YouTube / TikTok / Meta / LinkedIn 的开发者密钥，
 * 因此首版走「半自动」：AI 生成各平台差异化文案 → 排期 → 到点提醒并深链
 * 跳到平台上传页 → 发完回填链接与数据。平台直发的接入点保留在
 * `PUBLISH_TARGETS[].composerUrl`，未来拿到密钥后可在此扩展。
 *
 * 本文件零依赖、可在客户端与服务端共用。
 */

export type SchedulePlatform = 'youtube' | 'tiktok' | 'instagram' | 'linkedin';

export interface ScheduledPost {
  id: string;
  /** 关联的作品片段（可为空：手动排期） */
  clipId?: string;
  platform: SchedulePlatform;
  /** ISO 时间；到点后前端/提醒任务标为 due */
  scheduledAt: string;
  title: string;
  caption: string;
  hashtags: string[];
  status: 'scheduled' | 'published' | 'canceled';
  createdAt: string;
  /** 最近一次提醒发送时间（cron 去重） */
  remindedAt?: string;
  /** 发布完成后的链接 */
  postUrl?: string;
}

export interface PublishTarget {
  id: SchedulePlatform;
  label: string;
  /** 平台上传页深链（半自动交接） */
  composerUrl: string;
  /** 标题建议长度上限 */
  titleMax: number;
  /** 正文建议长度上限 */
  captionMax: number;
  /** 话题标签建议数量 */
  hashtagCount: number;
}

export const PUBLISH_TARGETS: Record<SchedulePlatform, PublishTarget> = {
  youtube: {
    id: 'youtube',
    label: 'YouTube Shorts',
    composerUrl: 'https://studio.youtube.com/channel/UC/videos/upload',
    titleMax: 100,
    captionMax: 1000,
    hashtagCount: 3,
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    composerUrl: 'https://www.tiktok.com/tiktokstudio/upload',
    titleMax: 100,
    captionMax: 2200,
    hashtagCount: 5,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram Reels',
    composerUrl: 'https://www.instagram.com/',
    titleMax: 100,
    captionMax: 2200,
    hashtagCount: 5,
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    composerUrl: 'https://www.linkedin.com/feed/?shareActive=true',
    titleMax: 120,
    captionMax: 3000,
    hashtagCount: 3,
  },
};

export const SCHEDULE_PLATFORMS: SchedulePlatform[] = ['youtube', 'tiktok', 'instagram', 'linkedin'];

export function isSchedulePlatform(value: unknown): value is SchedulePlatform {
  return typeof value === 'string' && (SCHEDULE_PLATFORMS as string[]).includes(value);
}

/** 排期状态：到点未发 → due（仅用于展示，不改写存储值）。 */
export function isDue(post: ScheduledPost, now = Date.now()): boolean {
  if (post.status !== 'scheduled') return false;
  const t = new Date(post.scheduledAt).getTime();
  return Number.isFinite(t) && t <= now;
}

/** 按时间升序排列，已发布/已取消沉底。 */
export function sortSchedule(posts: ScheduledPost[]): ScheduledPost[] {
  return [...posts].sort((a, b) => {
    const ta = new Date(a.scheduledAt).getTime();
    const tb = new Date(b.scheduledAt).getTime();
    return ta - tb;
  });
}
