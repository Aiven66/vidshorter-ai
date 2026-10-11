/**
 * platforms.ts
 * Lightweight platform registry for the highlight-clipping pipeline.
 *
 * Pure data + pure functions only (no I/O), so it can be unit-tested with tsx
 * and imported from both the server pipeline and route handlers.
 *
 * Scope: public content only. Platforms flagged `needsLogin` frequently require
 * an authenticated session / hit anti-bot walls from serverless IPs — callers
 * should surface a clear error instead of fabricating highlight results.
 */

export type PlatformId =
  | 'youtube'
  | 'bilibili'
  | 'tiktok'
  | 'douyin'
  | 'xiaohongshu'
  | 'instagram'
  | 'vimeo'
  | 'twitter'
  | 'generic';

export interface Platform {
  id: PlatformId;
  /** Human-readable name used in error messages. */
  name: string;
  /** Hostname patterns (tested against `URL.hostname`). */
  hosts: RegExp[];
  /** yt-dlp header values, each applied via `--add-header`. */
  headers: string[];
  /** Value for yt-dlp `--sub-langs`. */
  subLangs: string;
  /** yt-dlp `-f` format selector. */
  format: string;
  /** Public content likely requires login / is blocked → fail fast & clearly. */
  needsLogin: boolean;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const DEFAULT_SUB_LANGS = 'en.*,en,zh.*,zh-Hans.*,zh-Hant.*';

/** Bilibili headers, reused by the yt-dlp runner (kept as raw header values). */
export const BILIBILI_HEADERS: string[] = [
  'Referer: https://www.bilibili.com/',
  'Origin: https://www.bilibili.com',
  'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
];

const YOUTUBE: Platform = {
  id: 'youtube',
  name: 'YouTube',
  hosts: [/(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i, /(^|\.)youtube-nocookie\.com$/i],
  headers: [],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'bestvideo*+bestaudio/best',
  needsLogin: false,
};

const BILIBILI: Platform = {
  id: 'bilibili',
  name: 'Bilibili',
  hosts: [/(^|\.)bilibili\.com$/i, /(^|\.)b23\.tv$/i, /(^|\.)b23\.wtf$/i],
  headers: BILIBILI_HEADERS,
  subLangs: 'zh-Hans,zh-Hant,zh,en.*',
  format: 'bestvideo*+bestaudio/best',
  needsLogin: false,
};

const TIKTOK: Platform = {
  id: 'tiktok',
  name: 'TikTok',
  hosts: [/(^|\.)tiktok\.com$/i, /(^|\.)vm\.tiktok\.com$/i, /(^|\.)vt\.tiktok\.com$/i],
  headers: [`User-Agent: ${UA}`, 'Referer: https://www.tiktok.com/'],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'best[ext=mp4]/best',
  needsLogin: false,
};

const DOUYIN: Platform = {
  id: 'douyin',
  name: '抖音 / Douyin',
  hosts: [/(^|\.)douyin\.com$/i, /(^|\.)iesdouyin\.com$/i],
  headers: [`User-Agent: ${UA}`, 'Referer: https://www.douyin.com/'],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'best[ext=mp4]/best',
  needsLogin: true,
};

const XIAOHONGSHU: Platform = {
  id: 'xiaohongshu',
  name: '小红书 / Xiaohongshu',
  hosts: [/(^|\.)xiaohongshu\.com$/i, /(^|\.)xhslink\.com$/i],
  headers: [`User-Agent: ${UA}`, 'Referer: https://www.xiaohongshu.com/'],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'best[ext=mp4]/best',
  needsLogin: true,
};

const INSTAGRAM: Platform = {
  id: 'instagram',
  name: 'Instagram',
  hosts: [/(^|\.)instagram\.com$/i, /(^|\.)instagr\.am$/i],
  headers: [`User-Agent: ${UA}`],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'best[ext=mp4]/best',
  needsLogin: true,
};

const VIMEO: Platform = {
  id: 'vimeo',
  name: 'Vimeo',
  hosts: [/(^|\.)vimeo\.com$/i],
  headers: [`User-Agent: ${UA}`],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'bestvideo*+bestaudio/best',
  needsLogin: false,
};

const TWITTER: Platform = {
  id: 'twitter',
  name: 'X / Twitter',
  hosts: [/(^|\.)twitter\.com$/i, /(^|\.)x\.com$/i, /(^|\.)t\.co$/i],
  headers: [`User-Agent: ${UA}`],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'best[ext=mp4]/best',
  needsLogin: true,
};

const GENERIC: Platform = {
  id: 'generic',
  name: 'Video',
  hosts: [],
  headers: [`User-Agent: ${UA}`],
  subLangs: DEFAULT_SUB_LANGS,
  format: 'bestvideo*+bestaudio/best',
  needsLogin: false,
};

export const PLATFORMS: Platform[] = [
  YOUTUBE,
  BILIBILI,
  TIKTOK,
  DOUYIN,
  XIAOHONGSHU,
  INSTAGRAM,
  VIMEO,
  TWITTER,
];

/** Detect the platform for a URL. Falls back to the generic descriptor. */
export function detectPlatform(url: string): Platform {
  try {
    const { hostname } = new URL(url);
    for (const p of PLATFORMS) {
      if (p.hosts.some((re) => re.test(hostname))) return p;
    }
  } catch {
    // Fall through to generic.
  }
  return GENERIC;
}

/** Short-link hosts whose real target must be resolved via an HTTP redirect. */
export function isShortLinkHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      /(^|\.)b23\.tv$/i.test(hostname) ||
      /(^|\.)v\.douyin\.com$/i.test(hostname) ||
      /(^|\.)xhslink\.com$/i.test(hostname) ||
      /(^|\.)vm\.tiktok\.com$/i.test(hostname) ||
      /(^|\.)vt\.tiktok\.com$/i.test(hostname) ||
      /(^|\.)t\.co$/i.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Map raw yt-dlp stderr into a clear, actionable error.
 * Never returns a "success" path — callers must surface this to the user.
 */
export function mapYtDlpError(stderr: string, platform: Platform): Error {
  const raw = (stderr || '').trim();
  const tail = raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0] || '';

  if (/sign in to confirm|login required|log in|not a bot|confirm you'?re not a bot|age.?restricted|private video/i.test(raw)) {
    return new Error(
      `${platform.name}: this video requires a signed-in account and cannot be downloaded anonymously. Please try a different public link.`,
    );
  }
  if (/unable to extract|unsupported url|no video formats|no suitable|not a valid url/i.test(raw)) {
    return new Error(
      `Could not parse this link (unsupported platform or invalid URL). Please try a different link.`,
    );
  }
  if (/http error 403|forbidden|access denied|blocked/i.test(raw)) {
    return new Error(
      `${platform.name}: access denied (403). The platform is blocking server requests — please try again later or use another link.`,
    );
  }
  if (/geo.?restrict|not available in your country|only available in/i.test(raw)) {
    return new Error(`${platform.name}: this video is region-restricted and cannot be downloaded.`);
  }
  if (/timed out|timeout/i.test(raw)) {
    return new Error(`${platform.name}: the download timed out. Try a shorter video or another link.`);
  }

  return new Error(
    `Failed to process this ${platform.name} link${tail ? ` (${tail})` : ''}. Please try a different link.`,
  );
}
