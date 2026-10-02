/**
 * 管理后台鉴权：从请求里解析 bearer token → 校验是否为管理员。
 *
 * 判定顺序（与 /api/admin/verify 完全一致，避免出现两套口径）：
 *   1) 解析 JWT payload 拿 email / sub（sub = auth.users.id）
 *   2) 用 service role 查 public.users 的 email + role
 *   3) role === 'admin' 或 email 命中白名单 → 视为管理员
 * Supabase 未配置时退化为「仅凭 JWT 里的 role/email 判定」。
 */

import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VERIFIED_ADMINS = new Set(['admin@126.com', 'admin@clipop.ai']);

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || '';
  return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
}

function isAdminIdentity(email: string | null, role: string | null): boolean {
  if (role === 'admin') return true;
  return !!email && VERIFIED_ADMINS.has(email.trim().toLowerCase());
}

/** 返回管理员邮箱；非管理员 / 无 token 返回 null。 */
export async function resolveAdminEmail(request: NextRequest): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const jwtEmail = typeof payload?.email === 'string' ? payload.email : '';
  const jwtRole = typeof payload?.role === 'string' ? payload.role : '';
  const sub = typeof payload?.sub === 'string' ? payload.sub : '';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.COZE_SUPABASE_ANON_KEY ||
    '';

  if (url && key && sub) {
    try {
      const client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await client.from('users').select('email, role').eq('id', sub).maybeSingle();
      const email = (data?.email as string) || jwtEmail;
      const role = (data?.role as string) || jwtRole;
      return isAdminIdentity(email || null, role || null) ? email : null;
    } catch {
      // 查询失败时退回 JWT 自身声明
    }
  }

  return isAdminIdentity(jwtEmail || null, jwtRole || null) ? jwtEmail : null;
}