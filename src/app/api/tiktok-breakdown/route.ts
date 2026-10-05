import { NextRequest, NextResponse } from 'next/server';
import { resolveTikTokUrl } from '@/lib/server/tiktok/url';
import { fetchTikTokOEmbed } from '@/lib/server/tiktok/oembed';
import {
  buildLocalBreakdown,
  generateTikTokBreakdown,
  type TikTokBreakdown,
} from '@/lib/server/tiktok/breakdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TikTok 链接结构拆解（免费 / 匿名）。
 *
 * 合规：只用官方 oEmbed 取元数据，不下载、不转存、不代理任何媒体文件；
 * 响应始终带 authorName/authorUrl 供页面展示署名与回链。
 * 该端点是 SEO 落地页的引流钩子，因此不鉴权、不扣积分；
 * 成本控制靠「按 videoId+locale 缓存 + 按 IP 限流」，重复与爬虫流量不重复烧 token。
 */

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;

interface TikTokVideoMeta {
  videoId: string;
  canonicalUrl: string;
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
}

interface CachedBreakdown {
  at: number;
  video: TikTokVideoMeta;
  breakdown: TikTokBreakdown;
  engine: 'llm' | 'local';
  degraded: boolean;
}

const cache = new Map<string, CachedBreakdown>();

function readCache(key: string): CachedBreakdown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

function writeCache(key: string, value: CachedBreakdown): void {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, value);
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateHits = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateHits.set(ip, recent);
  if (rateHits.size > 5000) rateHits.clear();
  return false;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', detail: 'Too many requests, please try again in a minute.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const urlInput = typeof body.url === 'string' ? body.url.trim() : '';
  const locale = typeof body.locale === 'string' && body.locale ? body.locale : 'en';
  const topicHint = typeof body.topicHint === 'string' ? body.topicHint.trim().slice(0, 200) : '';

  if (!urlInput) {
    return NextResponse.json({ ok: false, error: 'invalid_tiktok_url' }, { status: 400 });
  }

  // 直链同步解析；短链只读 3xx 的 Location，绝不下载媒体
  const parsed = await resolveTikTokUrl(urlInput);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'invalid_tiktok_url' }, { status: 400 });
  }

  const cacheKey = `${parsed.videoId}:${locale}:${topicHint}`.slice(0, 300);
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json({ ok: true, ...cached, at: undefined, cached: true });
  }

  // 官方 oEmbed 取元数据；失败则标记 degraded 并用本地结构模版兜底（页面永不空转）
  const meta = await fetchTikTokOEmbed(parsed.canonicalUrl);
  const degraded = !meta;

  const result = meta
    ? await generateTikTokBreakdown({
        title: meta.title,
        author: meta.authorName,
        topicHint: topicHint || undefined,
        locale,
      })
    : {
        breakdown: buildLocalBreakdown({ topicHint: topicHint || undefined, locale }),
        engine: 'local' as const,
      };

  const value: CachedBreakdown = {
    at: Date.now(),
    video: {
      videoId: parsed.videoId,
      canonicalUrl: parsed.canonicalUrl,
      title: meta?.title || '',
      authorName: meta?.authorName || '',
      authorUrl: meta?.authorUrl || '',
      thumbnailUrl: meta?.thumbnailUrl || '',
    },
    breakdown: result.breakdown,
    engine: result.engine,
    degraded,
  };
  writeCache(cacheKey, value);

  return NextResponse.json({ ok: true, ...value, at: undefined, cached: false });
}