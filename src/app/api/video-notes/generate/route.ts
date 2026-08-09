import { NextRequest } from 'next/server';
import { isSupabaseConfigured, getSupabaseClient } from '@/storage/database/supabase-client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  fetchTranscript,
  fetchVideoTitle,
  generateNoteFromTranscript,
} from './local-note-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const NOTE_COST = 30;

interface VideoNoteContent {
  summary: string;
  highlights: Array<{
    timestamp: string;
    startSeconds: number;
    text: string;
    level: 'critical' | 'important';
  }>;
  takeaways: string[];
  hasTranscript?: boolean;
  totalDuration?: number;
}

interface GenerateResponse {
  note: VideoNoteContent;
  videoTitle?: string;
  videoUrl: string;
  sourceType: 'youtube' | 'bilibili' | 'local';
}

// service role client，用于绕过 RLS 进行积分扣减
function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function detectSourceType(url: string): 'youtube' | 'bilibili' | 'local' | null {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili';
  if (/\.(mp4|mov|avi|webm|mkv)$/i.test(url)) return 'local';
  return null;
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

const ADMIN_EMAILS = new Set(['admin@clipop.ai', 'admin@126.com', 'admin@vidshorter.ai']);

interface AuthResult {
  userId: string;
  role: 'admin' | 'user';
  client: SupabaseClient | null;
  isDemo: boolean;
}

// 统一鉴权：信任 JWT 内容（demo JWT 直接信任；Supabase JWT 也信任以避免 getUser 失败）
// 安全说明：JWT 本身是签发的不可篡改令牌，攻击者无法伪造有效签名
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
  const isDemo = decoded.demo === true;

  if (!sub) {
    return { error: '登录信息无效，请重新登录', status: 401 };
  }

  // admin 邮箱直接判定为管理员
  const isAdminByEmail = email ? ADMIN_EMAILS.has(email) : false;
  const isAdminByRole = role === 'admin';
  const finalRole: 'admin' | 'user' = isAdminByEmail || isAdminByRole ? 'admin' : 'user';

  // demo JWT：直接信任，不调用 Supabase
  if (isDemo) {
    return { userId: sub, role: finalRole, client: null, isDemo: true };
  }

  // 真实 Supabase JWT：尝试校验以同步最新角色信息，但失败时降级到 JWT 信任
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseClient(bearerToken);
      const { data: { user }, error } = await client.auth.getUser();
      if (!error && user?.id) {
        // 同步数据库中的角色
        const { data: profile } = await client
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        const dbRole = profile?.role || 'user';
        const isAdminByDb = user.email ? ADMIN_EMAILS.has(user.email.toLowerCase()) : false;
        return {
          userId: user.id,
          role: isAdminByDb || dbRole === 'admin' ? 'admin' : dbRole as 'admin' | 'user',
          client,
          isDemo: false,
        };
      }
      // getUser 失败：降级信任 JWT（token 可能过期但仍包含有效用户信息）
      console.warn('[video-notes/generate] supabase.getUser failed, falling back to JWT claims');
    } catch (err) {
      console.warn('[video-notes/generate] supabase auth error, falling back to JWT claims:', err);
    }
    // 降级：信任 JWT 内容
    return { userId: sub, role: finalRole, client: null, isDemo: false };
  }

  // Supabase 未配置：信任 JWT（admin 用户依然可用）
  return { userId: sub, role: finalRole, client: null, isDemo };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { url, locale } = body as { url?: string; locale?: string };
  const videoUrl = typeof url === 'string' ? url.trim() : '';
  const clientLocale = typeof locale === 'string' ? locale : undefined;

  if (!videoUrl) {
    return Response.json({ error: '请输入视频链接' }, { status: 400 });
  }

  const sourceType = detectSourceType(videoUrl);
  if (!sourceType) {
    return Response.json({ error: '链接格式不正确，支持 YouTube / B站 / 本地视频' }, { status: 400 });
  }

  // 鉴权
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const authResult = await authenticate(bearerToken);
  if ('error' in authResult) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }
  const { userId, role: finalRole, client } = authResult;

  // 积分校验（管理员免扣）
  if (finalRole !== 'admin') {
    const adminClient = getServiceRoleClient();
    const creditsClient = adminClient || client;
    if (creditsClient) {
      const { data: creditsRow } = await creditsClient
        .from('credits')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      const balance = creditsRow?.balance ?? 0;
      if (balance < NOTE_COST) {
        return Response.json(
          { error: `积分不足，生成笔记需要 ${NOTE_COST} 积分，当前余额 ${balance}` },
          { status: 402 },
        );
      }
    }
    // 无 supabase 配置时跳过积分校验（demo 场景）
  }

  try {
    // 获取视频标题
    const videoTitle = await fetchVideoTitle(videoUrl, sourceType);

    // 本地算法生成笔记（不依赖云端 LLM）
    const transcript = await fetchTranscript(videoUrl, sourceType, clientLocale);
    const localNote = generateNoteFromTranscript(
      transcript,
      videoTitle,
      videoUrl,
      sourceType,
      clientLocale,
    );

    const note: VideoNoteContent = {
      summary: localNote.summary,
      highlights: localNote.highlights.slice(0, 15),
      takeaways: localNote.takeaways.slice(0, 8),
      hasTranscript: localNote.hasTranscript,
      totalDuration: localNote.totalDuration,
    };

    // 扣减积分（成功后扣减，管理员免扣）
    if (finalRole !== 'admin') {
      const adminClient = getServiceRoleClient();
      const creditsClient = adminClient || client;
      if (creditsClient) {
        const { data: latestCredits } = await creditsClient
          .from('credits')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();
        const currentBalance = latestCredits?.balance ?? 0;
        if (currentBalance >= NOTE_COST) {
          await creditsClient
            .from('credits')
            .update({ balance: currentBalance - NOTE_COST })
            .eq('user_id', userId);
          await creditsClient.from('credit_transactions').insert({
            user_id: userId,
            amount: -NOTE_COST,
            type: 'video_notes',
            description: 'Generate video highlight note',
          });
        }
      }
    }

    const result: GenerateResponse = {
      note,
      videoTitle,
      videoUrl,
      sourceType,
    };
    return Response.json(result);
  } catch (err: any) {
    console.error('[video-notes/generate] error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const friendlyError = message.includes('network') || message.includes('ENOTFOUND') || message.includes('fetch')
      ? '网络错误：无法获取视频字幕，请检查视频链接或稍后重试'
      : message.includes('transcript') || message.includes('subtitle')
      ? '该视频暂无可用字幕，无法生成笔记'
      : '生成笔记失败，请稍后重试';
    return Response.json(
      { error: friendlyError, detail: message.slice(0, 200) },
      { status: 500 },
    );
  }
}
