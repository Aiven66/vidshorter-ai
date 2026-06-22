import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TRUSTED_ADMIN_EMAILS = new Set([
  'admin@vidshorter.ai',
  'admin@126.com',
  'admin@clipop.ai',
]);

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // 处理 URL-safe base64（Supabase JWT 使用）和标准 base64
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = payload.length % 4;
    if (pad) payload += '='.repeat(4 - pad);
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function getAdminUser(
  client: ReturnType<typeof createClient>,
  token: string
) {
  // 1. 先尝试 JWT 解码检查（demo token 和 Supabase JWT 都适用）
  const payload = decodeJwtPayload(token);
  if (payload) {
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const role = typeof payload.role === 'string' ? payload.role : '';

    // demo token: role=admin 且 email 在白名单
    if (role === 'admin' && email && TRUSTED_ADMIN_EMAILS.has(email)) {
      return {
        id: typeof payload.sub === 'string' ? payload.sub : 'demo-admin-id',
        email,
        name: typeof payload.name === 'string' ? payload.name : 'Admin',
        role: 'admin',
      };
    }

    // Supabase JWT: email 在白名单（即使 role=authenticated 也允许）
    if (email && TRUSTED_ADMIN_EMAILS.has(email)) {
      return {
        id: typeof payload.sub === 'string' ? payload.sub : 'admin-id',
        email,
        name: typeof payload.name === 'string' ? payload.name : 'Admin',
        role: 'admin',
      };
    }

    // 检查 user_metadata 中的 email
    if (payload.user_metadata && typeof payload.user_metadata === 'object') {
      const meta = payload.user_metadata as Record<string, unknown>;
      const metaEmail = typeof meta.email === 'string' ? meta.email.toLowerCase() : '';
      if (metaEmail && TRUSTED_ADMIN_EMAILS.has(metaEmail)) {
        return {
          id: typeof payload.sub === 'string' ? payload.sub : 'admin-id',
          email: metaEmail,
          name: typeof meta.name === 'string' ? meta.name : 'Admin',
          role: 'admin',
        };
      }
    }
  }

  // 2. 尝试 Supabase auth 验证
  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user?.email) return null;

    const email = authData.user.email.toLowerCase();

    // email 在白名单，直接允许
    if (TRUSTED_ADMIN_EMAILS.has(email)) {
      return {
        id: authData.user.id,
        email: authData.user.email,
        name: authData.user.user_metadata?.name || 'Admin',
        role: 'admin',
      };
    }

    // 检查 users 表的 role
    const { data: userRow } = await client
      .from('users')
      .select('id, email, name, role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const role = userRow?.role || 'user';
    if (role !== 'admin') return null;

    return {
      id: userRow?.id || authData.user.id,
      email: authData.user.email,
      name: userRow?.name || authData.user.user_metadata?.name || 'Admin',
      role,
    };
  } catch {
    return null;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Next.js 15+: params 是 Promise，需要 await
  const resolvedParams = params instanceof Promise ? await params : params;
  const blogId = resolvedParams?.id;

  if (!blogId) {
    return NextResponse.json({ error: 'Blog id required' }, { status: 400 });
  }

  // 从 Authorization header 或 cookie 获取 token
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const cookieToken = req.cookies.get('clipop_access_token')?.value || '';
  const token = bearerToken || cookieToken;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminUser = await getAdminUser(client, token);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    // 查询目标文章以确定 parent_id
    const { data: target } = await client
      .from('blogs')
      .select('id,parent_id')
      .eq('id', blogId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ ok: true, deleted: blogId });
    }

    const parentId = target.parent_id || target.id;
    // 删除 root 及其所有翻译版本
    const { error } = await client
      .from('blogs')
      .delete()
      .or(`id.eq.${parentId},and(parent_id.eq.${parentId},parent_id.not.is.null)`);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json(
        { error: `Delete failed: ${error.message || String(error)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deleted: parentId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err) || 'Failed to delete';
    console.error('Delete error:', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
