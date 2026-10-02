/**
 * 批量生产队列共享数据模块（前后端共用，**无 node 依赖**）
 *
 * 只放"契约"：类型 + 规模常量 + 白名单归一化 + 聚合统计 + 错误码。
 * 任何服务端实现（Supabase / fetch / 自踢 worker）都不得塞进这里，
 * 否则前端 import 会污染客户端 bundle。
 */

/** videos.status 的终态集合（全项目唯一来源，避免两处漂移） */
export const TERMINAL_VIDEO_STATUSES = ['completed', 'partial', 'link_only_completed', 'failed'] as const;

export type TerminalVideoStatus = (typeof TERMINAL_VIDEO_STATUSES)[number];

export function isTerminalVideoStatus(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_VIDEO_STATUSES as readonly string[]).includes(status);
}

/** 单批硬上限（超过一律拒绝，**不静默截断**） */
export const BATCH_MAX_ITEMS = 10;
/** 默认并发（env BATCH_CONCURRENCY 可覆盖，见 server 侧 resolveBatchConcurrency） */
export const BATCH_DEFAULT_CONCURRENCY = 2;
/** 单次 batch/status 请求最多接受的 videoId 数量 */
export const BATCH_MAX_STATUS_IDS = BATCH_MAX_ITEMS * 3;
/** 超过该时长未更新的非终态条目视为"僵尸"，**不再占用并发槽**（终态判定仍归 /api/videos/process/status） */
export const BATCH_SLOT_STALE_MS = 8 * 60 * 1000;
/** 提交后多久内不再重复踢 worker（避免与提交时的踢重复；重复踢本身幂等，这里只为省一次 invocation） */
export const BATCH_KICK_MIN_AGE_MS = 20_000;
/** batch/status 未指定 ids 时的回溯窗口与条数 */
export const BATCH_STATUS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BATCH_STATUS_WINDOW_LIMIT = 30;

/** 数据库 videos.original_url 列宽（varchar(1000)）——超出按非法丢弃，否则插入会炸 */
const MAX_URL_CHARS = 1000;

/** 错误码（服务端返回体 `{ error: <code> }`，前端按码给引导） */
export const BATCH_ERROR_CODES = {
  /** 未登录 / token 无效 */
  unauthorized: 'batch_unauthorized',
  /** 非付费用户（free） */
  requiresPaid: 'batch_requires_paid',
  /** 请求体非法（空 / 全非法 / 超单批上限 / 非法 JSON） */
  invalidRequest: 'batch_invalid_request',
  /** 余额不足一次出片 */
  insufficientCredits: 'batch_insufficient_credits',
  /** 请求数量超过当前余额可支付的数量 */
  quotaExceeded: 'batch_quota_exceeded',
  /** 建行/排队失败 */
  failed: 'batch_failed',
} as const;

export type BatchErrorCode = (typeof BATCH_ERROR_CODES)[keyof typeof BATCH_ERROR_CODES];

/** 片段播放状态：completed=可直接播放；link_only=只有 YouTube 时间戳页（下载须走服务端裁剪）；failed=无产物 */
export type BatchClipStatus = 'completed' | 'link_only' | 'failed';

/** 片段载荷（单视频状态查询 / 批量队列共用同一形状，判定口径见 server/video-status.ts） */
export type BatchClip = {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  summary: string;
  thumbnailUrl: string;
  videoUrl: string;
  status: BatchClipStatus;
  /** link_only 时暴露时间戳页 URL：前端 download 必须走服务端 ffmpeg 裁剪，否则会把 HTML 页面存成 .mp4 */
  linkOnlyUrl?: string;
};

/** 队列条目（服务端返回、前端渲染的载荷形状） */
export type BatchItem = {
  videoId: string;
  url: string;
  title: string;
  /** 原始 videos.status */
  status: string;
  /** init | ai_analysis | generating_clip | complete | error */
  stage: string;
  progress: number;
  clipsGenerated: number;
  playableClips: number;
  clips: BatchClip[];
  error: string | null;
  /** 非终态且长时间未更新 → 疑似被函数超时杀掉，未占并发槽 */
  stalled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BatchSummary = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  partial: number;
  linkOnly: number;
  failed: number;
  /** 已进终态的条数 */
  finished: number;
  /** 全部进终态 */
  done: boolean;
  /** finished / total，四舍五入到整数百分比 */
  percent: number;
  clipsGenerated: number;
};

export type BatchUrlParseResult = {
  ok: boolean;
  /** 失败时为错误码 */
  code?: BatchErrorCode;
  /** 通过校验、保持输入顺序、已去重的 URL */
  urls: string[];
  /** 被丢弃的非 http(s) / 超长条目数（前端明文提示） */
  invalidCount: number;
  /** 因重复被丢弃的条目数（前端明文提示） */
  duplicateCount: number;
};

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 解析用户粘贴的多视频输入：支持换行 / 逗号 / 中文逗号 / 顿号 / 分号 / 空白分隔。
 * 去重（保留首次出现顺序）→ 丢弃非 http(s) 与超长条目（计数回报）→ 校验上限。
 *
 * 语义保证：
 *  - **绝不静默截断**：超过 BATCH_MAX_ITEMS 直接返回 `batch_invalid_request`，由用户改数量；
 *  - **保持输入顺序**：队列按提交顺序推进，用户可预期。
 */
export function normalizeBatchUrls(raw: unknown): BatchUrlParseResult {
  const pieces: string[] = [];
  if (typeof raw === 'string') {
    pieces.push(...raw.split(/[\s,，、;；]+/));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') pieces.push(...item.split(/[\s,，、;；]+/));
    }
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const piece of pieces) {
    const candidate = piece.trim();
    if (!candidate) continue;
    if (!isHttpUrl(candidate) || candidate.length > MAX_URL_CHARS) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(candidate)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(candidate);
    urls.push(candidate);
  }

  const base = { urls, invalidCount, duplicateCount };
  if (urls.length === 0) {
    return { ok: false, code: BATCH_ERROR_CODES.invalidRequest, ...base };
  }
  if (urls.length > BATCH_MAX_ITEMS) {
    return { ok: false, code: BATCH_ERROR_CODES.invalidRequest, ...base };
  }
  return { ok: true, ...base };
}

/** 聚合统计（纯函数，前端头部面板与服务端返回共用同一份口径） */
export function summarizeBatchItems(items: Array<Pick<BatchItem, 'status' | 'clipsGenerated'>>): BatchSummary {
  const summary: BatchSummary = {
    total: items.length,
    pending: 0,
    processing: 0,
    completed: 0,
    partial: 0,
    linkOnly: 0,
    failed: 0,
    finished: 0,
    done: false,
    percent: 0,
    clipsGenerated: 0,
  };

  for (const item of items) {
    const clips = Number.isFinite(item.clipsGenerated) ? Math.max(0, item.clipsGenerated) : 0;
    summary.clipsGenerated += clips;
    switch (item.status) {
      case 'completed':
        summary.completed += 1;
        summary.finished += 1;
        break;
      case 'partial':
        summary.partial += 1;
        summary.finished += 1;
        break;
      case 'link_only_completed':
        summary.linkOnly += 1;
        summary.finished += 1;
        break;
      case 'failed':
        summary.failed += 1;
        summary.finished += 1;
        break;
      case 'pending':
        summary.pending += 1;
        break;
      default:
        // 'processing' 及任何未知非终态
        summary.processing += 1;
        break;
    }
  }

  summary.done = summary.total > 0 && summary.finished === summary.total;
  summary.percent = summary.total > 0 ? Math.round((summary.finished / summary.total) * 100) : 0;
  return summary;
}