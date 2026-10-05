/**
 * TikTok 官方 oEmbed 客户端。
 *
 * 只取元数据（标题 / 作者 / 封面），**不下载、不转存任何媒体文件**。
 * 1 小时内存缓存：同一链接重复请求（含爬虫）不再重复外呼，也降低被限流的概率。
 *
 * 参考：https://www.tiktok.com/oembed?url=<video_url>（官方公开接口，无需鉴权）
 */

export interface TikTokOEmbed {
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: TikTokOEmbed | null }>();

/** 仅保留测试/运维可见的缓存规模信息。 */
export function tiktokOEmbedCacheSize(): number {
  return cache.size;
}

/**
 * 拉取官方 oEmbed 元数据。失败（4xx / 超时 / 网络不可达）返回 null，
 * 由调用方标记 degraded 并回落到本地结构模版 —— 页面永不空转。
 */
export async function fetchTikTokOEmbed(
  canonicalUrl: string,
  timeoutMs = 5000,
): Promise<TikTokOEmbed | null> {
  const hit = cache.get(canonicalUrl);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let value: TikTokOEmbed | null = null;
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipopAI/1.0)' },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      },
    );
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const title = typeof json.title === 'string' ? json.title.trim() : '';
      const authorName = typeof json.author_name === 'string' ? json.author_name.trim() : '';
      const authorUrl = typeof json.author_url === 'string' ? json.author_url.trim() : '';
      const thumbnailUrl = typeof json.thumbnail_url === 'string' ? json.thumbnail_url.trim() : '';
      if (title || authorName) value = { title, authorName, authorUrl, thumbnailUrl };
    }
  } catch {
    value = null;
  }

  cache.set(canonicalUrl, { at: Date.now(), value });
  return value;
}