/**
 * TikTok 链接解析（纯函数直链解析 + 短链重定向解析）。
 *
 * 合规约束（硬要求）：本模块只做「URL 校验 + 读取 3xx 的 Location 头」，
 * 绝不下载、不转存、不代理任何 TikTok 媒体文件。
 */

const ALLOWED_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);

/** 需要解析重定向才能拿到 videoId 的短链域名。 */
const SHORT_LINK_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);

const VIDEO_PATH_RE = /\/@[\w.-]+\/video\/(\d+)/;
const VIDEO_PATH_LOOSE_RE = /\/video\/(\d+)/;

export interface ParsedTikTok {
  videoId: string;
  /** 归一化后的绝对 URL（去掉 query/hash），用于 oEmbed 请求与回链展示 */
  canonicalUrl: string;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

export function isAllowedTikTokHost(host: string): boolean {
  return ALLOWED_HOSTS.has(normalizeHost(host));
}

/** 是否为短链（必须先解析 3xx 才能拿到 videoId）。 */
export function isShortLink(input: string): boolean {
  try {
    const u = new URL((input || '').trim());
    return u.protocol === 'https:' && SHORT_LINK_HOSTS.has(normalizeHost(u.hostname));
  } catch {
    return false;
  }
}

/**
 * 同步解析直链。短链无法同步解析，返回 null（请改用 resolveTikTokUrl）。
 * 明确拒绝图文（/photo/）与音频（/music/）页面。
 */
export function parseTikTokUrl(input: string): ParsedTikTok | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!isAllowedTikTokHost(u.hostname)) return null;

  const path = u.pathname;
  if (/\/photo\//.test(path) || /\/music\//.test(path)) return null;

  const m = path.match(VIDEO_PATH_RE) || path.match(VIDEO_PATH_LOOSE_RE);
  const videoId = m?.[1];
  if (!videoId) return null;

  u.search = '';
  u.hash = '';
  return { videoId, canonicalUrl: u.toString() };
}

/**
 * 解析短链：只读取 3xx 的 Location 头，不跟随跳转到第三方，也不下载媒体。
 * 拿到目标地址后由调用方再次走 parseTikTokUrl 做白名单二次校验。
 */
async function resolveShortLink(input: string, timeoutMs = 4000): Promise<string | null> {
  if (!isShortLink(input)) return null;
  try {
    const res = await fetch(input, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipopAI/1.0)' },
      cache: 'no-store',
    });
    const location = res.headers.get('location');
    if (!location) return null;
    return new URL(location, input).toString();
  } catch {
    return null;
  }
}

/**
 * 完整解析：直链直接解析；短链先解出 Location，再解析并做白名单二次校验
 * （目标必须仍是 *.tiktok.com 且路径含 /video/{id}）。
 */
export async function resolveTikTokUrl(input: string): Promise<ParsedTikTok | null> {
  const direct = parseTikTokUrl(input);
  if (direct) return direct;
  if (!isShortLink(input)) return null;

  const resolved = await resolveShortLink(input);
  if (!resolved) return null;
  return parseTikTokUrl(resolved);
}