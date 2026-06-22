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
 * 添加 locale / parent_id 列到 blogs 表（如果不存在）
 * 需要管理员权限
 *
 * 使用 Supabase 的 service role key 通过 REST API 添加列
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
    const columnsToAdd = [
      { name: 'locale', type: 'VARCHAR(10)', default: "'en'", updateNulls: "UPDATE blogs SET locale = 'en' WHERE locale IS NULL" },
      { name: 'parent_id', type: 'VARCHAR(36)', default: 'NULL', updateNulls: null },
    ];

    const results: Record<string, { exists: boolean; added?: boolean; error?: string }> = {};
    let allColumnsExist = true;

    // Step 1: 检查每列是否存在
    for (const col of columnsToAdd) {
      const { error: checkError } = await client
        .from('blogs')
        .select(col.name)
        .limit(1);

      if (checkError) {
        results[col.name] = { exists: false };
        allColumnsExist = false;
      } else {
        results[col.name] = { exists: true };
      }
    }

    if (allColumnsExist) {
      // 更新 locale null 值
      try {
        await client.from('blogs').update({ locale: 'en' }).is('locale', null);
      } catch {}
      return NextResponse.json({
        success: true,
        message: 'All required columns already exist',
        results,
      });
    }

    // Step 2: 尝试通过 PostgreSQL 连接字符串直接执行 SQL
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
    if (databaseUrl) {
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
        for (const col of columnsToAdd) {
          if (!results[col.name].exists) {
            await pool.query(`ALTER TABLE blogs ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
            if (col.updateNulls) await pool.query(col.updateNulls);
            results[col.name].added = true;
          }
        }
        await pool.end();

        return NextResponse.json({
          success: true,
          message: 'Columns added successfully via direct PostgreSQL connection',
          results,
        });
      } catch (pgErr) {
        const pgMessage = pgErr instanceof Error ? pgErr.message : 'PostgreSQL connection failed';
        return NextResponse.json({
          success: false,
          message: 'Failed to add columns via PostgreSQL connection',
          error: pgMessage,
          sql: columnsToAdd
            .filter(c => !results[c.name].exists)
            .map(c => `ALTER TABLE blogs ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};${c.updateNulls ? ' ' + c.updateNulls + ';' : ''}`)
            .join('\n'),
          results,
        });
      }
    }

    // Step 3: 所有方式都失败，返回需要手动执行的 SQL
    return NextResponse.json({
      success: false,
      message: 'Please add the missing columns manually in Supabase SQL Editor',
      sql: columnsToAdd
        .filter(c => !results[c.name].exists)
        .map(c => `ALTER TABLE blogs ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};${c.updateNulls ? ' ' + c.updateNulls + ';' : ''}`)
        .join('\n'),
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Migration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
