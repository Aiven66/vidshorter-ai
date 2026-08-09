import { NextRequest } from 'next/server';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/video-notes/[id] — 获取单条笔记详情
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: '缺少笔记 ID' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  // demo JWT：返回模拟详情
  const decoded = decodeJwtPayload(bearerToken);
  if (decoded?.demo === true) {
    return Response.json({
      id,
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      source_type: 'youtube',
      video_title: 'Demo Video Note',
      content_json: {
        summary: 'This is a demo note in demo mode.',
        highlights: [],
        takeaways: [],
      },
      raw_markdown: '# Demo Note\n\nThis is a demo note.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const client = getSupabaseClient(bearerToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const { data, error: queryErr } = await client
    .from('video_notes')
    .select('id, video_url, source_type, video_title, thumbnail_url, content_json, raw_markdown, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (queryErr) {
    console.error('[video-notes/get] query error:', queryErr);
    return Response.json({ error: '查询失败' }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: '笔记不存在或无访问权限' }, { status: 404 });
  }

  return Response.json(data);
}

// DELETE /api/video-notes/[id] — 删除单条笔记
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: '缺少笔记 ID' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  // demo JWT：直接返回成功
  const decoded = decodeJwtPayload(bearerToken);
  if (decoded?.demo === true) {
    return Response.json({ success: true, id });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const client = getSupabaseClient(bearerToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const { error: deleteErr } = await client
    .from('video_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (deleteErr) {
    console.error('[video-notes/delete] error:', deleteErr);
    return Response.json({ error: '删除失败：' + deleteErr.message }, { status: 500 });
  }

  return Response.json({ success: true, id });
}
