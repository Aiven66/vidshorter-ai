import { SupabaseClient } from '@supabase/supabase-js';
import { CREDIT_COST } from '@/lib/plan-credits';

/**
 * Lightweight credit-refund shared module.
 *
 * Kept dependency-free (no video-clipper / ffmpeg imports) so the high-frequency
 * /api/videos/process/status polling route can import it without dragging in the
 * heavy video processing bundle. video-job.ts reuses the same helper so every
 * failed/terminal path refunds through one idempotent code path.
 */

// 唯一定义处已移至 @/lib/plan-credits（客户端也要用，故不能依赖 supabase）。
// 此处再导出，保持既有 `from '@/lib/server/video-refund'` 的 import 路径可用。
export { CREDIT_COST };

/**
 * Idempotent credit refund keyed by related_id=videoId. Refunds the one-time
 * `video_process` charge whenever a job fails or times out, so users are never
 * left "charged for a stuck task". Safe to call from any failed/terminal path
 * (the status route STALE branch and the worker's failed fall-through) — it
 * checks credit_transactions for an existing `refund` row first and no-ops, and
 * only refunds if a matching `video_process` charge was actually recorded.
 */
export async function refundIfCharged(client: SupabaseClient, userId: string, videoId: string): Promise<void> {
  // A refund for this video already recorded? no-op (idempotent).
  const { data: existing } = await client
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'refund')
    .eq('related_id', videoId)
    .limit(1);
  if (existing && existing.length > 0) return;

  // Only refund if we actually charged this video (type='video_process').
  const { data: charged } = await client
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'video_process')
    .eq('related_id', videoId)
    .limit(1);
  if (!charged || charged.length === 0) return;

  const { data: creditsRow } = await client.from('credits').select('balance').eq('user_id', userId).maybeSingle();
  const balance = creditsRow?.balance ?? 0;
  await client.from('credits').update({ balance: balance + CREDIT_COST }).eq('user_id', userId);
  await client.from('credit_transactions').insert({
    user_id: userId,
    amount: CREDIT_COST,
    type: 'refund',
    description: 'Refund for failed/timed-out video processing',
    related_id: videoId,
  });
  console.log(`[video-refund] refunded ${CREDIT_COST} credits for video ${videoId}`);
}