import { NextRequest } from 'next/server';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SaveNoteBody {
  videoUrl?: string;
  sourceType?: string;
  videoTitle?: string;
  thumbnailUrl?: string;
  contentJson?: unknown;
  rawMarkdown?: string;
}

// 解析 JWT payload（用于识别 demo token，兼容 Supabase JWT 与 demo JWT）
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64url').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAuthInfo(bearerToken: string): { userId: string; isDemo: boolean } | null {
  const decoded = decodeJwtPayload(bearerToken);
  const isDemo = decoded?.demo === true;
  const sub = typeof decoded?.sub === 'string' ? (decoded.sub as string) : '';
  if (!sub) return null;
  return { userId: sub, isDemo };
}

// GET /api/video-notes — 列出当前用户的笔记
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const authInfo = getAuthInfo(bearerToken);

  // demo JWT 用户：返回空列表（无持久化存储）
  if (authInfo?.isDemo) {
    return Response.json({ items: [], limit: 50, offset: 0 });
  }

  if (!isSupabaseConfigured() || !authInfo) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const client = getSupabaseClient(bearerToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }
  const userId = user.id;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  const { data, error: queryErr } = await client
    .from('video_notes')
    .select('id, video_url, source_type, video_title, thumbnail_url, content_json, raw_markdown, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (queryErr) {
    console.error('[video-notes/list] query error:', queryErr);
    return Response.json({ error: '查询笔记失败' }, { status: 500 });
  }

  return Response.json({
    items: data || [],
    limit,
    offset,
  });
}

// POST /api/video-notes — 保存一条笔记
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const authInfo = getAuthInfo(bearerToken);

  const body = (await request.json().catch(() => ({}))) as SaveNoteBody;
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType.trim() : '';
  const videoTitle = typeof body.videoTitle === 'string' ? body.videoTitle.trim().slice(0, 500) : null;
  const thumbnailUrl = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl.trim().slice(0, 1000) : null;
  const contentJson = body.contentJson;
  const rawMarkdown = typeof body.rawMarkdown === 'string' ? body.rawMarkdown : null;

  if (!videoUrl) {
    return Response.json({ error: '缺少 videoUrl' }, { status: 400 });
  }
  if (!sourceType) {
    return Response.json({ error: '缺少 sourceType' }, { status: 400 });
  }
  if (!contentJson || typeof contentJson !== 'object') {
    return Response.json({ error: '缺少 contentJson' }, { status: 400 });
  }

  // demo JWT 用户：返回模拟 ID（无持久化存储，但前端体验一致）
  if (authInfo?.isDemo) {
    return Response.json({
      id: `demo-note-${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (!isSupabaseConfigured() || !authInfo) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const client = getSupabaseClient(bearerToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }
  const userId = user.id;

  const { data, error: insertErr } = await client
    .from('video_notes')
    .insert({
      user_id: userId,
      video_url: videoUrl.slice(0, 1000),
      source_type: sourceType.slice(0, 20),
      video_title: videoTitle,
      thumbnail_url: thumbnailUrl,
      content_json: contentJson as object,
      raw_markdown: rawMarkdown,
    })
    .select('id, created_at')
    .single();

  if (insertErr) {
    console.error('[video-notes/save] insert error:', insertErr);
    return Response.json({ error: '保存失败：' + insertErr.message }, { status: 500 });
  }

  return Response.json({
    id: data.id,
    createdAt: data.created_at,
  });
}
