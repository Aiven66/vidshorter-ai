import { NextRequest } from 'next/server';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export type AnnotationColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';
export interface CorePointAnnotation {
  index: number;
  color?: AnnotationColor | null;
  note?: string;
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

// 解析 JWT header（兼容旧版 demo token）
function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header = parts[0];
    header = header.replace(/-/g, '+').replace(/_/g, '/');
    const padded = header + '='.repeat((4 - (header.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 检查是否为 demo token（payload 或 header 中有 demo:true）
function isDemoTokenCheck(token: string): boolean {
  const decoded = decodeJwtPayload(token);
  if (decoded?.demo === true) return true;
  const header = decodeJwtHeader(token);
  if (header?.demo === true) return true;
  return false;
}

// 检查是否为有效 UUID
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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

  const decoded = decodeJwtPayload(bearerToken);
  // demo JWT（含旧版 header 标记）或 userId 非 UUID：返回模拟详情
  const isDemo = isDemoTokenCheck(bearerToken);
  const sub = typeof decoded?.sub === 'string' ? decoded.sub : '';
  if (isDemo || !isValidUUID(sub)) {
    return Response.json({
      id,
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      source_type: 'youtube',
      video_title: 'Demo Video Note',
      content_json: {
        summary: 'This is a demo note in demo mode.',
        highlights: [],
        takeaways: [],
        corePoints: [
          { index: 1, title: '① Context & Setup', detail: 'Introduce the subject and why it matters.' },
          { index: 2, title: '② Core Framework', detail: 'The step-by-step method to understand.' },
          { index: 3, title: '③ Evidence & Example', detail: 'Concrete case studies or data.' },
          { index: 4, title: '④ Pitfalls to avoid', detail: 'Common mistakes.' },
          { index: 5, title: '⑤ Action Items', detail: 'How to apply what you learned.' },
        ],
        annotations: [],
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
  let userId = '';
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (!error && user?.id) {
      userId = user.id;
    } else {
      // 降级：信任 JWT 中的 sub
      userId = typeof decoded?.sub === 'string' ? decoded.sub : '';
    }
  } catch {
    userId = typeof decoded?.sub === 'string' ? decoded.sub : '';
  }
  if (!userId) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const { data, error: queryErr } = await client
    .from('video_notes')
    .select('id, video_url, source_type, video_title, thumbnail_url, content_json, raw_markdown, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (queryErr) {
    console.error('[video-notes/get] query error:', queryErr);
    return Response.json({ error: '查询失败' }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: '笔记不存在或无访问权限' }, { status: 404 });
  }

  // 向后兼容：老笔记没有 corePoints 时初始化一个空数组
  const content = (data.content_json as Record<string, unknown> | null) ?? {};
  if (!Array.isArray(content.corePoints)) {
    content.corePoints = [];
  }
  if (!Array.isArray(content.annotations)) {
    content.annotations = [];
  }

  return Response.json({ ...data, content_json: content });
}

// PATCH /api/video-notes/[id] — 局部更新（颜色标注、文本笔记、标题等）
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: '缺少笔记 ID' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const decoded = decodeJwtPayload(bearerToken);
  const isDemo = isDemoTokenCheck(bearerToken);
  const sub = typeof decoded?.sub === 'string' ? decoded.sub : '';

  const body = (await request.json().catch(() => ({}))) as {
    annotations?: CorePointAnnotation[];
    contentJson?: Record<string, unknown>;
    rawMarkdown?: string;
    videoTitle?: string;
  };

  // demo JWT 或 userId 非 UUID：返回模拟成功
  if (isDemo || !isValidUUID(sub)) {
    return Response.json({ success: true, id, demo: true, annotations: body.annotations || [] });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  const client = getSupabaseClient(bearerToken);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.id) {
    return Response.json({ error: '请先登录后使用' }, { status: 401 });
  }

  // 先获取旧内容做合并
  const { data: existing, error: fetchErr } = await client
    .from('video_notes')
    .select('content_json, raw_markdown, video_title')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[video-notes/patch] fetch error:', fetchErr);
    return Response.json({ error: '读取旧数据失败' }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: '笔记不存在或无访问权限' }, { status: 404 });
  }

  const oldContent = ((existing.content_json as Record<string, unknown>) || {}) as Record<string, unknown>;

  // 合并内容
  let newContent = body.contentJson && typeof body.contentJson === 'object'
    ? { ...oldContent, ...body.contentJson }
    : { ...oldContent };
  if (body.annotations) {
    newContent.annotations = body.annotations;
  }
  if (!Array.isArray(newContent.annotations)) {
    newContent.annotations = [];
  }
  if (!Array.isArray(newContent.corePoints)) {
    newContent.corePoints = [];
  }

  const patch: Record<string, unknown> = {
    content_json: newContent,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.rawMarkdown === 'string') {
    patch.raw_markdown = body.rawMarkdown;
  }
  if (typeof body.videoTitle === 'string') {
    patch.video_title = body.videoTitle.slice(0, 500);
  }

  const { data: updated, error: updateErr } = await client
    .from('video_notes')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, updated_at')
    .maybeSingle();

  if (updateErr) {
    console.error('[video-notes/patch] update error:', updateErr);
    return Response.json({ error: '更新失败：' + updateErr.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    id,
    updatedAt: updated?.updated_at || patch.updated_at,
  });
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

  // demo JWT 或 userId 非 UUID：直接返回成功
  const isDemo = isDemoTokenCheck(bearerToken);
  const decoded = decodeJwtPayload(bearerToken);
  const sub = typeof decoded?.sub === 'string' ? decoded.sub : '';
  if (isDemo || !isValidUUID(sub)) {
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
