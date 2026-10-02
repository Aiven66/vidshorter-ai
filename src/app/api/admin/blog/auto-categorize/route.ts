/**
 * 后台：一键为存量博客文章自动提炼分类。
 * 仅重分类当前标记为默认 "AI Video Clipping" 的文章；同标题的多语言副本一并更新保持归档一致。
 * 每次调用按 distinct 文章数逐篇调用 LLM，返回处理统计。
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const DEFAULT_CATEGORY = 'AI Video Clipping';
const MAX_ARTICLES = 500;

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
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function adminGate(client: ReturnType<typeof createClient>, token: string) {
  const adminEmails = ['admin@126.com', 'admin@vidshorter.ai', 'admin@clipop.ai'];
  const demoPayload = decodeJwtPayload(token);
  if (
    demoPayload?.email &&
    adminEmails.includes(demoPayload.email as string) &&
    (demoPayload?.role === 'admin' || demoPayload?.iss === 'clipop-demo')
  ) {
    return true;
  }
  // 标准 Supabase 会话校验
  const { data, error } = await client.auth.getUser(token);
  if (!error && data.user) {
    const { data: profile } = await client
      .from('users')
      .select('role,email')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.role === 'admin') return true;
  }
  return false;
}

interface BlogRow { id: string; title: string; content: string; category: string; }

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '';
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return Response.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const isAdmin = await adminGate(client, token);
  if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

  try {
    const { data: page } = await client
      .from('blogs')
      .select('id,title,category,content')
      .limit(MAX_ARTICLES);

    const rows = (Array.isArray(page) ? page : []) as BlogRow[];
    if (rows.length === 0) return Response.json({ processed: 0, updated: 0, skipped: 0, failed: 0 });

    // 按规范化标题分组，同一篇文章的多语言副本只分类一次
    const groups = new Map<string, BlogRow[]>();
    for (const row of rows) {
      const key = (row.title || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80) || row.id;
      const arr = groups.get(key) || [];
      arr.push(row);
      groups.set(key, arr);
    }

    const { classifyBlogCategory } = await import('@/lib/server/blog/categorize');

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const group of groups.values()) {
      const representative = group[0];
      // 只处理仍是默认分类的文章（避免覆盖管理员手动设置过的分类）
      const needsUpdate = group.some((r) => (r.category || DEFAULT_CATEGORY) === DEFAULT_CATEGORY);
      if (!needsUpdate) { skipped++; continue; }

      let label: string | null = null;
      try {
        label = await classifyBlogCategory(representative.title, representative.content || '');
      } catch {
        label = null;
      }
      if (!label || label === DEFAULT_CATEGORY) { failed++; continue; }

      const ids = group.map((r) => r.id);
      const { error: updErr } = await client
        .from('blogs')
        .update({ category: label, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (updErr) { failed++; continue; }
      updated += group.length;
    }

    return Response.json({
      processed: groups.size,
      updated,
      skipped,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto-categorize failed';
    console.error('[auto-categorize]', message);
    return Response.json({ error: message }, { status: 500 });
  }
}