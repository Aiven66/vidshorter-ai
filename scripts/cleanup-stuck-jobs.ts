import { createClient } from '@supabase/supabase-js';
import { refundIfCharged } from '../src/lib/server/video-refund';
import fs from 'node:fs';

const env = fs.readFileSync('.env.production', 'utf8').split('\n');
const get = (k: string) => {
  const m = env.find(l => l.startsWith(k + '='));
  if (!m) return '';
  return m.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
};
const client = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 只清理"确实卡死"的任务：非终态 + 超过 60 分钟未更新（生产存量多为数小时/数天）。
const STALE_MS = Number(process.env.STALE_MS || 60 * 60 * 1000);
const TERMINAL = new Set(['completed', 'partial', 'link_only_completed', 'failed']);

async function main() {
  const { data: jobs, error: listErr } = await client
    .from('videos')
    .select('id,user_id,status,updated_at,created_at')
    .eq('status', 'processing');

  if (listErr) { console.log('list err', listErr.message); process.exit(1); }
  if (!jobs || jobs.length === 0) { console.log('none to clean'); return; }
  const now = Date.now();
  let cleaned = 0, refunded = 0, skipped = 0;
  for (const j of jobs) {
    const up = j.updated_at || j.created_at;
    const age = now - new Date(up).getTime();
    if (age < STALE_MS) { skipped++; continue; }
    // 原子认领：仅当仍是处理中状态才标记 failed。
    const { data: claimed, error } = await client
      .from('videos')
      .update({ status: 'failed', error_message: 'Processing timed out and was stopped. Please retry.', updated_at: new Date().toISOString() })
      .eq('id', j.id)
      .or('status.not.in.(completed,partial,link_only_completed,failed)')
      .select('id');
    if (error) { console.log('claim err', j.id, error.message); continue; }
    if (claimed && claimed.length > 0) {
      cleaned++;
      try { await refundIfCharged(client, j.user_id, j.id); refunded++; }
      catch (e) { console.log('refund err', j.id, e); }
    }
  }
  console.log(JSON.stringify({ jobs: jobs.length, cleaned, refunded, skipped }));
  process.exit(0);
}
main();
