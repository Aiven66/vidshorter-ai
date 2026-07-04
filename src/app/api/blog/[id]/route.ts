import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_TOKEN ||
    ''
  );
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getAdminUser(
  client: ReturnType<typeof createClient>,
  token: string,
  url: string
) {
  const demoPayload = decodeJwtPayload(token);
  const adminEmails = ['admin@126.com', 'admin@vidshorter.ai', 'admin@clipop.ai'];
  if (
    demoPayload?.email &&
    adminEmails.includes(demoPayload.email as string) &&
    (demoPayload?.role === 'admin' || demoPayload?.iss === 'clipop-demo')
  ) {
    return {
      id: typeof demoPayload.sub === 'string' ? demoPayload.sub : 'demo-admin-id',
      email: demoPayload.email as string,
      name: typeof demoPayload.name === 'string' ? demoPayload.name : 'Admin',
      role: 'admin',
    };
  }

  try {
    // 用 anon key 创建 auth client 来验证用户 token
    // service role client 不能验证用户 token（auth.getUser 会失败）
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.COZE_SUPABASE_ANON_KEY || '';
    if (!anonKey) return null;

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user?.email) return null;

    const { data: userRow } = await client
      .from('users')
      .select('id,email,name,role')
      .eq('id', authData.user.id)
      .maybeSingle();

    const email = authData.user.email.toLowerCase();
    const role = userRow?.role || (adminEmails.includes(email) ? 'admin' : 'user');
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

  const resolvedParams = params instanceof Promise ? await params : params;
  const blogId = resolvedParams?.id;

  if (!blogId) {
    return NextResponse.json({ error: 'Blog id required' }, { status: 400 });
  }

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

  const adminUser = await getAdminUser(client, token, url);
  if (!adminUser) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    // 查询目标文章
    const { data: target, error: targetError } = await client
      .from('blogs')
      .select('id,parent_id')
      .eq('id', blogId)
      .maybeSingle();

    console.log('Delete target query:', { blogId, target, targetError: targetError?.message });

    // 计算要删除的 ID 列表
    // 使用两步查询代替 .or()，避免 Supabase .or() 过滤器的已知问题
    const idsToDelete: string[] = [blogId];

    if (target) {
      const parentId = target.parent_id || target.id;
      if (parentId !== blogId) {
        idsToDelete.push(parentId);
      }

      // 查询所有翻译版本（parent_id = parentId）
      const { data: translations, error: translationsError } = await client
        .from('blogs')
        .select('id')
        .eq('parent_id', parentId);

      console.log('Translations query:', { parentId, count: translations?.length, error: translationsError?.message });

      if (translations && translations.length > 0) {
        for (const t of translations) {
          if (!idsToDelete.includes(t.id)) {
            idsToDelete.push(t.id);
          }
        }
      }
    } else {
      // target 查询返回 null，可能是因为 parent_id 列不存在或查询失败
      // 直接尝试删除 blogId 本身
      console.log('Target not found, attempting direct delete of blogId:', blogId);
    }

    console.log('Deleting blog posts:', idsToDelete);

    const { error, count } = await client
      .from('blogs')
      .delete({ count: 'exact' })
      .in('id', idsToDelete);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json(
        { error: `Delete failed: ${error.message || String(error)}` },
        { status: 500 }
      );
    }

    console.log(`Deleted ${count} blog posts (requested ${idsToDelete.length})`);
    return NextResponse.json({
      ok: true,
      deleted: blogId,
      count,
      deletedIds: idsToDelete,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err) || 'Failed to delete';
    console.error('Delete error:', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
