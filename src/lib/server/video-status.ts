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

/** videos.highlights 里参与回填的字段（宽松类型：来源是 JSON 字符串，字段可能缺失/非法）。 */
export type NormalizeHighlight = {
  title?: unknown;
  engagement_score?: unknown;
  start_time?: unknown;
};

/**
 * short_videos 行 → 前端可直接渲染的片段载荷。
 *
 * P0-3：`short_videos` 没有 score/rank 列，而 `engagement_score` 只存在于
 * `videos.highlights` 的 JSON 里。传入 highlights 后按「起始时间精确匹配优先、
 * 行序兜底」把评分与钩子标题回填到每条 clip —— 两条链路（单视频状态 / 批量聚合）
 * 共用本函数，因此一次修好，且无需任何 DDL。
 *
 * 行序兜底的前提：`runClip` 是按 highlight 索引写入 `short_videos` 的，查询按
 * `created_at asc` 排列即等于插入序。个别片段生成失败时不写行，此时行序会漂移，
 * 故以起始时间匹配为主。任一步失败只丢分数，绝不影响片段本身的可播放性。
 */
export function normalizeClipRows(
  videoId: string,
  rows: Array<Record<string, unknown>> | null | undefined,
  highlights?: NormalizeHighlight[] | null,
): BatchClip[] {
  const scoreOf = (h: NormalizeHighlight | undefined): number | undefined => {
    if (!h) return undefined;
    const n = Number(h.engagement_score);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(1, Math.min(10, Math.round(n)));
  };

  const list = rows ?? [];
  const mapped: BatchClip[] = list.map((c, i) => {
    const url = typeof c.url === 'string' ? c.url : '';
    const status = classifyClipUrl(url);
    const startTime = Number(c.start_time ?? 0);

    // 起始时间精确匹配优先（容忍 1s 浮点/取整误差）；否则按行序取第 i 个高光。
    let highlight: NormalizeHighlight | undefined;
    if (highlights && highlights.length > 0) {
      highlight = highlights.find((h) => Math.abs(Number(h.start_time ?? -9999) - startTime) <= 1);
      if (!highlight && i < highlights.length) highlight = highlights[i];
    }
    const score = scoreOf(highlight);
    const hookTitle = typeof highlight?.title === 'string' && highlight.title ? highlight.title : '';
    const title = typeof c.highlight_title === 'string' && c.highlight_title
      ? c.highlight_title
      : hookTitle;

    return {
      id: `${videoId}-clip-${i}`,
      title,
      startTime,
      endTime: Number(c.end_time ?? 0),
      duration: Number(c.duration ?? 0),
      summary: typeof c.highlight_summary === 'string' ? c.highlight_summary : '',
      thumbnailUrl: typeof c.thumbnail_url === 'string' ? c.thumbnail_url : '',
      videoUrl: url,
      status,
      ...(status === 'link_only' ? { linkOnlyUrl: url } : {}),
      ...(score !== undefined ? { engagementScore: score } : {}),
      ...(hookTitle ? { hookTitle } : {}),
    };
  });

  // P0-3 展示位次：按分数降序给 rank（无分数视为 0）。同分保持原有行序，结果稳定。
  const ranked = [...mapped]
    .map((clip, i) => ({ clip, i, score: clip.engagementScore ?? 0 }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i));
  ranked.forEach((entry, pos) => { entry.clip.rank = pos + 1; });

  return mapped;
}