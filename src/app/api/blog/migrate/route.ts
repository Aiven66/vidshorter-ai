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

/**
 * POST /api/blog/migrate
 * 添加 locale 列到 blogs 表（如果不存在）
 * 需要管理员权限
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 验证管理员
  const demoPayload = decodeJwtPayload(token);
  const adminEmails = ['admin@126.com', 'admin@vidshorter.ai'];
  if (
    !(demoPayload?.email && adminEmails.includes(demoPayload.email as string) &&
      (demoPayload?.role === 'admin' || demoPayload?.iss === 'clipop-demo'))
  ) {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user?.email) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const { data: userRow } = await client
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (userRow?.role !== 'admin' && !adminEmails.includes(authData.user.email)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
  }

  try {
    // 检查 locale 列是否已存在
    const { data: existingRows, error: checkError } = await client
      .from('blogs')
      .select('locale')
      .limit(1);

    if (!checkError) {
      // locale 列已存在，更新已有文章的 locale 为 'en'（如果为 null）
      const { error: updateError } = await client
        .from('blogs')
        .update({ locale: 'en' })
        .is('locale', null);

      if (updateError) {
        return NextResponse.json({
          success: true,
          message: 'locale column exists, but failed to update null values',
          error: updateError.message,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'locale column already exists, updated null values to "en"',
      });
    }

    // locale 列不存在，需要通过 RPC 添加
    // Supabase JS 客户端不支持 ALTER TABLE，需要使用 rpc 或直接 SQL
    // 尝试使用 Supabase REST API 执行 SQL
    const supabaseUrl = url;
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/add_locale_column`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'locale column added successfully via RPC',
      });
    }

    // RPC 不存在，返回需要手动执行的 SQL
    return NextResponse.json({
      success: false,
      message: 'Please add the locale column manually in Supabase SQL Editor',
      sql: 'ALTER TABLE blogs ADD COLUMN IF NOT EXISTS locale VARCHAR(10); UPDATE blogs SET locale = \'en\' WHERE locale IS NULL;',
      checkError: checkError.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Migration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
