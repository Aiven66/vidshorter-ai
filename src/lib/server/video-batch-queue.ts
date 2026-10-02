import { SupabaseClient } from '@supabase/supabase-js';
import { enqueueJob, workerWebhookUrl, type VideoJobMessage } from '@/lib/server/video-queue';
import { refundIfCharged } from '@/lib/server/video-refund';
import { BATCH_DEFAULT_CONCURRENCY, BATCH_KICK_MIN_AGE_MS, BATCH_SLOT_STALE_MS } from '@/lib/video-batch';

/**
 * 批量生产队列的"排队泵"。
 *
 * 生产环境**没有 QStash**（Vercel env 实证），所以队列不是靠外部队列服务，而是靠
 * `videos` 表里的状态 + 内部自踢 worker 推进：
 *   - 队列身份 = 该用户 `videos` 表中所有非终态行，按 created_at 升序（**不需要批次表**）
 *   - 并发上限 = 只统计"新鲜的"非终态行；超过 SLOT_STALE_MS 未更新的僵尸**不占槽**
 *     （否则一条被函数超时杀掉的视频会让整个队列停摆到 25 分钟后的 STALE 判定）
 *   - 触发点 = ①批量提交 ②前端轮询批量状态 ③worker 每条视频进终态时（自续航）
 *
 * 重复踢是安全的：`runAnalyze` 用 `.eq('progress', 0)` 原子认领，重复投递只会白跑一次 invocation，
 * 不会重复出片、不会重复扣费。所以本模块只保证"不超发并发"，不追求"绝不重复"。
 */

const TERMINAL_STATUSES = ['completed', 'partial', 'link_only_completed', 'failed'];

/** 队列并发（env BATCH_CONCURRENCY 可覆盖；无 QStash 时单 invocation 要串行跑完 analyze+全部 clip，2 是安全值） */
export function resolveBatchConcurrency(): number {
  const raw = Number(process.env.BATCH_CONCURRENCY);
  if (!Number.isFinite(raw)) return BATCH_DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(5, Math.floor(raw)));
}

export type QueueRow = {
  id: string;
  status: string;
  progress: number;
  updated_at: string | null;
  created_at: string | null;
};

export type PumpPlan = {
  /** 正在占用并发槽的条数（非终态且 updated_at 新鲜） */
  active: number;
  /** 本可启动的条数 */
  slots: number;
  /** 本次应踢的 videoId（按 created_at 升序） */
  start: string[];
  /** 仍未启动的 pending 条数（含尚未"熟"到可踢的，前端"等待中"用它） */
  pendingRemaining: number;
  /** 非终态但久未更新（疑似被函数超时杀掉），**不占槽** —— 仅用于明文提示 */
  stalled: string[];
};

/**
 * 纯决策函数（无 IO，可单测）：给定队列行 → 该踢谁。
 *
 * 只启动满足全部条件的行：
 *   status='pending' 且 progress=0 且 updated_at IS NULL（从未被认领过）
 *   且 created_at 距 now 至少 minAgeMs（避免与提交时的踢重复）
 */
