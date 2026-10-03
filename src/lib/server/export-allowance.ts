import { createClient } from '@supabase/supabase-js';

/**
 * 免费用户「一次性导出额度」的服务端凭证与消费逻辑。
 *
 * 落库凭证复用既有 credit_transactions 表（不新增 DDL）：
 * 以 type = 'free_export_allowance' 的一条 0 积分流水作为「额度已用」的标记。
 * 只要该用户存在这样一条记录，即视为额度已消费——整个账号仅一次。
 *
 * 全部失败路径 fail-closed：无法确认「未使用」时一律按「已使用」处理，
 * 宁可拒绝导出，绝不放行。
 */

export const FREE_EXPORT_TX_TYPE = 'free_export_allowance';

/** service-role 客户端（写/读流水表用）；未配置 Supabase 时返回 null。 */
function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * 查询该用户的一次性免费导出额度状态。
 * 未配置 service role / 查询异常 → { used: true, available: false }（fail-closed）。
 */
export async function getFreeExportStatus(userId: string): Promise<{ used: boolean; available: boolean }> {
  const client = serviceRoleClient();
  if (!client) return { used: true, available: false };
  try {
    const { count, error } = await client
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', FREE_EXPORT_TX_TYPE);
    if (error) return { used: true, available: false };
    const used = (count ?? 0) > 0;
    return { used, available: !used };
  } catch (e) {
    console.warn('[export-allowance] status query failed:', e instanceof Error ? e.message.slice(0, 200) : e);
    return { used: true, available: false };
  }
}

/**
 * 消费一次性免费导出额度。
 * 先查状态：已用直接返回 false；否则插入 0 积分流水作为凭证。
 * 插入成功返回 true，任何失败返回 false（fail-closed、不抛错）。
 */
export async function consumeFreeExport(userId: string, meta?: { endpoint?: string }): Promise<boolean> {
  const status = await getFreeExportStatus(userId);
  if (status.used) return false;
  const client = serviceRoleClient();
  if (!client) return false;
  try {
    const description =
      'Free one-time export allowance used' + (meta?.endpoint ? ` (${meta.endpoint})` : '');
    const { error } = await client
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: 0,
        type: FREE_EXPORT_TX_TYPE,
        description,
      });
    if (error) {
      console.warn('[export-allowance] consume insert failed:', error.message?.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[export-allowance] consume error:', e instanceof Error ? e.message.slice(0, 200) : e);
    return false;
  }
}
