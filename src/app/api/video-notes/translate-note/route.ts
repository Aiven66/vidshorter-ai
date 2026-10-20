import { NextRequest } from 'next/server';
import { translateTexts } from '@/lib/server/subtitle-translate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 支持的目标语言白名单（与 /api/video-notes/translate 保持一致） */
const TARGET_LANGS: Record<string, string> = {
  'zh-Hans': 'Simplified Chinese (简体中文)',
  'zh-Hant': 'Traditional Chinese (繁體中文)',
  en: 'English',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ru: 'Russian (Русский)',
  pt: 'Portuguese (Português)',
  it: 'Italian (Italiano)',
  ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)',
  th: 'Thai (ไทย)',
  vi: 'Vietnamese (Tiếng Việt)',
};

/** 白名单语言代码 → Google gtx 目标代码 */
function mapToGoogleCode(code: string): string {
  if (code === 'zh-Hans') return 'zh-CN';
  if (code === 'zh-Hant') return 'zh-TW';
  return code;
}

/** 轻量鉴权：仅要求可解析出 sub 的 bearer JWT（与 translate 路由一致的信任策略） */
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
 * /api/video-notes/translate-note — 整篇笔记翻译（无 LLM Key，走无 Key 机器翻译引擎）。
 * 无需视频字幕，即使视频没有字幕也能翻译已生成的笔记。
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
    return Response.json({ error: '请先登录后使用翻译', code: 'unauthorized' }, { status: 401 });
  }

  const targetLang = String(body?.targetLang || '').trim();
  if (!TARGET_LANGS[targetLang]) {
    return Response.json(
      { error: `不支持的目标语言：${targetLang || '(空)'}`, code: 'unsupported_language' },
      { status: 400 },
    );
  }

  const summary = typeof body?.summary === 'string' ? body.summary : '';
  const highlights: string[] = Array.isArray(body?.highlights)
    ? body.highlights.filter((s: unknown) => typeof s === 'string').map((s: string) => s.slice(0, 2000))
    : [];
  const takeaways: string[] = Array.isArray(body?.takeaways)
    ? body.takeaways.filter((s: unknown) => typeof s === 'string').map((s: string) => s.slice(0, 2000))
    : [];
  const corePoints: Array<{ title: string; detail: string }> = Array.isArray(body?.corePoints)
    ? body.corePoints
        .filter((p: unknown) => p && typeof p === 'object')
        .map((p: any) => ({
          title: typeof p.title === 'string' ? p.title.slice(0, 2000) : '',
          detail: typeof p.detail === 'string' ? p.detail.slice(0, 2000) : '',
        }))
    : [];

  // 固定顺序：summary → highlights → takeaways → corePoint titles → corePoint details
  const texts: string[] = [summary];
  for (const h of highlights) texts.push(h);
  for (const t of takeaways) texts.push(t);
  for (const p of corePoints) texts.push(p.title);
  for (const p of corePoints) texts.push(p.detail);

  // 过滤空串，但保留"条目索引 → texts 索引"的映射，避免空行打乱行对齐
  const items: string[] = [];
  const indexMap: number[] = [];
  texts.forEach((text, i) => {
    if (text && text.trim()) {
      items.push(text);
      indexMap.push(i);
    }
  });

  if (items.length === 0) {
    return Response.json({ error: '笔记内容为空，无法翻译', code: 'empty_note' }, { status: 400 });
  }

  const tr = await translateTexts(items, mapToGoogleCode(targetLang)).catch(() => null);
  if (!tr || tr.length !== items.length) {
    return Response.json(
      { error: '翻译失败：翻译服务未返回有效结果，请稍后重试', code: 'translate_failed' },
      { status: 502 },
    );
  }

  const out = texts.slice();
  let untranslated = 0;
  tr.forEach((text, k) => {
    const original = items[k];
    if (text && text.trim() && text !== original) {
      out[indexMap[k]] = text;
    } else {
      untranslated += 1;
    }
  });

  let cursor = 1;
  const outHighlights = out.slice(cursor, cursor + highlights.length);
  cursor += highlights.length;
  const outTakeaways = out.slice(cursor, cursor + takeaways.length);
  cursor += takeaways.length;
  const outTitles = out.slice(cursor, cursor + corePoints.length);
  cursor += corePoints.length;
  const outDetails = out.slice(cursor, cursor + corePoints.length);
  const outCorePoints = corePoints.map((p, i) => ({
    title: outTitles[i] || p.title,
    detail: outDetails[i] || p.detail,
  }));

  return Response.json({
    summary: out[0] || summary,
    highlights: outHighlights,
    takeaways: outTakeaways,
    corePoints: outCorePoints,
    targetLang,
    untranslated,
  });
}
