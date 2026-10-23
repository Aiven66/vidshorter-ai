import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TERMINAL_VIDEO_STATUSES } from '@/lib/video-batch';
import { refundIfCharged } from '@/lib/server/video-refund';

/**
 * 定时对账非终态视频任务（Vercel Cron，见 vercel.json，每 5 分钟）。
 *
 * 为什么需要它：单条任务的超时判定过去只在用户轮询 /api/videos/process/status 时触发。
 * 用户关掉页面后，一条死掉的任务会永远停在 processing —— 既不释放批量队列槽位，
 * 也不退款。这里用与 status 路由相同的 15 分钟阈值独立扫描，把超时任务落为 failed，
 * 并做一次幂等退款（按 related_id 去重），与用户是否在线无关。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const STALE_MS = Number(process.env.PROCESS_STALE_MS || 15 * 60 * 1000);
/** 单次最多处理条数，避免一次 cron 打爆数据库。 */
const MAX_ROWS = 100;

const TERMINAL_FILTER = `status.not.in.(${TERMINAL_VIDEO_STATUSES.join(',')})`;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未配置密钥则一律拒绝，避免裸奔的降级入口
  const header = req.headers.get('x-vercel-cron-secret') || req.headers.get('x-cron-secret');
  if (header === secret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === secret;
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const client = serviceRoleClient();
  if (!client) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const now = Date.now();
  const cutoff = new Date(now - STALE_MS).toISOString();

  // updated_at 为空 = 从未被 worker 认领，按 created_at 判定，避免「提交后就没动过」的任务漏网。
  const { data: rows, error } = await client
    .from('videos')
    .select('id,user_id,status,created_at,updated_at')
    .or(TERMINAL_FILTER)
    .or(`updated_at.lt.${cutoff},and(updated_at.is.null,created_at.lt.${cutoff})`)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let failed = 0;
  let refunded = 0;
  const skipped: string[] = [];

  for (const row of rows ?? []) {
    const videoId = String(row.id);
    const userId = String(row.user_id);

    // 原子认领：只有仍非终态且确实超时的行才会被更新，避免与 status 路由/另一个 cron 抢跑。
    const { data: claimed, error: claimError } = await client
      .from('videos')
      .update({
        status: 'failed',
        error_message:
          'Processing timed out and was stopped. This may be a temporary issue with the video source. Please retry — credits already charged are refunded automatically.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)
      .or(TERMINAL_FILTER)
      .lt('updated_at', cutoff)
      .select('id');

    if (claimError) {
      skipped.push(`${videoId}: ${claimError.message.slice(0, 120)}`);
      continue;
    }
    // updated_at 为 null 的行不会被 .lt 命中 → 用第二条不带时间条件的认领（仍带终态保护）。
    const claimedCount = claimed?.length ?? 0;
    if (claimedCount === 0) {
      const { data: claimedNull } = await client
        .from('videos')
        .update({
          status: 'failed',
          error_message:
            'Processing timed out and was stopped. This may be a temporary issue with the video source. Please retry — credits already charged are refunded automatically.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId)
        .or(TERMINAL_FILTER)
        .is('updated_at', null)
        .lt('created_at', cutoff)
        .select('id');
      if (!claimedNull || claimedNull.length === 0) continue;
    }

    failed += 1;
    try {
      await refundIfCharged(client, userId, videoId);
      refunded += 1;
    } catch (e) {
      skipped.push(`${videoId}: refund ${e instanceof Error ? e.message.slice(0, 120) : 'failed'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    cutoff,
    scanned: rows?.length ?? 0,
    failed,
    refunded,
    skipped: skipped.length > 0 ? skipped : undefined,
  });
}
