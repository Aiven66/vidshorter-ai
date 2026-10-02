import { NextRequest } from 'next/server';
import { fetchTranscript, type TranscriptDiagnostic } from '../generate/local-note-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 单次返回的最大行数（与 generate 路由一致） */
const TRANSCRIPT_MAX = 1500;

/** 轻量鉴权：仅要求可解析出 sub 的 bearer JWT（与 generate/translate 路由一致的信任策略） */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as Record<string, unknown>;
    return typeof decoded.sub === 'string' && decoded.sub ? decoded.sub : null;
  } catch {
    return null;
  }
}

/**
 * /api/video-notes/transcript — 只取逐字稿，不生成笔记、不扣积分。
 *
 * 用途：已保存的笔记详情页（/notes/[id]）。逐字稿不落库，打开「逐字稿」页签时
 * 按需按 videoUrl 实时拉取，避免为历史笔记存一份可能过期的字幕。
 */
export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !decodeJwtSub(token)) {
    return Response.json({ error: '请先登录后查看逐字稿', code: 'unauthorized' }, { status: 401 });
  }

  const videoUrl = String(body?.videoUrl || '').trim();
  const sourceType = String(body?.sourceType || '').trim();
  if (!videoUrl) {
    return Response.json({ error: '缺少视频链接', code: 'missing_video_url' }, { status: 400 });
  }
  if (sourceType !== 'youtube' && sourceType !== 'bilibili' && sourceType !== 'local') {
    return Response.json({ error: `不支持的视频来源：${sourceType || '(空)'}`, code: 'bad_source_type' }, { status: 400 });
  }

  const locale = typeof body?.locale === 'string' ? body.locale : undefined;
  try {
    const diag: TranscriptDiagnostic = { source: 'none', attempts: [] };
    const segments = await fetchTranscript(videoUrl, sourceType, locale, diag);
    console.log(
      `[video-notes/transcript] source=${diag.source} lines=${segments.length} attempts=${JSON.stringify(diag.attempts)}`,
    );
    return Response.json({
      segments: segments.slice(0, TRANSCRIPT_MAX).map((s) => ({
        start: Math.max(0, Math.round(s.start * 100) / 100),
        duration: Math.max(0, Math.round(s.duration * 100) / 100),
        text: s.text,
      })),
      transcriptTruncated: segments.length > TRANSCRIPT_MAX,
      transcriptDiag: diag,
    });
  } catch (err) {
    console.error('[video-notes/transcript] fetch failed:', err);
    return Response.json(
      {
        error: '逐字稿获取失败，请稍后重试',
        code: 'transcript_fetch_failed',
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      },
      { status: 502 },
    );
  }
}