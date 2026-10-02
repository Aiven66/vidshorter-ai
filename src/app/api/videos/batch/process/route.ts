import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BATCH_ERROR_CODES, normalizeBatchUrls } from '@/lib/video-batch';
import { bearerToken, verifyPaidEligibility } from '@/lib/server/plan-gate';
import { createBatchJobs, pumpUserQueue } from '@/lib/server/video-batch-queue';
import { CREDIT_COST } from '@/lib/server/video-refund';
import { ensureCreditsAndCheck, isAdminUser } from '@/lib/server/video-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 只建行 + 踢 worker（不内联跑视频），60s 足够
export const maxDuration = 60;

/**
 * 批量生产队列 —— 提交入口。
 *
 * 一次贴 N 个链接 → 建 N 行 `videos(status='pending')` → 排队泵把并发槽填满 → 返回 videoIds。
 * 进度由 /api/videos/batch/status 轮询（聚合 + 补位）。**不需要批次表**：
 * 队列身份 = 该用户 videos 表中的非终态行（见 video-batch-queue.ts）。
 *
 * 门控：Starter+ 或 admin（有 token 一律服务端裁定）。free → 403 batch_requires_paid。
 * 额度：**提交前只读余额做预检**，不足则明文拒绝（返回 affordable），绝不静默截断数量；
 *       真实扣费仍发生在每条视频出片终态（video-job 的 deductCreditsOnce），此路由不预扣。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: BATCH_ERROR_CODES.invalidRequest }, { status: 400 });
  }

  // 1. 付费门控（有 token 一律服务端裁定）
  const elig = await verifyPaidEligibility(request, typeof body.plan === 'string' ? body.plan : '');
  if (!elig.ok) {
    return NextResponse.json({ error: elig.reason || BATCH_ERROR_CODES.requiresPaid }, { status: 403 });
  }

  // 2. 解析真实用户：有 token 用服务端解析结果；无 token 仅接受 UUID userId（桌面/本地 cookie 流程）
  let userId = elig.userId || '';
  if (!userId) {
    if (bearerToken(request)) {
      return NextResponse.json({ error: BATCH_ERROR_CODES.unauthorized }, { status: 401 });
    }
    const claimed = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!UUID_RE.test(claimed)) {
      return NextResponse.json({ error: BATCH_ERROR_CODES.unauthorized }, { status: 401 });
    }
    userId = claimed;
  }

  // 3. URL 白名单归一化（去重 / 丢弃非法 / 超上限一律拒绝而非截断）
  const parsed = normalizeBatchUrls(body.urls ?? body.videoUrls);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: parsed.code || BATCH_ERROR_CODES.invalidRequest,
        urls: parsed.urls,
        invalidCount: parsed.invalidCount,
        duplicateCount: parsed.duplicateCount,
      },
      { status: 400 },
    );
  }

  const client = serviceRoleClient();
  if (!client) return NextResponse.json({ error: BATCH_ERROR_CODES.failed }, { status: 500 });

  // 4. 余额预检（admin 豁免，与 analyze 阶段的额度门一致）
  const admin = await isAdminUser(client, userId);
  let affordable: number | null = null;
  if (!admin) {
    let balance: number;
    try {
      balance = await ensureCreditsAndCheck(client, userId);
    } catch (e) {
      console.error('[videos/batch] balance read failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: BATCH_ERROR_CODES.failed }, { status: 500 });
    }
    affordable = Math.floor(Math.max(0, balance) / CREDIT_COST);
    if (affordable < 1) {
      return NextResponse.json(
        { error: BATCH_ERROR_CODES.insufficientCredits, required: CREDIT_COST, balance, affordable: 0 },
        { status: 402 },
      );
    }
    if (parsed.urls.length > affordable) {
      return NextResponse.json(
        { error: BATCH_ERROR_CODES.quotaExceeded, requested: parsed.urls.length, affordable },
        { status: 400 },
      );
    }
  }

  // 5. 建行（保持输入顺序；单条失败不阻塞其余）
  const created = await createBatchJobs(client, userId, parsed.urls, { sourceType: 'url' });
  if (created.videoIds.length === 0) {
    return NextResponse.json(
      { error: BATCH_ERROR_CODES.failed, detail: created.failed },
      { status: 500 },
    );
  }

  // 6. 立刻填满并发槽（minAgeMs: 0 → 不等 20s 宽限）
  const pump = await pumpUserQueue(client, userId, { minAgeMs: 0 });

  return NextResponse.json({
    ok: true,
    batchId: `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    videoIds: created.videoIds,
    concurrency: pump.concurrency,
    started: pump.started,
    /** admin 为 null（免额度） */
    affordable,
    ignored: { invalidCount: parsed.invalidCount, duplicateCount: parsed.duplicateCount },
    failed: created.failed,
  });
}