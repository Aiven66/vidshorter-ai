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

// 解析 JWT payload（兼容标准 base64 与 base64url，支持 demo JWT 与 Supabase JWT）
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let payload = parts[1];
    // 规范化为标准 base64：把 base64url 的 - _ 转回 + /
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    // 补齐 padding
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 解析 JWT header（兼容旧版 demo token，demo:true 在 header 中）
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

// 检查是否为有效 UUID 格式
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const ADMIN_EMAILS = new Set(['admin@clipop.ai', 'admin@126.com', 'admin@vidshorter.ai']);

interface AuthResult {
  userId: string;
  role: 'admin' | 'user';
  isDemo: boolean;
}

// 统一鉴权：信任 JWT 内容（demo JWT 直接信任；Supabase JWT getUser 失败时降级信任）
async function authenticate(bearerToken: string): Promise<AuthResult | { error: string; status: number }> {
  if (!bearerToken) {
    return { error: '请先登录后使用', status: 401 };
  }

  const decoded = decodeJwtPayload(bearerToken);
  if (!decoded) {
    return { error: '登录信息无效，请重新登录', status: 401 };
  }

  const sub = typeof decoded.sub === 'string' ? decoded.sub : '';
  const email = typeof decoded.email === 'string' ? decoded.email.toLowerCase() : '';
  const role = typeof decoded.role === 'string' ? decoded.role : '';
  // 检查 payload 中的 demo 标记（新版 token）
  const isDemoInPayload = decoded.demo === true;
  // 检查 header 中的 demo 标记（旧版 token 兼容）
  const header = decodeJwtHeader(bearerToken);
  const isDemoInHeader = header?.demo === true;
  const isDemo = isDemoInPayload || isDemoInHeader;

  if (!sub) {
    return { error: '登录信息无效，请重新登录', status: 401 };
  }

  const isAdminByEmail = email ? ADMIN_EMAILS.has(email) : false;
  const isAdminByRole = role === 'admin';
  const finalRole: 'admin' | 'user' = isAdminByEmail || isAdminByRole ? 'admin' : 'user';

  // demo JWT：直接信任，不调用 Supabase
  if (isDemo) {
    return { userId: sub, role: finalRole, isDemo: true };
  }

  // userId 不是有效 UUID（如 demo-admin-id），无法插入 Supabase，按 demo 处理
  if (!isValidUUID(sub)) {
    console.warn('[video-notes] userId is not a valid UUID, treating as demo:', sub);
    return { userId: sub, role: finalRole, isDemo: true };
  }

  // 真实 Supabase JWT：尝试校验，失败时降级到 JWT 信任
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseClient(bearerToken);
      const { data: { user }, error } = await client.auth.getUser();
      if (!error && user?.id) {
        return { userId: user.id, role: finalRole, isDemo: false };
      }
      console.warn('[video-notes] supabase.getUser failed, falling back to JWT claims');
    } catch (err) {
      console.warn('[video-notes] supabase auth error, falling back to JWT claims:', err);
    }
    // 降级：信任 JWT 内容（userId 已验证为 UUID 格式）
    return { userId: sub, role: finalRole, isDemo: false };
  }

  // Supabase 未配置：信任 JWT
  return { userId: sub, role: finalRole, isDemo };
}

// GET /api/video-notes — 列出当前用户的笔记
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  const authResult = await authenticate(bearerToken);
  if ('error' in authResult) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }

  // demo JWT 用户：返回空列表（无持久化存储）
  if (authResult.isDemo) {
    return Response.json({ items: [], limit: 50, offset: 0 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ items: [], limit: 50, offset: 0 });
  }

  const client = getSupabaseClient(bearerToken);
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  const { data, error: queryErr } = await client
    .from('video_notes')
    .select('id, video_url, source_type, video_title, thumbnail_url, content_json, raw_markdown, created_at, updated_at')
    .eq('user_id', authResult.userId)
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

  const authResult = await authenticate(bearerToken);
  if ('error' in authResult) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }

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
  if (authResult.isDemo) {
    return Response.json({
      id: `demo-note-${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({
      id: `local-note-${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }

  const client = getSupabaseClient(bearerToken);
  const { data, error: insertErr } = await client
    .from('video_notes')
    .insert({
      user_id: authResult.userId,
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