export function planPump(
  rows: QueueRow[],
  opts: { concurrency: number; minAgeMs: number; now?: number; slotStaleMs?: number },
): PumpPlan {
  const now = opts.now ?? Date.now();
  const slotStaleMs = opts.slotStaleMs ?? BATCH_SLOT_STALE_MS;

  let active = 0;
  const stalled: string[] = [];
  const candidates: QueueRow[] = [];
  /** 从未被认领过的 pending 条数（含尚未"熟"到可踢的），用于面板上的"等待中"计数 */
  let pendingCount = 0;

  for (const row of rows) {
    const status = row.status || '';
    if (TERMINAL_STATUSES.includes(status)) continue;

    const updatedMs = row.updated_at ? Date.parse(row.updated_at) : NaN;
    if (Number.isFinite(updatedMs)) {
      if (now - updatedMs <= slotStaleMs) {
        active += 1;
      } else {
        stalled.push(row.id); // 僵尸：不占槽，但要让用户看得见
      }
    }

    if (status === 'pending' && Number(row.progress ?? 0) === 0 && !row.updated_at) {
      pendingCount += 1;
      const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
      if (Number.isFinite(createdMs) && now - createdMs >= opts.minAgeMs) {
        candidates.push(row);
      }
    }
  }

  candidates.sort((a, b) => Date.parse(a.created_at || '') - Date.parse(b.created_at || ''));

  const slots = Math.max(0, opts.concurrency - active);
  const start = candidates.slice(0, slots).map((r) => r.id);

  return {
    active,
    slots,
    start,
    pendingRemaining: Math.max(0, pendingCount - start.length),
    stalled,
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** 僵尸行落为 failed 时写给用户的失败原因（明文，绝不静默） */
const STALLED_FAILURE_MESSAGE =
  'Processing timed out: no progress for over 8 minutes, so the run was stopped by the platform time limit. Please resubmit this video.';

/**
 * 僵尸对账：把「非终态 且 超过 SLOT_STALE_MS 未更新」的行落为 failed。
 *
 * 为什么必须做：无队列模式下一条 invocation 要串行跑完 analyze + 全部 clip，超过 `maxDuration=300s`
 * 会被 Vercel 杀掉，视频就永远停在 `processing`。单视频 status 路由的 25 分钟 STALE 判定只在
 * 用户去轮询**那一条**视频时才触发；批量队列必须自己兜底，否则面板会永久显示一条"疑似卡住"，
 * 而前端的 stalledHint 文案又承诺"服务端会把它标记为失败" —— 不实现就是未兑现的用户可见承诺。
 *
 * 竞态保护（三处可能同时判定：这里 / 单视频 status / 另一个 poller）：
 * UPDATE 同时带 `status.not.in.(终态)` 与 `updated_at < cutoff`，谁抢到谁负责退费；
 * 退费按 related_id 幂等，重复调用是 no-op。cutoff 用 SLOT_STALE_MS(8min) > maxDuration(300s)，
 * 因此绝不会误杀一条仍在跑的视频。
 *
 * @returns 仍未落为 failed 的 id（被别的进程抢先更新/本轮 UPDATE 失败），供前端继续明文提示。
 */
async function reconcileStalled(
  client: SupabaseClient,
  userId: string,
  stalledIds: string[],
  cutoffIso: string,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from('videos')
      .update({
        status: 'failed',
        progress: 100,
        error_message: STALLED_FAILURE_MESSAGE,
        updated_at: new Date().toISOString(),
      })
      .in('id', stalledIds)
      .eq('user_id', userId)
      .or('status.not.in.(completed,partial,link_only_completed,failed)')
      .lt('updated_at', cutoffIso)
      .select('id');
    if (error) {
      console.warn('[video-batch] stalled reconcile failed:', error.message);
      return stalledIds;
    }

    const claimed = (data ?? []).map((r) => String((r as { id: string }).id));
    if (claimed.length > 0) {
      console.log('[video-batch] stalled → failed:', claimed.join(','));
      // 抢到终态转换的一方负责退费：用户不应为一条被平台超时杀掉的视频付费。
      // refundIfCharged 幂等且只在真的扣过费时才退款，与单视频 status 路由口径一致。
      for (const videoId of claimed) {
        try {
          await refundIfCharged(client, userId, videoId);
        } catch (e) {
          console.warn('[video-batch] refund failed:', e instanceof Error ? e.message.slice(0, 120) : e);
        }
      }
    }

    const claimedSet = new Set(claimed);
    return stalledIds.filter((id) => !claimedSet.has(id));
  } catch (e) {
    console.warn('[video-batch] stalled reconcile error:', e instanceof Error ? e.message.slice(0, 200) : e);
    return stalledIds;
  }
}

/** 无队列模式：内部 HTTP 自踢（Vercel 会在响应发出后冻结实例，所以踢完要留一点时间让出站请求冲刷完） */
function selfKick(message: VideoJobMessage): boolean {
  const url = workerWebhookUrl();
  if (!url.startsWith('http')) return false;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  }).catch((e) => console.warn('[video-batch] worker kick failed:', e instanceof Error ? e.message : e));
  return true;
}

export type PumpResult = {
  concurrency: number;
  active: number;
  started: string[];
  pending: number;
  stalled: string[];
};

