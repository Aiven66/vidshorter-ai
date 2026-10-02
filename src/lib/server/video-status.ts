import { TERMINAL_VIDEO_STATUSES, type BatchClip, type BatchClipStatus } from '@/lib/video-batch';

/**
 * 单视频状态归一化（纯函数，无 node 依赖）。
 *
 * 从 /api/videos/process/status 抽出，让「单个状态查询」与「批量队列聚合」共用同一套判定口径，
 * 避免 isStorageSigned / youtu.be 这两条 subtle 规则在两处漂移（它们曾经出过 bug）。
 */

const TERMINAL = new Set<string>(TERMINAL_VIDEO_STATUSES);

/** 片段 URL → 播放状态。空 URL=failed；存储签名/data URL=completed；YouTube 时间戳页=link_only。 */
export function classifyClipUrl(url: string | null | undefined): BatchClipStatus {
  const value = url || '';
  if (!value) return 'failed';
  // 可内联播放的形态：data / data-url 占位 + 存储签名 https URL。
  const isStorageSigned =
    value.startsWith('data:') || value.startsWith('data-url:') || value.includes('/storage/v1/object/sign/');
  if (isStorageSigned) return 'completed';
  // 只有 YouTube 时间戳**页面** URL（https://youtu.be/<id>?t=<s>s）是真正的 link_only 占位 ——
  // 它是 HTML 页面、不是视频文件。存储签名 URL 也是 http(s) 前缀，所以上一步必须先判掉。
  const isYouTubePage = /^https?:\/\/([a-z0-9]+\.)*(youtu\.be|youtube\.com)\//i.test(value);
  return isYouTubePage ? 'link_only' : 'completed';
}

/** 页面阶段：init → ai_analysis → generating_clip → complete/error */
export function stageFor(status: string, progress: number): string {
  if (TERMINAL.has(status)) return status === 'failed' ? 'error' : 'complete';
  if (progress < 20) return 'init';
  if (progress < 45) return 'ai_analysis';
  return 'generating_clip';
}

export type NormalizedClip = BatchClip;

/** short_videos 行 → 前端可直接渲染的片段载荷 */
export function normalizeClipRows(videoId: string, rows: Array<Record<string, unknown>> | null | undefined): BatchClip[] {
  return (rows ?? []).map((c, i) => {
    const url = typeof c.url === 'string' ? c.url : '';
    const status = classifyClipUrl(url);
    return {
      id: `${videoId}-clip-${i}`,
      title: typeof c.highlight_title === 'string' ? c.highlight_title : '',
      startTime: Number(c.start_time ?? 0),
      endTime: Number(c.end_time ?? 0),
      duration: Number(c.duration ?? 0),
      summary: typeof c.highlight_summary === 'string' ? c.highlight_summary : '',
      thumbnailUrl: typeof c.thumbnail_url === 'string' ? c.thumbnail_url : '',
      videoUrl: url,
      status,
      ...(status === 'link_only' ? { linkOnlyUrl: url } : {}),
    };
  });
}