/**
 * 推进该用户的队列：把并发槽填满。
 * 绝不抛错（排队失败不应污染调用方：出片结果、状态查询都必须照常返回）。
 */
export async function pumpUserQueue(
  client: SupabaseClient,
  userId: string,
  opts?: { minAgeMs?: number; concurrency?: number },
): Promise<PumpResult> {
  const concurrency = opts?.concurrency ?? resolveBatchConcurrency();
  // 默认只踢"创建满 20s 仍未启动"的条目，避免轮询期间对同一条 pending 反复踢
  //（重复踢虽幂等，但会白跑 invocation）。提交时应显式传 minAgeMs: 0 立刻启动。
  const minAgeMs = opts?.minAgeMs ?? BATCH_KICK_MIN_AGE_MS;
  const empty: PumpResult = { concurrency, active: 0, started: [], pending: 0, stalled: [] };

  try {
    const { data, error } = await client
      .from('videos')
      .select('id,status,progress,updated_at,created_at,original_url,source_type')
      .eq('user_id', userId)
      .or(`status.not.in.(${TERMINAL_STATUSES.join(',')})`)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) {
      console.warn('[video-batch] pump query failed:', error.message);
      return empty;
    }

    const rows = (data ?? []) as unknown as Array<QueueRow & { original_url?: string; source_type?: string }>;
    const now = Date.now();
    const plan = planPump(rows, { concurrency, minAgeMs, now });

    // 僵尸对账必须发生在早返回之前：队列一旦没有可踢的条目（start 为空）就提前返回，
    // 那时若不处理，卡死行永远不会被落为 failed。
    let stalled = plan.stalled;
    if (stalled.length > 0) {
      const cutoffIso = new Date(now - BATCH_SLOT_STALE_MS).toISOString();
      stalled = await reconcileStalled(client, userId, stalled, cutoffIso);
    }

    if (plan.start.length === 0) {
      return { concurrency, active: plan.active, started: [], pending: plan.pendingRemaining, stalled };
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const started: string[] = [];
    let usedSelfKick = false;

    for (const videoId of plan.start) {
      const row = byId.get(videoId);
      if (!row?.original_url) continue;
      const message: VideoJobMessage = {
        step: 'analyze',
        videoId,
        userId,
        videoUrl: row.original_url,
        sourceType: row.source_type || 'url',
      };
      // 有 QStash 走真队列；否则内部自踢（生产现状）。
      const queued = await enqueueJob(message);
      if (queued) {
        started.push(videoId);
      } else if (selfKick(message)) {
        started.push(videoId);
        usedSelfKick = true;
      }
    }

    // 让出站请求冲刷完（Vercel 冻结实例前必须留时间）。多条也只等一次。
    if (usedSelfKick) await sleep(1500);

    return {
      concurrency,
      active: plan.active,
      started,
      pending: Math.max(0, plan.pendingRemaining),
      stalled,
    };
  } catch (e) {
    console.warn('[video-batch] pump failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return empty;
  }
}

export type CreateBatchResult = {
  videoIds: string[];
  failed: Array<{ url: string; error: string }>;
};

/**
 * 为一批 URL 建 `videos` 行（status='pending'、progress=0）。
 * 逐条插入以**保持输入顺序**并拿到各自的 id；单条失败不影响其余条目。
 * 不写 desired_clip_count —— 片段数交给管线的 `recommendClipCount(duration)` 按时长自动推荐。
 */
export async function createBatchJobs(
  client: SupabaseClient,
  userId: string,
  urls: string[],
  opts?: { sourceType?: string },
): Promise<CreateBatchResult> {
  const videoIds: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  for (const url of urls) {
    const { data, error } = await client
      .from('videos')
      .insert({
        user_id: userId,
        original_url: url,
        source_type: opts?.sourceType || 'url',
        status: 'pending',
        progress: 0,
        error_message: null,
      })
      .select('id')
      .single();
    if (error || !data?.id) {
      console.error('[video-batch] insert failed:', error?.message);
      failed.push({ url, error: error?.message || 'unknown db error' });
      continue;
    }
    videoIds.push(String(data.id));
  }

  return { videoIds, failed };
}