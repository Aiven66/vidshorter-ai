/**
 * video-clipper.ts
 * Core server-side library for AI-powered video analysis and clip generation.
 * Supports YouTube and Bilibili (via yt-dlp + ffmpeg locally, or Piped proxy on Vercel).
 *
 * Architecture for serverless/Vercel:
 *  - Analysis: youtube-transcript package (official YT caption API, no bot detection)
 *              + Piped open-source proxy (title/duration/subtitles)
 *  - Download: Piped stream URL passed directly to ffmpeg (-i https://...)
 *              → no yt-dlp needed for YouTube on Vercel
 *  - Local dev: yt-dlp used as primary (faster, better quality)
 *  - All file I/O uses /tmp (writable on Vercel serverless)
 *  - ffmpeg resolved via @ffmpeg-installer/ffmpeg (cross-platform binary)
 *  - Clips served via /api/serve-clip/[filename] API route
 */

import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile, chmod, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import https from 'node:https';
import http from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';

const execFile = promisify(execFileCallback);

// ── Directories (writable on all platforms including serverless) ─────────────
const TMP_DIR = '/tmp';
const PUBLIC_CLIP_DIR = path.join(TMP_DIR, 'generated-clips');
const CACHE_DIR = path.join(TMP_DIR, 'video-cache');

// ── yt-dlp ───────────────────────────────────────────────────────────────────
const YT_DLP_BIN_PATH = path.join(TMP_DIR, 'yt-dlp');
const YT_DLP_LINUX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
const YT_DLP_DARWIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

// ── ffmpeg (cross-platform via @ffmpeg-installer/ffmpeg) ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller: { path: string } = require('@ffmpeg-installer/ffmpeg');

// ── Piped proxy instances (YouTube proxy, community-hosted) ──────────────────
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.yt',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.mha.fi',
  'https://watchapi.whatever.social',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.privacy.com.de',
];

// ── Invidious instances (alternative YouTube proxy) ───────────────────────────
const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://iv.datura.network',
  'https://invidious.lunar.icu',
  'https://yt.artemislena.eu',
];

// ── cobalt.tools instances (public self-hosted, no auth required) ────────────
// api.cobalt.tools now requires JWT auth; community instances are still open.
// We try multiple in order and fall back gracefully to other methods.
const COBALT_INSTANCES = [
  'https://cobalt.ggtyler.dev/',
  'https://cobalt.api.timelessnesses.me/',
];

function getCobaltInstances() {
  const urls = [...COBALT_INSTANCES];
  const token = (process.env.COBALT_API_TOKEN || process.env.COBALT_TOKEN || process.env.COBALT_API_KEY || '').trim();
  if (token) urls.push('https://api.cobalt.tools/');
  return urls;
}

function getCfWorkerUrl() {
  const raw = String(process.env['CF_WORKER_URL'] || process.env.CF_WORKER_URL || '').trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

function getCfWorkerMaxHeight() {
  const fallback = IS_VERCEL ? 720 : YOUTUBE_MAX_HEIGHT;
  return clampInt(process.env.CF_WORKER_MAX_HEIGHT, 144, 1080, fallback);
}

function getAppBaseUrl() {
  const raw =
    (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const value = raw || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!value) return '';
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProto.replace(/\/$/, '');
}

function getVercelProtectionBypassHeaders() {
  const secret =
    (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_BYPASS_SECRET || '').trim();
  return secret ? { 'x-vercel-protection-bypass': secret } : {};
}

function getBypassHeadersForUrl(url: string) {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) return {};
  if (!url.startsWith(baseUrl)) return {};
  return getVercelProtectionBypassHeaders();
}

function getBypassFfmpegHeaderString() {
  const headers = getVercelProtectionBypassHeaders();
  const secret = headers['x-vercel-protection-bypass'];
  return secret ? `x-vercel-protection-bypass: ${secret}\r\n` : '';
}

// Cookie files (local macOS dev only)
const COOKIE_FILE_PATH = path.join(CACHE_DIR, 'yt-cookies.txt');
const CHROME_COOKIE_DB = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Default/Cookies',
);

// ── Types ────────────────────────────────────────────────────────────────────
interface Highlight {
  title: string;
  start_time: number;
  end_time: number;
  summary: string;
  engagement_score: number;
}

interface VideoAnalysisResult {
  duration: number;
  title: string;
  highlights: Highlight[];
}

interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

interface ClipResult {
  outputPath: string;
  publicUrl: string;       // serve-clip URL (fallback for large clips)
  dataUrl: string;         // base64 data URL (preferred — works across Lambda invocations)
  thumbnailUrl: string;
}

interface PreparedSource {
  inputPath: string;
  ffmpegHeaders?: string;
}

interface PipedVideoInfo {
  title: string;
  duration: number;
  streamUrl: string;
  subtitleUrl: string | null;
}

// ── Clip config ──────────────────────────────────────────────────────────────
const CLIP_TARGET_DURATION = 60;
const CLIP_MIN_DURATION = 45;
const CLIP_MAX_DURATION = 65;
const MAX_HIGHLIGHTS = 10;

const IS_VERCEL = !!process.env.VERCEL;
const VERCEL_MAX_HIGHLIGHTS = 3;
const SHOULD_INLINE_CLIPS = IS_VERCEL || process.env.INLINE_CLIPS === '1';
const FORCE_YOUTUBE_STREAM_FALLBACKS = IS_VERCEL || process.env.PREFER_EDGE_YOUTUBE === '1' || process.env.FORCE_YOUTUBE_STREAM === '1';

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function ensureEven(n: number) {
  return n % 2 === 0 ? n : n - 1;
}

const VERCEL_CRF = String(clampInt(process.env.VERCEL_CLIP_CRF, 18, 40, 23));
const VERCEL_TARGET_WIDTH_NUM = ensureEven(clampInt(process.env.VERCEL_CLIP_WIDTH, 640, 1920, 1920));
const VERCEL_TARGET_HEIGHT_NUM = ensureEven(clampInt(process.env.VERCEL_CLIP_HEIGHT, 360, 1080, 1080));
const VERCEL_TARGET_WIDTH = String(VERCEL_TARGET_WIDTH_NUM);
const VERCEL_TARGET_HEIGHT = String(VERCEL_TARGET_HEIGHT_NUM);
const VERCEL_SCALE = `scale=trunc(min(iw\\,${VERCEL_TARGET_WIDTH})/2)*2:trunc(min(ih\\,${VERCEL_TARGET_HEIGHT})/2)*2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;

const MAX_INLINE_BYTES = 25 * 1024 * 1024; // 25 MB
const LOCAL_MAX_HEIGHT = process.env.CLIP_MAX_HEIGHT || '1080';
const YOUTUBE_MAX_HEIGHT = parseInt(
  process.env.YOUTUBE_MAX_HEIGHT || (IS_VERCEL ? '1080' : LOCAL_MAX_HEIGHT),
  10,
) || (IS_VERCEL ? 1080 : 1080);

// ── URL helpers ──────────────────────────────────────────────────────────────
function isYouTubeUrl(videoUrl: string) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  } catch { return false; }
}

function isBilibiliUrl(videoUrl: string) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes('bilibili.com') || hostname.includes('b23.tv');
  } catch { return false; }
}

function isValidYouTubeVideoId(value: string | null | undefined) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const vParam = u.searchParams.get('v');
    if (isValidYouTubeVideoId(vParam)) return vParam;

    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return isValidYouTubeVideoId(id) ? id : null;
    }

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['shorts', 'embed', 'live'].includes(parts[0])) {
      const id = parts[1];
      return isValidYouTubeVideoId(id) ? id : null;
    }

    const maybeId = parts[0];
    return isValidYouTubeVideoId(maybeId) ? maybeId : null;
  } catch { return null; }
}

async function resolveFinalUrl(inputUrl: string): Promise<string> {
  try {
    const res = await fetch(inputUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    res.body?.cancel();
    return res.url || inputUrl;
  } catch {
    return inputUrl;
  }
}

async function normalizeVideoUrl(videoUrl: string): Promise<string> {
  const trimmed = videoUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('b23.tv')) {
      return await resolveFinalUrl(trimmed);
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

// ── Highlight utils ──────────────────────────────────────────────────────────
function sourceId(videoUrl: string) {
  return createHash('sha1').update(videoUrl).digest('hex');
}

function clipFileName(title: string) {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${safe || 'highlight'}-${randomUUID()}.mp4`;
}

function thumbFileName(clipFile: string) {
  return clipFile.replace(/\.mp4$/, '.jpg');
}

function formatSeconds(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const head = hours > 0 ? `${String(hours).padStart(2, '0')}:` : '';
  return `${head}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseVttTimestamp(value: string) {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function cleanCueText(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeHighlights(input: Highlight[], duration: number) {
  const safeDuration = Math.max(duration, 60);
  const normalized = input
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const title =
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim().slice(0, 80)
          : `Highlight ${index + 1}`;
      const summary =
        typeof item.summary === 'string' && item.summary.trim()
          ? item.summary.trim().slice(0, 160)
          : 'Automatically selected highlight from the source video.';
      const score = Number.isFinite(item.engagement_score)
        ? Math.max(1, Math.min(10, Math.round(item.engagement_score)))
        : 7;

      let start = Number.isFinite(item.start_time) ? Math.floor(item.start_time) : 0;
      let end = Number.isFinite(item.end_time)
        ? Math.ceil(item.end_time)
        : start + CLIP_TARGET_DURATION;

      start = Math.max(0, Math.min(start, Math.max(0, safeDuration - CLIP_MIN_DURATION)));
      end = Math.max(start + CLIP_MIN_DURATION, Math.min(end, safeDuration));
      if (end - start > CLIP_MAX_DURATION) end = start + CLIP_MAX_DURATION;
      if (end > safeDuration) {
        end = safeDuration;
        start = Math.max(0, end - CLIP_TARGET_DURATION);
      }
      return { title, summary, engagement_score: score, start_time: start, end_time: end };
    })
    .sort((a, b) => a.start_time - b.start_time);

  const deduped: Highlight[] = [];
  for (const h of normalized) {
    const prev = deduped[deduped.length - 1];
    if (!prev) { deduped.push(h); continue; }
    const adjustedStart = Math.max(h.start_time, prev.end_time);
    const adjustedEnd = Math.min(safeDuration, Math.max(adjustedStart + CLIP_MIN_DURATION, h.end_time));
    if (adjustedEnd - adjustedStart < CLIP_MIN_DURATION) continue;
    deduped.push({
      ...h,
      start_time: adjustedStart,
      end_time: Math.min(adjustedEnd, adjustedStart + CLIP_MAX_DURATION),
    });
  }
  return deduped.slice(0, MAX_HIGHLIGHTS);
}

function buildFallbackHighlights(duration: number) {
  const safeDuration = Math.max(duration, 120);
  const maxClips = Math.min(MAX_HIGHLIGHTS, Math.floor(safeDuration / (CLIP_MIN_DURATION + 10)));
  const clipCount = Math.max(2, maxClips);
  const spacing = Math.floor(safeDuration / (clipCount + 1));
  return normalizeHighlights(
    Array.from({ length: clipCount }, (_, i) => {
      const start = Math.max(0, spacing * (i + 1) - Math.floor(CLIP_TARGET_DURATION / 2));
      return {
        title: `Highlight ${i + 1}`,
        start_time: start,
        end_time: Math.min(start + CLIP_TARGET_DURATION, safeDuration),
        summary: `Automatically selected highlight ${i + 1}`,
        engagement_score: 7,
      };
    }),
    duration,
  );
}

function buildHeuristicHighlights(cues: CaptionCue[], duration: number) {
  if (cues.length === 0) return buildFallbackHighlights(duration);
  const windows: Highlight[] = [];
  const step = 20;
  const len = CLIP_TARGET_DURATION;
  const keywords = [
    'important', 'secret', 'best', 'amazing', 'crazy', 'must', 'mistake', 'learn',
    '关键', '重点', '一定', '震惊', '厉害', '方法', '秘诀', '技巧',
  ];
  for (let start = 0; start < Math.max(duration - CLIP_MIN_DURATION, 1); start += step) {
    const end = Math.min(duration, start + len);
    const text = cues
      .filter((c) => c.end >= start && c.start <= end)
      .map((c) => c.text)
      .join(' ')
      .trim();
    if (!text) continue;
    const keywordScore = keywords.reduce((s, kw) => s + (text.toLowerCase().includes(kw.toLowerCase()) ? 2 : 0), 0);
    const punctuationScore = (text.match(/[!?！？]/g) || []).length;
    const densityScore = Math.min(8, Math.floor(text.length / 80));
    const score = 4 + keywordScore + punctuationScore + densityScore;
    const title =
      text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ') ||
      `Highlight at ${formatSeconds(start)}`;
    windows.push({ title: title.slice(0, 80), start_time: start, end_time: end, summary: text.slice(0, 140), engagement_score: Math.min(10, score) });
  }
  windows.sort((a, b) => b.engagement_score - a.engagement_score);
  const targetCount = Math.min(MAX_HIGHLIGHTS, Math.max(5, Math.round(duration / 90)));
  const selected: Highlight[] = [];
  for (const c of windows) {
    if (!selected.some(
      (s) => Math.max(s.start_time, c.start_time) < Math.min(s.end_time, c.end_time)
    )) selected.push(c);
    if (selected.length === targetCount) break;
  }
  return normalizeHighlights(selected.length >= 2 ? selected : buildFallbackHighlights(duration), duration);
}

// ── Ensure dirs ──────────────────────────────────────────────────────────────
async function ensureDirectories() {
  await mkdir(PUBLIC_CLIP_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
}

// ── ffmpeg ───────────────────────────────────────────────────────────────────
async function ensureFfmpegAvailable(): Promise<string> {
  // 1. @ffmpeg-installer/ffmpeg bundled binary
  try {
    const fp = ffmpegInstaller.path;
    await access(fp, fsConstants.X_OK);
    return fp;
  } catch { /* fall through */ }
  // 2. System PATH ffmpeg
  try {
    const { stdout } = await execFile('which', ['ffmpeg']);
    const fp = stdout.trim();
    if (fp) { await access(fp, fsConstants.X_OK); return fp; }
  } catch { /* fall through */ }
  throw new Error('ffmpeg is not available.');
}

// ── yt-dlp binary ────────────────────────────────────────────────────────────
let ytDlpCommand: string | null = null;
let ytDlpUseModule = false;

async function canUsePythonYtDlpModule(): Promise<boolean> {
  try {
    const { stdout } = await execFile('python3', ['-c', 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'], {
      timeout: 5000,
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
    });
    const [major, minor] = stdout.trim().split('.').map((x) => parseInt(x, 10));
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
    return major > 3 || (major === 3 && minor >= 10);
  } catch {
    return false;
  }
}

async function ensureYtDlp(): Promise<void> {
  if (ytDlpCommand) return;
  // 1. python3 -m yt_dlp (local macOS)
  try {
    if (await canUsePythonYtDlpModule()) {
      await execFile('python3', ['-m', 'yt_dlp', '--version'], {
        timeout: 8000, env: { ...process.env, PYTHONWARNINGS: 'ignore' },
      });
      ytDlpCommand = 'python3'; ytDlpUseModule = true;
      console.log('yt-dlp: using python3 -m yt_dlp');
      return;
    }
  } catch { /* fall through */ }
  // 2. Standalone binary in PATH
  try {
    await execFile('yt-dlp', ['--version'], { timeout: 5000 });
    ytDlpCommand = 'yt-dlp'; ytDlpUseModule = false;
    console.log('yt-dlp: using system binary');
    return;
  } catch { /* fall through */ }
  // 3. Cached binary in /tmp
  try {
    await access(YT_DLP_BIN_PATH, fsConstants.X_OK);
    await execFile(YT_DLP_BIN_PATH, ['--version'], { timeout: 5000 });
    ytDlpCommand = YT_DLP_BIN_PATH; ytDlpUseModule = false;
    console.log(`yt-dlp: using cached binary at ${YT_DLP_BIN_PATH}`);
    return;
  } catch { /* fall through */ }
  // 4. Download standalone binary
  const downloadUrl = process.platform === 'linux'
    ? YT_DLP_LINUX_URL
    : (process.platform === 'darwin' ? YT_DLP_DARWIN_URL : '');

  if (downloadUrl) {
    console.log('Downloading yt-dlp binary…');
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(YT_DLP_BIN_PATH, Buffer.from(await res.arrayBuffer()));
      await chmod(YT_DLP_BIN_PATH, 0o755);
      await execFile(YT_DLP_BIN_PATH, ['--version'], { timeout: 10000 });
      ytDlpCommand = YT_DLP_BIN_PATH; ytDlpUseModule = false;
      console.log('yt-dlp: downloaded standalone binary');
      return;
    } catch (err) {
      console.error('Failed to download yt-dlp:', err);
    }
  }
  throw new Error('yt-dlp not available. Install with: pip3 install yt-dlp');
}

async function runYtDlp(args: string[], isBilibili = false) {
  await ensureYtDlp();
  const ffmpegPath = await ensureFfmpegAvailable().catch(() => '');
  const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : '';

  const commonArgs = [
    '--no-check-certificate', '--ignore-errors', '--socket-timeout', '30',
    '--retries', '3', '--fragment-retries', '3',
    '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
    ...(isBilibili ? [
      '--add-header', 'Referer: https://www.bilibili.com/',
      '--add-header', 'Origin: https://www.bilibili.com',
      '--add-header', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    ] : []),
  ];

  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: 'ignore' };
  if (ffmpegDir) env.PATH = `${ffmpegDir}:${process.env.PATH || ''}`;
  if (!process.env.HTTP_PROXY) delete env.HTTP_PROXY;
  if (!process.env.HTTPS_PROXY) delete env.HTTPS_PROXY;
  if (!process.env.ALL_PROXY) delete env.ALL_PROXY;

  const [cmd, cmdArgs] = ytDlpUseModule
    ? ['python3', ['-m', 'yt_dlp', ...commonArgs, ...args]]
    : [ytDlpCommand!, [...commonArgs, ...args]];

  return execFile(cmd, cmdArgs, {
    cwd: CACHE_DIR, maxBuffer: 30 * 1024 * 1024, timeout: 15 * 60 * 1000, env,
  });
}

async function getYouTubeStreamUrlViaYtDlp(videoId: string): Promise<string> {
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const maxH = Math.max(144, Math.min(720, YOUTUBE_MAX_HEIGHT));
  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];
  const args = [
    ...proxyArg,
    '--no-playlist',
    '--extractor-args', 'youtube:player_client=android',
    '-f', `best[ext=mp4][height<=${maxH}]/best[height<=${maxH}]/best`,
    '-g',
    videoUrl,
  ];

  const r = await runYtDlp(args, false);
  const lines = String(r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const url = lines.find((l) => /^https?:\/\//i.test(l)) || '';
  if (!url) {
    throw new Error('yt-dlp did not return a stream URL');
  }
  return url;
}

// ── Piped proxy (YouTube stream URLs, bypasses bot detection) ────────────────
async function getYouTubeInfoViaPiped(videoId: string): Promise<PipedVideoInfo> {
  let lastError = 'No Piped instance reachable';
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VidShorter/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }

      const data = await res.json() as {
        title?: string;
        duration?: number;
        videoStreams?: Array<{ url: string; quality?: string; mimeType?: string; videoOnly?: boolean }>;
        subtitles?: Array<{ url: string; mimeType?: string; code?: string; autoGenerated?: boolean }>;
      };

      const combined = (data.videoStreams || []).filter(s => !s.videoOnly && s.mimeType?.includes('mp4'));
      const parseQuality = (value?: string) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const stream =
        combined
          .map(s => ({ s, q: parseQuality(s.quality) }))
          .filter(item => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT)
          .sort((a, b) => b.q - a.q)[0]?.s
        || combined
          .map(s => ({ s, q: parseQuality(s.quality) }))
          .sort((a, b) => b.q - a.q)[0]?.s
        || (data.videoStreams || [])[0];

      if (!stream?.url) { lastError = `${instance}: no stream URL in response`; continue; }

      // Find subtitle/caption URL (prefer English or auto-generated)
      const subtitle = (data.subtitles || []).find(s =>
        (s.code === 'en' || s.code?.startsWith('en') || s.autoGenerated) && s.mimeType?.includes('vtt')
      ) || (data.subtitles || []).find(s => s.mimeType?.includes('vtt'))
        || data.subtitles?.[0];

      console.log(`Piped success (${instance}): "${data.title?.slice(0, 50)}", stream: ${stream.quality}`);
      return {
        title: data.title || 'YouTube video',
        duration: data.duration || 300,
        streamUrl: stream.url,
        subtitleUrl: subtitle?.url || null,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`Piped ${instance} failed: ${lastError}`);
    }
  }
  throw new Error(`All Piped instances failed. Last error: ${lastError}`);
}

// ── Invidious API (alternative YouTube proxy, returns direct googlevideo.com URLs) ─
async function getYouTubeInfoViaInvidious(videoId: string): Promise<PipedVideoInfo> {
  let lastError = 'No instance tried';
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=title,lengthSeconds,formatStreams`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VidShorter/1.0)' },
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }
      const data = await res.json() as {
        title?: string;
        lengthSeconds?: number;
        formatStreams?: Array<{ url: string; container?: string; qualityLabel?: string }>;
      };
      const streams = (data.formatStreams || []).filter(f => f.url);
      const parseQuality = (value?: string) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const stream =
        streams
          .map(s => ({ s, q: parseQuality(s.qualityLabel) }))
          .filter(item => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT)
          .sort((a, b) => b.q - a.q)[0]?.s
        || streams
          .map(s => ({ s, q: parseQuality(s.qualityLabel) }))
          .sort((a, b) => b.q - a.q)[0]?.s;
      if (!stream?.url) { lastError = `${instance}: no stream found`; continue; }
      console.log(`Invidious (${instance}): "${(data.title || '').slice(0, 50)}"`);
      return {
        title: data.title || 'YouTube Video',
        duration: data.lengthSeconds || 300,
        streamUrl: stream.url,
        subtitleUrl: null,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`Invidious ${instance} failed: ${lastError}`);
    }
  }
  throw new Error(`All Invidious instances failed. Last: ${lastError}`);
}

// ── YouTube.js (direct InnerTube API, TV_EMBEDDED client bypasses PO token requirement) ─
async function getYouTubeInfoViaYouTubeJs(videoId: string): Promise<PipedVideoInfo> {
  let lastError = 'not tried';
  // TV_EMBEDDED and TV clients don't require PO tokens and are less aggressively blocked
  const clientTypes = ['TV_EMBEDDED', 'TV', 'ANDROID', 'IOS'] as const;

  for (const ct of clientTypes) {
    try {
      console.log(`YouTube.js trying client: ${ct}…`);
      // Dynamic import — avoids bundling, youtubei.js is in serverExternalPackages
      const { Innertube, UniversalCache } = await import('youtubei.js');
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await (yt as any).getBasicInfo(videoId, ct);
      const title: string = info?.basic_info?.title ?? 'YouTube Video';
      const duration: number = info?.basic_info?.duration ?? 300;

      const allFormats: Array<{
        has_audio?: boolean;
        has_video?: boolean;
        mime_type?: string;
        url?: string;
        quality_label?: string;
        height?: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decipher?: (player: any) => string;
      }> = [
        ...(info?.streaming_data?.formats ?? []),
        ...(info?.streaming_data?.adaptive_formats ?? []),
      ];

      const parseQuality = (value?: string) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const candidates = allFormats.filter(f => f.has_audio && f.has_video && f.url);
      const mp4 = candidates.filter(f => f.mime_type?.startsWith('video/mp4'));
      const withQ = (arr: typeof candidates) =>
        arr.map(f => ({ f, q: f.height || parseQuality(f.quality_label) })).filter(x => x.q > 0);
      const pickBest = (arr: typeof candidates) =>
        withQ(arr)
          .filter(x => x.q <= YOUTUBE_MAX_HEIGHT)
          .sort((a, b) => b.q - a.q)[0]?.f
        || withQ(arr).sort((a, b) => b.q - a.q)[0]?.f
        || arr[0];
      const format = pickBest(mp4.length ? mp4 : candidates) ?? allFormats[0];

      if (!format) { lastError = `${ct}: no format found`; continue; }

      let streamUrl = '';
      if (typeof format.decipher === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        streamUrl = format.decipher((yt as any).session?.player) || format.url || '';
      } else {
        streamUrl = format.url || '';
      }

      if (!streamUrl) { lastError = `${ct}: empty URL after decipher`; continue; }

      console.log(`YouTube.js success (${ct}): "${title.slice(0, 50)}"`);
      return { title, duration, streamUrl, subtitleUrl: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`YouTube.js ${ct} failed: ${lastError}`);
    }
  }
  throw new Error(`YouTube.js all clients failed. Last: ${lastError}`);
}

// ── cobalt.tools API (YouTube + Bilibili download, non-datacenter IPs) ────────
// cobalt.tools is an open-source download service whose servers are NOT blocked
// by YouTube or Bilibili, making it the most reliable fallback on Vercel.
// Crucially, cobalt.tools handles age-restricted YouTube videos via its own
// server-side cookie management — no per-user auth required.
// We cycle through multiple public instances in case one requires JWT auth.
async function getYouTubeInfoViaCobalt(videoId: string): Promise<PipedVideoInfo> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const body = JSON.stringify({
    url: videoUrl,
    videoQuality: String(Math.min(YOUTUBE_MAX_HEIGHT, 1080)),
    youtubeVideoCodec: 'h264',
    audioBitrate: '128',
  });
  let lastError = 'no instances tried';

  for (const instance of getCobaltInstances()) {
    try {
      const res = await fetch(instance, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }

      const data = await res.json() as {
        status: string;
        url?: string;
        filename?: string;
        error?: { code?: string; context?: Record<string, unknown> };
      };
      if (data.status === 'error' || !data.url) {
        lastError = `${instance}: ${data.error?.code ?? data.status ?? 'no url'}`;
        continue;
      }

      // Get title from oEmbed (best-effort)
      let title = 'YouTube Video';
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
          { signal: AbortSignal.timeout(6000) },
        );
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json() as { title?: string };
          title = oembedData.title || title;
        }
      } catch { /* oEmbed is best-effort */ }

      console.log(`cobalt (${instance}) YouTube: status=${data.status}, title="${title.slice(0, 50)}"`);
      return { title, duration: 300, streamUrl: data.url, subtitleUrl: null };
    } catch (err) {
      lastError = `${instance}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
    }
  }
  throw new Error(`All cobalt instances failed for YouTube. Last: ${lastError}`);
}

// ── Cloudflare Worker proxy (optional — set CF_WORKER_URL env var) ────────────
// The CF Worker calls YouTube InnerTube API from Cloudflare's IP space,
// which YouTube does not block. Deploy the worker from /cf-worker/.
async function getYouTubeInfoViaCFWorker(videoId: string): Promise<PipedVideoInfo> {
  const cfWorkerUrl = getCfWorkerUrl();
  if (!cfWorkerUrl) throw new Error('CF_WORKER_URL not configured');
  const maxHeight = getCfWorkerMaxHeight();

  const u = new URL(cfWorkerUrl);
  u.pathname = `${u.pathname.replace(/\/$/, '')}/resolve`;
  u.searchParams.set('videoId', videoId);
  u.searchParams.set('maxHeight', String(maxHeight));
  const endpoint = u.toString();
  const fetchResolved = async () => fetch(endpoint, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(25_000),
  });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    res = await fetchResolved();
    if (res.ok) break;
    if (![429, 500, 502, 503, 504].includes(res.status)) break;
    await new Promise<void>((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  if (!res) throw new Error('CF Worker: empty response');

  if (!res.ok) {
    let details = '';
    try {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const d = await res.json() as { error?: string; details?: string };
        details = [d.error, d.details].filter(Boolean).join(' | ').slice(0, 220);
      } else {
        details = (await res.text()).slice(0, 220);
      }
    } catch {}
    throw new Error(`CF Worker returned HTTP ${res.status}${details ? `: ${details}` : ''}`);
  }

  const data = await res.json() as {
    title?: string;
    duration?: number;
    streamUrl?: string;
    quality?: string;
    client?: string;
    error?: string;
  };

  if (!data.streamUrl) throw new Error(data.error ?? 'CF Worker: missing streamUrl');

  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, '')}/stream`;
  streamEndpoint.searchParams.set('videoId', videoId);
  streamEndpoint.searchParams.set('maxHeight', String(maxHeight));

  console.log(`CF Worker success: "${(data.title ?? '').slice(0, 50)}", client=${data.client}, quality=${data.quality}`);
  return {
    title: data.title || 'YouTube Video',
    duration: data.duration || 300,
    streamUrl: streamEndpoint.toString(),
    subtitleUrl: null,
  };
}

// ── Vercel Edge Function proxy (/api/yt-stream) ───────────────────────────────
// The edge function runs on Vercel's global CDN nodes (non-AWS, non-datacenter
// IPs) that YouTube does NOT block.  The serverless function calls its own
// co-deployed edge function to resolve the stream URL from safe IPs.
// VERCEL_URL is automatically injected by Vercel (e.g. "projects-pi-kohl.vercel.app").
async function getYouTubeInfoViaEdgeFunction(videoId: string): Promise<PipedVideoInfo> {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) throw new Error('APP_BASE_URL/NEXT_PUBLIC_APP_URL/VERCEL_URL env var not set — edge function unavailable');

  const endpoint = `${baseUrl}/api/yt-stream?videoId=${encodeURIComponent(videoId)}`;
  const res = await fetch(endpoint, {
    headers: { Accept: 'application/json', ...getVercelProtectionBypassHeaders() },
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) throw new Error(`Edge function HTTP ${res.status}`);

  const data = await res.json() as {
    title?: string;
    duration?: number;
    streamUrl?: string;
    quality?: string;
    client?: string;
    error?: string;
  };

  if (!data.streamUrl) throw new Error(data.error ?? 'Edge function: missing streamUrl');

  const proxyUrl = `${baseUrl}/api/yt-proxy?videoId=${encodeURIComponent(videoId)}&maxHeight=${encodeURIComponent(String(YOUTUBE_MAX_HEIGHT))}`;
  console.log(
    `Edge function success: "${(data.title ?? '').slice(0, 50)}", ` +
    `client=${data.client}, quality=${data.quality}`,
  );
  return {
    title: data.title || 'YouTube Video',
    duration: data.duration || 300,
    streamUrl: proxyUrl,
    subtitleUrl: null,
  };
}

// ── InnerTube response cache (per function invocation) ───────────────────────
// On Vercel, both the analysis path and the download path call InnerTube for
// the same videoId within milliseconds of each other.  Making two requests in
// rapid succession from the same datacenter IP often triggers LOGIN_REQUIRED
// on the second call.  This in-memory cache (valid 30 min) ensures we only hit
// InnerTube once per invocation and reuse the result for both steps.
const innerTubeCache = new Map<string, { result: PipedVideoInfo; expiresAt: number }>();

// ── Direct InnerTube API (raw HTTP, no youtubei.js dependency) ────────────────
// Makes direct calls to YouTube's InnerTube API using mobile/TV clients.
// Mobile clients (IOS/ANDROID) return stream URLs without cipher encryption.
// Uses current app versions to avoid HTTP 400 rejections.
async function getYouTubeInfoViaDirectInnerTube(videoId: string): Promise<PipedVideoInfo> {
  // Check cache — avoids a second InnerTube request when both the analysis and
  // download paths call this for the same videoId within the same invocation.
  const cached = innerTubeCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`DirectInnerTube cache hit for ${videoId}`);
    return cached.result;
  }

  // Multiple client configurations to try — use current iOS/Android app versions
  const ytCookies = (process.env.YOUTUBE_COOKIES || '').trim();

  // Build cookie header string from Netscape format if needed
  let cookieHeader = '';
  if (ytCookies) {
    if (ytCookies.includes('\t')) {
      cookieHeader = ytCookies
        .split('\n')
        .filter((l: string) => !l.startsWith('#') && l.trim())
        .map((l: string) => { const p = l.split('\t'); return p.length >= 7 ? `${p[5]}=${p[6]}` : ''; })
        .filter(Boolean)
        .join('; ');
    } else {
      cookieHeader = ytCookies;
    }
  }

  const clients = [
    // WEB client with auth cookies (highest priority when available — handles age-restricted)
    ...(cookieHeader ? [{
      name: 'WEB_COOKIES',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': '2.20240101.00.00',
        'Cookie': cookieHeader,
      },
      context: {
        client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
      },
    }] : []),
    // ANDROID_VR — bypasses age restrictions on some content
    {
      name: 'ANDROID_VR',
      headers: {
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-Youtube-Client-Name': '28',
        'X-Youtube-Client-Version': '1.57.29',
      },
      context: {
        client: {
          clientName: 'ANDROID_VR', clientVersion: '1.57.29',
          androidSdkVersion: 32, hl: 'en', gl: 'US',
        },
      },
    },
    {
      name: 'IOS_v20',
      headers: {
        'User-Agent': 'com.google.ios.youtube/20.03.03 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
        'X-Youtube-Client-Name': '5',
        'X-Youtube-Client-Version': '20.03.03',
      },
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '20.03.03',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
          hl: 'en',
          gl: 'US',
          clientFormFactor: 'SMALL_FORM_FACTOR',
        },
      },
    },
    {
      name: 'ANDROID_v20',
      headers: {
        'User-Agent': 'com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip',
        'X-Youtube-Client-Name': '3',
        'X-Youtube-Client-Version': '20.03.03',
      },
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.03.03',
          androidSdkVersion: 34,
          hl: 'en',
          gl: 'US',
          clientFormFactor: 'SMALL_FORM_FACTOR',
        },
      },
    },
    {
      name: 'IOS_v19',
      headers: {
        'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
        'X-Youtube-Client-Name': '5',
        'X-Youtube-Client-Version': '19.29.1',
      },
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '19.29.1',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '17.5.1.21F90',
          hl: 'en',
          gl: 'US',
        },
      },
    },
    {
      name: 'ANDROID_TESTSUITE',
      headers: {
        'User-Agent': 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
        'X-Youtube-Client-Name': '30',
        'X-Youtube-Client-Version': '1.9',
      },
      context: {
        client: {
          clientName: 'ANDROID_TESTSUITE',
          clientVersion: '1.9',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
        },
      },
    },
  ];

  const errors: string[] = [];
  for (const client of clients) {
    try {
      const body = {
        videoId,
        context: client.context,
        playbackContext: {
          contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' },
        },
      };

      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          ...client.headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(18_000),
      });

      if (!res.ok) {
        errors.push(`${client.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as {
        videoDetails?: { title?: string; lengthSeconds?: string };
        streamingData?: {
          formats?: Array<{
            url?: string; signatureCipher?: string;
            mimeType?: string; qualityLabel?: string; quality?: string;
            audioQuality?: string; audioChannels?: number;
          }>;
          adaptiveFormats?: Array<{
            url?: string; signatureCipher?: string;
            mimeType?: string; qualityLabel?: string; quality?: string;
            audioQuality?: string; audioChannels?: number;
          }>;
        };
        playabilityStatus?: { status?: string; reason?: string };
      };

      const ps = data.playabilityStatus?.status;
      if (ps && ps !== 'OK') {
        errors.push(`${client.name}: ${ps} (${data.playabilityStatus?.reason ?? ''})`);
        continue;
      }

      const allFormats = [
        ...(data.streamingData?.formats ?? []),
        ...(data.streamingData?.adaptiveFormats ?? []),
      ];

      if (!allFormats.length) {
        errors.push(`${client.name}: no formats in response`);
        continue;
      }

      // Prefer combined audio+video MP4 with direct URL (not cipher)
      const combined = allFormats.filter(f =>
        f.url && f.mimeType?.startsWith('video/mp4') && (f.audioQuality || f.audioChannels)
      );
      const parseQuality = (value?: string) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const format =
        combined
          .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
          .filter(item => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT)
          .sort((a, b) => b.q - a.q)[0]?.f
        || combined
          .map(f => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) }))
          .sort((a, b) => b.q - a.q)[0]?.f
        || combined[0]
        || allFormats.find(f => f.url);

      if (!format?.url) {
        const hasCipher = allFormats.some(f => f.signatureCipher);
        errors.push(`${client.name}: no direct URL${hasCipher ? ' (cipher-only)' : ''}`);
        continue;
      }

      const title = data.videoDetails?.title ?? 'YouTube Video';
      const dur = parseInt(data.videoDetails?.lengthSeconds ?? '300', 10);
      console.log(`DirectInnerTube (${client.name}): "${title.slice(0, 50)}", quality=${format.qualityLabel ?? format.quality}`);
      const result: PipedVideoInfo = {
        title,
        duration: Number.isFinite(dur) ? dur : 300,
        streamUrl: format.url,
        subtitleUrl: null,
      };
      // Populate cache — the download path will reuse this without a second request
      innerTubeCache.set(videoId, { result, expiresAt: Date.now() + 30 * 60 * 1000 });
      return result;
    } catch (err) {
      errors.push(`${client.name}: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
    }
  }
  throw new Error(`Direct InnerTube failed for all clients. Errors: ${errors.join(' | ')}`);
}

// ── cobalt.tools for Bilibili ─────────────────────────────────────────────────
async function getBilibiliStreamViaCobalt(videoUrl: string): Promise<string> {
  const body = JSON.stringify({ url: videoUrl, videoQuality: '480', audioBitrate: '128' });
  let lastError = 'no instances tried';

  for (const instance of getCobaltInstances()) {
    try {
      const res = await fetch(instance, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) { lastError = `${instance}: HTTP ${res.status}`; continue; }

      const data = await res.json() as {
        status: string;
        url?: string;
        error?: { code?: string };
      };
      if (data.status === 'error' || !data.url) {
        lastError = `${instance}: ${data.error?.code ?? data.status ?? 'no url'}`;
        continue;
      }

      console.log(`cobalt (${instance}) Bilibili: status=${data.status}`);
      return data.url;
    } catch (err) {
      lastError = `${instance}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
    }
  }
  throw new Error(`All cobalt instances failed for Bilibili. Last: ${lastError}`);
}

// ── Bilibili Direct API (most reliable from Vercel HKG1 — Hong Kong region) ──
// Bilibili's open API is accessible from Hong Kong without geo-restriction.
// Returns a playback URL that works with proper Referer/UA headers.
// No auth needed for 360p-480p quality.
async function getBilibiliStreamUrlDirect(videoUrl: string): Promise<string> {
  const bvMatch = videoUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
  const avMatch = videoUrl.match(/\/video\/av(\d+)/i);
  if (!bvMatch && !avMatch) throw new Error('Cannot extract BV/AV ID from Bilibili URL');

  const bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(process.env.BILIBILI_COOKIE ? { Cookie: process.env.BILIBILI_COOKIE } : {}),
  };

  // Step 1: Get video CID
  const viewApiUrl = bvMatch
    ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvMatch[1]}`
    : `https://api.bilibili.com/x/web-interface/view?aid=${avMatch![1]}`;

  const viewRes = await fetch(viewApiUrl, {
    headers: bilibiliHeaders,
    signal: AbortSignal.timeout(12_000),
  });
  if (!viewRes.ok) throw new Error(`Bilibili view API HTTP ${viewRes.status}`);

  const viewData = await viewRes.json() as {
    code: number;
    message?: string;
    data?: { cid?: number; bvid?: string; aid?: number };
  };
  if (viewData.code !== 0 || !viewData.data?.cid) {
    throw new Error(`Bilibili view API error: code=${viewData.code} ${viewData.message ?? ''}`);
  }
  const cid = viewData.data.cid;
  const bvid = bvMatch ? bvMatch[1] : String(viewData.data.bvid || '');
  const aid = avMatch ? avMatch[1] : String(viewData.data.aid || '');

  // Step 2: Get playback URL — try multiple quality levels, no auth needed for 360p
  const playParams = bvid
    ? `bvid=${bvid}&cid=${cid}`
    : `avid=${aid}&cid=${cid}`;

  // qn=32 = 480p, qn=16 = 360p; fnval=1 = old-style FLV/MP4 durl[]
  for (const qn of [80, 64, 32, 16]) {
    try {
      const playRes = await fetch(
        `https://api.bilibili.com/x/player/playurl?${playParams}&qn=${qn}&fnval=1&fnver=0&fourk=0`,
        { headers: bilibiliHeaders, signal: AbortSignal.timeout(12_000) },
      );
      if (!playRes.ok) continue;
      const playData = await playRes.json() as {
        code: number;
        message?: string;
        data?: { durl?: Array<{ url: string; backup_url?: string[] }> };
      };
      if (playData.code !== 0 || !playData.data?.durl?.length) continue;
      const streamUrl = playData.data.durl[0].url;
      if (!streamUrl) continue;
      console.log(`Bilibili direct API: CID=${cid} qn=${qn} url=${streamUrl.slice(0, 80)}...`);
      return streamUrl;
    } catch (err) {
      console.warn(`Bilibili direct API qn=${qn} failed:`, err instanceof Error ? err.message.slice(0, 80) : err);
    }
  }
  throw new Error('Bilibili direct API: no stream URL obtained for any quality level');
}

async function fetchPipedSubtitleCues(subtitleUrl: string): Promise<CaptionCue[]> {
  try {
    const res = await fetch(subtitleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const vttText = await res.text();
    const tmpFile = path.join(CACHE_DIR, `sub-${randomUUID()}.vtt`);
    await writeFile(tmpFile, vttText);
    const cues = await parseVttFile(tmpFile);
    unlink(tmpFile).catch(() => {});
    return cues;
  } catch {
    return [];
  }
}

// ── youtube-transcript fallback for analysis ─────────────────────────────────
async function fetchYouTubeTranscriptCues(videoId: string): Promise<CaptionCue[]> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const withTimeout = async <T>(fn: () => Promise<T>, ms: number): Promise<T> => Promise.race([
      fn(),
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
    // Try several languages
    for (const lang of ['en', 'en-US', 'zh-Hans', 'zh', '']) {
      try {
        const transcript = await withTimeout(
          () => (lang
            ? YoutubeTranscript.fetchTranscript(videoId, { lang })
            : YoutubeTranscript.fetchTranscript(videoId)),
          12_000,
        );
        if (transcript.length > 0) {
          return transcript.map(item => ({
            start: item.offset / 1000,
            end: (item.offset + item.duration) / 1000,
            text: item.text,
          }));
        }
      } catch { /* try next lang */ }
    }
  } catch (err) {
    console.warn('youtube-transcript failed:', err instanceof Error ? err.message : err);
  }
  return [];
}

// ── YouTube analysis via YouTube.js / Invidious / Piped + transcript ─────────
async function analyzeYouTubeViaPipedAndTranscript(videoUrl: string): Promise<VideoAnalysisResult> {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) throw new Error('Invalid YouTube URL');

  let title = 'YouTube video';
  let duration = 300;
  let cues: CaptionCue[] = [];

  // Try each proxy in order for title/duration/subtitles.
  // On Vercel we avoid DirectInnerTube / YouTube.js because datacenter IPs often
  // trigger LOGIN_REQUIRED and poison subsequent attempts. Prefer CF Worker / Edge.
  // Priority (Vercel): CF Worker > Edge Function > Invidious > Piped
  // Priority (non-Vercel): CF Worker > Edge Function > DirectInnerTube > YouTube.js > Invidious > Piped
  const metaGetters = IS_VERCEL
    ? [
        ...(getCfWorkerUrl() ? [() => getYouTubeInfoViaCFWorker(videoId)] : []),
        ...(getAppBaseUrl() ? [() => getYouTubeInfoViaEdgeFunction(videoId)] : []),
        () => getYouTubeInfoViaInvidious(videoId),
        () => getYouTubeInfoViaPiped(videoId),
      ]
    : [
        ...(getCfWorkerUrl() ? [() => getYouTubeInfoViaCFWorker(videoId)] : []),
        ...(getAppBaseUrl() ? [() => getYouTubeInfoViaEdgeFunction(videoId)] : []),
        () => getYouTubeInfoViaDirectInnerTube(videoId),
        () => getYouTubeInfoViaYouTubeJs(videoId),
        () => getYouTubeInfoViaInvidious(videoId),
        () => getYouTubeInfoViaPiped(videoId),
      ];

  for (const getter of metaGetters) {
    try {
      const info = await getter();
      title = info.title;
      duration = info.duration;
      if (info.subtitleUrl) {
        cues = await fetchPipedSubtitleCues(info.subtitleUrl);
        console.log(`Got ${cues.length} subtitle cues`);
      }
      break; // success
    } catch (err) {
      console.warn('Meta getter failed:', err instanceof Error ? err.message.slice(0, 80) : err);
    }
  }

  // Fallback: youtube-transcript for cues
  if (cues.length === 0) {
    cues = await fetchYouTubeTranscriptCues(videoId);
    console.log(`youtube-transcript: ${cues.length} cues`);
  }

  // Estimate duration from cues if proxies gave nothing
  if (duration <= 60 && cues.length > 0) {
    duration = Math.ceil(cues[cues.length - 1].end) + 30;
  }

  // oEmbed for title as last resort
  if (title === 'YouTube video') {
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (r.ok) { const d = await r.json() as { title?: string }; title = d.title || title; }
    } catch { /* ignore */ }
  }

  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}

// ── Cookie helpers (macOS local dev) ─────────────────────────────────────────
async function hasChromeCookies() {
  try { await access(CHROME_COOKIE_DB, fsConstants.R_OK); return true; } catch { return false; }
}

async function hasFreshCookieFile(): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(COOKIE_FILE_PATH);
    return Date.now() - stats.mtimeMs < 30 * 60 * 1000;
  } catch { return false; }
}

async function exportChromeCookies(videoUrl: string): Promise<boolean> {
  if (!ytDlpUseModule) return false;
  try {
    const ffmpegPath = await ensureFfmpegAvailable().catch(() => '');
    const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : '';
    const env: NodeJS.ProcessEnv = {
      ...process.env, PYTHONWARNINGS: 'ignore',
      ...(ffmpegDir ? { PATH: `${ffmpegDir}:${process.env.PATH || ''}` } : {}),
    };
    await execFile('python3', [
      '-m', 'yt_dlp', '--no-check-certificate',
      '--cookies-from-browser', 'chrome',
      '--cookies', COOKIE_FILE_PATH,
      '--skip-download', '--no-playlist', '-q', videoUrl,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 30_000, env });
    await access(COOKIE_FILE_PATH, fsConstants.R_OK);
    return true;
  } catch { return false; }
}

// ── Proxy detection (local dev only) ─────────────────────────────────────────
async function detectProxy(): Promise<string | undefined> {
  const fromEnv =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY ||
    process.env.https_proxy || process.env.http_proxy || process.env.all_proxy;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (process.env.VERCEL) return undefined;
  const candidates = [7897, 7890, 7891, 1087, 1080, 8080, 8118, 10809];
  for (const port of candidates) {
    try {
      await execFile('bash', ['-c', `timeout 0.5 bash -c "</dev/tcp/127.0.0.1/${port}" 2>/dev/null && echo ok`], { timeout: 1500 });
      return `http://127.0.0.1:${port}`;
    } catch { /* try next */ }
  }
  return undefined;
}

// ── VTT parsing ───────────────────────────────────────────────────────────────
async function findFirstFile(dir: string, extensions: string[]) {
  try {
    const files = await readdir(dir);
    return files.find((f) => extensions.some((ext) => f.endsWith(ext))) || null;
  } catch { return null; }
}

async function parseVttFile(filePath: string): Promise<CaptionCue[]> {
  const raw = await readFile(filePath, 'utf8');
  const blocks = raw.split(/\n\s*\n/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split('-->').map((v) => v.trim().split(' ')[0]);
    const text = cleanCueText(lines.slice(lines.indexOf(timeLine) + 1).join(' '));
    if (!text) continue;
    cues.push({
      start: parseVttTimestamp(startRaw.replace(',', '.')),
      end: parseVttTimestamp(endRaw.replace(',', '.')),
      text,
    });
  }
  return cues;
}

function parseYtDlpJson(stdout: string): Record<string, unknown> {
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON in yt-dlp output');
  return JSON.parse(stdout.slice(jsonStart));
}

// ── YouTube analysis via yt-dlp ───────────────────────────────────────────────
async function analyzeYouTubeVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
  // On Vercel, yt-dlp cannot solve YouTube's JS signature challenges and
  // its repeated failed requests trigger YouTube rate-limiting (LOGIN_REQUIRED).
  // Skip yt-dlp entirely on Vercel and go straight to proxy-based analysis.
  if (FORCE_YOUTUBE_STREAM_FALLBACKS) {
    console.log('Vercel environment detected: skipping yt-dlp analysis, using proxy+transcript');
    return analyzeYouTubeViaPipedAndTranscript(videoUrl);
  }

  const outputTemplate = path.join(workDir, 'analysis.%(ext)s');
  const baseArgs = [
    '--no-playlist', '--skip-download', '--dump-single-json',
    '--write-auto-subs', '--write-subs',
    '--sub-langs', 'en.*,en,zh.*,zh-Hans.*,zh-Hant.*',
    '--convert-subs', 'vtt',
    '-o', outputTemplate, videoUrl,
  ];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  const strategies = [
    [...proxyArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs],
    [...proxyArg, '--extractor-args', 'youtube:player_client=android_embedded', ...baseArgs],
    [...proxyArg, '--extractor-args', 'youtube:player_client=ios', ...baseArgs],
    [...proxyArg, ...baseArgs],
    baseArgs,
  ];

  if (await hasFreshCookieFile()) {
    strategies.splice(3, 0, [...proxyArg, '--cookies', COOKIE_FILE_PATH, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs]);
  }
  if (await hasChromeCookies()) {
    strategies.splice(3, 0, [...proxyArg, '--cookies-from-browser', 'chrome', '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs]);
  }

  let stdout = '', stderr = '', lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`yt-dlp analysis strategy ${i + 1}/${strategies.length}…`);
      const r = await runYtDlp(strategies[i], false);
      stdout = r.stdout; stderr = r.stderr; lastError = null;
      console.log(`yt-dlp analysis strategy ${i + 1} succeeded`);
      break;
    } catch (err) {
      lastError = err;
      stdout = (err && typeof err === 'object' && 'stdout' in err) ? String(err.stdout) : '';
      stderr = (err && typeof err === 'object' && 'stderr' in err) ? String(err.stderr) : '';
    }
  }

  if (!stdout.trim()) {
    // yt-dlp failed (expected on Vercel due to YouTube bot detection)
    const ytdlpErr = stderr.slice(0, 200) || (lastError instanceof Error ? lastError.message.slice(0, 200) : '');
    console.warn(`yt-dlp analysis failed (${ytdlpErr}), falling back to Piped+transcript…`);
    return await analyzeYouTubeViaPipedAndTranscript(videoUrl);
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Source video';
  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}

// ── Bilibili analysis ─────────────────────────────────────────────────────────

// Direct Bilibili API call — works from any IP including Vercel HKG1.
// Returns title + duration without needing yt-dlp.
async function getBilibiliVideoMeta(videoUrl: string): Promise<{ title: string; duration: number }> {
  const bvMatch = videoUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
  const avMatch = videoUrl.match(/\/video\/av(\d+)/i);
  if (!bvMatch && !avMatch) throw new Error('Cannot extract BV/AV ID from Bilibili URL');

  const apiUrl = bvMatch
    ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvMatch[1]}`
    : `https://api.bilibili.com/x/web-interface/view?aid=${avMatch![1]}`;

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com/',
      ...(process.env.BILIBILI_COOKIE ? { Cookie: process.env.BILIBILI_COOKIE } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Bilibili API HTTP ${res.status}`);

  const data = await res.json() as {
    code: number;
    message?: string;
    data?: { title?: string; duration?: number };
  };

  if (data.code !== 0 || !data.data) {
    throw new Error(`Bilibili API error: code=${data.code}, msg=${data.message ?? ''}`);
  }

  return {
    title: data.data.title?.trim() || 'Bilibili Video',
    duration: data.data.duration || 300,
  };
}

async function analyzeBilibiliVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
  // On Vercel: skip yt-dlp entirely — use Bilibili's public API for title/duration
  // (yt-dlp binary download is slow on cold start and the binary often fails from HKG1)
  if (process.env.VERCEL) {
    console.log('Vercel environment: using Bilibili direct API for analysis');
    try {
      const { title, duration } = await getBilibiliVideoMeta(videoUrl);
      console.log(`Bilibili API: "${title.slice(0, 50)}", duration=${duration}s`);
      return { duration, title, highlights: buildFallbackHighlights(duration) };
    } catch (err) {
      console.warn('Bilibili direct API failed:', err instanceof Error ? err.message.slice(0, 100) : err);
      return { duration: 300, title: 'Bilibili Video', highlights: buildFallbackHighlights(300) };
    }
  }
  const outputTemplate = path.join(workDir, 'analysis.%(ext)s');
  const bilibiliHeaders = [
    '--add-header', 'Referer: https://www.bilibili.com/',
    '--add-header', 'Origin: https://www.bilibili.com',
    '--add-header', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
  ];
  const analysisArgs = [
    '--no-playlist', '--skip-download', '--dump-single-json',
    '--write-subs', '--write-auto-subs',
    '--sub-langs', 'zh-Hans,zh-Hant,zh,en.*',
    '--convert-subs', 'vtt',
    '-o', outputTemplate, videoUrl,
  ];

  const hasCookies = await hasChromeCookies();
  const strategies = [
    ...(hasCookies ? [['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...analysisArgs]] : []),
    [...bilibiliHeaders, ...analysisArgs],
  ];

  let stdout = '', stderr = '', lastError: unknown;
  for (const s of strategies) {
    try {
      const r = await runYtDlp(s, true);
      stdout = r.stdout; stderr = r.stderr; lastError = null;
      break;
    } catch (err) {
      lastError = err;
      stdout = (err && typeof err === 'object' && 'stdout' in err) ? String(err.stdout) : '';
      stderr = (err && typeof err === 'object' && 'stderr' in err) ? String(err.stderr) : '';
    }
  }

  if (!stdout.trim()) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : '') || 'yt-dlp failed for Bilibili.';
    console.warn(`Bilibili analysis fallback: yt-dlp failed (${msg.slice(0, 120)}), using direct API meta`);
    try {
      const { title, duration } = await getBilibiliVideoMeta(videoUrl);
      return { duration, title, highlights: buildFallbackHighlights(duration) };
    } catch (err) {
      console.warn('Bilibili direct API failed:', err instanceof Error ? err.message.slice(0, 100) : err);
      return { duration: 300, title: 'Bilibili Video', highlights: buildFallbackHighlights(300) };
    }
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Bilibili video';
  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}

// ── Video download ─────────────────────────────────────────────────────────────
async function downloadSourceVideo(
  videoUrl: string,
  options?: { forceRefresh?: boolean },
): Promise<PreparedSource> {
  const normalizedUrl = await normalizeVideoUrl(videoUrl);
  await ensureDirectories();
  const sourceDir = path.join(CACHE_DIR, sourceId(normalizedUrl));
  await mkdir(sourceDir, { recursive: true });

  if (options?.forceRefresh) {
    const files = await readdir(sourceDir).catch(() => []);
    await Promise.all(
      files
        .filter(f => /\.(mp4|mkv|webm|mov)$/i.test(f))
        .map(f => unlink(path.join(sourceDir, f)).catch(() => {})),
    );
  } else {
    const cachedFile = await findFirstFile(sourceDir, ['.mp4', '.mkv', '.webm', '.mov']);
    if (cachedFile) {
      console.log(`Using cached video: ${cachedFile}`);
      return { inputPath: path.join(sourceDir, cachedFile) };
    }
  }

  const outputTemplate = path.join(sourceDir, 'source.%(ext)s');
  const hasCookies = await hasChromeCookies();

  if (isBilibiliUrl(normalizedUrl)) {
    return { inputPath: await downloadBilibiliVideo(normalizedUrl, outputTemplate, hasCookies) };
  }
  return downloadYouTubeOrGenericVideo(normalizedUrl, outputTemplate, hasCookies);
}

async function downloadBilibiliVideo(
  videoUrl: string, outputTemplate: string, hasCookies: boolean,
): Promise<string> {
  // On Vercel: try direct Bilibili API first (most reliable from HKG1 / Hong Kong),
  // then cobalt.tools, then yt-dlp.
  if (process.env.VERCEL) {
    // 1. Try Bilibili direct API (works without auth from HKG1)
    try {
      console.log('Vercel: trying Bilibili direct API for stream URL');
      const streamUrl = await getBilibiliStreamUrlDirect(videoUrl);
      // Return stream URL directly — ffmpeg will use it with Bilibili headers
      console.log('Bilibili direct API: got stream URL, will pass directly to ffmpeg');
      return streamUrl;
    } catch (directErr) {
      console.warn('Bilibili direct API failed:', directErr instanceof Error ? directErr.message.slice(0, 100) : directErr);
    }

    // 2. Try cobalt.tools
    try {
      console.log('Vercel: trying cobalt.tools for Bilibili download');
      const cobaltUrl = await getBilibiliStreamViaCobalt(videoUrl);
      console.log('Bilibili (cobalt): got stream URL, will pass to ffmpeg');
      return cobaltUrl;
    } catch (cobaltErr) {
      console.warn('cobalt.tools Bilibili failed on Vercel:', cobaltErr instanceof Error ? cobaltErr.message.slice(0, 100) : cobaltErr);
    }

    throw new Error('Bilibili: all Vercel download methods failed (direct API + cobalt.tools)');
  }

  const bilibiliHeaders = [
    '--add-header', 'Referer: https://www.bilibili.com/',
    '--add-header', 'Origin: https://www.bilibili.com',
    '--add-header', 'Accept-Language: zh-CN,zh;q=0.9',
  ];
  const baseDownloadArgs = [
    '--no-playlist', '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate, '--merge-output-format', 'mp4',
  ];

  const strategies = [
    ...(hasCookies ? [
      ['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...baseDownloadArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl],
      ['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...baseDownloadArgs, '-f', 'best', videoUrl],
    ] : []),
    [...bilibiliHeaders, ...baseDownloadArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl],
    [...bilibiliHeaders, ...baseDownloadArgs, '-f', 'best', videoUrl],
  ];

  let stdout = '', stderr = '', lastError: unknown;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const r = await runYtDlp(strategies[i], true);
      stdout = r.stdout; stderr = r.stderr; lastError = null; break;
    } catch (err) {
      lastError = err;
      stdout = (err && typeof err === 'object' && 'stdout' in err) ? String(err.stdout) : '';
      stderr = (err && typeof err === 'object' && 'stderr' in err) ? String(err.stderr) : '';
    }
  }

  const resolvedPath = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  if (!resolvedPath) {
    const ytdlpErr = stderr.trim() || (lastError instanceof Error ? lastError.message : '') || 'yt-dlp failed';
    console.warn(`yt-dlp Bilibili failed (${ytdlpErr.slice(0, 150)}), trying direct API…`);
    try {
      const streamUrl = await getBilibiliStreamUrlDirect(videoUrl);
      console.log('Bilibili direct API: got stream URL, will pass directly to ffmpeg');
      return streamUrl;
    } catch (directErr) {
      console.warn(`Bilibili direct API failed (${directErr instanceof Error ? directErr.message.slice(0, 120) : String(directErr)}), trying cobalt.tools…`);
      try {
        const cobaltUrl = await getBilibiliStreamViaCobalt(videoUrl);
        console.log('cobalt.tools Bilibili stream URL obtained, using as ffmpeg input');
        return cobaltUrl;
      } catch (cobaltErr) {
        const cobaltMsg = cobaltErr instanceof Error ? cobaltErr.message.slice(0, 100) : String(cobaltErr);
        throw new Error(`Failed to download Bilibili video. yt-dlp: ${ytdlpErr.slice(0, 100)}. cobalt.tools: ${cobaltMsg}`);
      }
    }
  }
  return resolvedPath;
}

// ── YouTube stream URL retrieval with all fallbacks ───────────────────────────
// Used directly on Vercel (skips yt-dlp) and as fallback after yt-dlp fails.
// Priority: Edge Function (CDN IPs) > CF Worker > cobalt.tools (age-restricted OK) > DirectInnerTube > YouTube.js > Invidious > Piped
async function getYouTubeStreamUrlWithFallbacks(videoId: string): Promise<string> {
  const allowCobalt = true;
  const startedAt = Date.now();
  const budgetMs = IS_VERCEL ? 120_000 : 180_000;
  const streamGetters = IS_VERCEL
    ? [
        ...(getCfWorkerUrl() ? [{ name: 'CF Worker', fn: () => getYouTubeInfoViaCFWorker(videoId) }] : []),
        ...(getAppBaseUrl()
          ? [{ name: 'EdgeFunction', fn: () => getYouTubeInfoViaEdgeFunction(videoId) }]
          : []),
        ...(allowCobalt ? [{ name: 'cobalt', fn: () => getYouTubeInfoViaCobalt(videoId) }] : []),
        { name: 'Invidious', fn: () => getYouTubeInfoViaInvidious(videoId) },
        { name: 'Piped', fn: () => getYouTubeInfoViaPiped(videoId) },
      ]
    : [
        ...(getCfWorkerUrl() ? [{ name: 'CF Worker', fn: () => getYouTubeInfoViaCFWorker(videoId) }] : []),
        ...(getAppBaseUrl()
          ? [{ name: 'EdgeFunction', fn: () => getYouTubeInfoViaEdgeFunction(videoId) }]
          : []),
        { name: 'cobalt', fn: () => getYouTubeInfoViaCobalt(videoId) },
        { name: 'DirectInnerTube', fn: () => getYouTubeInfoViaDirectInnerTube(videoId) },
        { name: 'YouTube.js', fn: () => getYouTubeInfoViaYouTubeJs(videoId) },
        { name: 'Invidious', fn: () => getYouTubeInfoViaInvidious(videoId) },
        { name: 'Piped', fn: () => getYouTubeInfoViaPiped(videoId) },
      ];

  const errors: string[] = [];
  for (const getter of streamGetters) {
    try {
      if (Date.now() - startedAt > budgetMs) break;
      const { streamUrl } = await getter.fn();
      console.log(`Stream URL obtained via ${getter.name} for videoId=${videoId}`);
      return streamUrl; // ffmpeg accepts HTTPS URLs directly as -i input
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 150) : String(err);
      errors.push(`${getter.name}: ${msg}`);
      console.warn(`${getter.name} failed: ${msg}`);
    }
  }

  if (Date.now() - startedAt <= budgetMs) {
    try {
      const streamUrl = await getYouTubeStreamUrlViaYtDlp(videoId);
      console.log(`Stream URL obtained via yt-dlp for videoId=${videoId}`);
      return streamUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 150) : String(err);
      errors.push(`yt-dlp: ${msg}`);
      console.warn(`yt-dlp failed: ${msg}`);
    }
  }

  throw new Error(
    `Failed to get YouTube stream. All methods failed: ${errors.join(' | ')}\n` +
    `Time budget exceeded: ${budgetMs}ms\n` +
    'Deploy a Cloudflare Worker (see /cf-worker/README.md) and set CF_WORKER_URL in Vercel env vars for reliable access.',
  );
}

// ── Stream-to-file downloader (for Vercel: fetch stream → /tmp local file) ───
// YouTube's legacy combined MP4 streams store the moov atom at end-of-file
// (not faststart). When ffmpeg uses a remote HTTP URL as -i, it must download
// the ENTIRE video before it can seek to any timestamp, causing 60-120s delays.
// Solution: fetch the stream to /tmp first (~1-10s), then ffmpeg seeks instantly.
async function downloadStreamToLocalFile(url: string, outputPath: string): Promise<boolean> {
  const maxBytes = 400 * 1024 * 1024; // 400 MB — stay under Vercel /tmp 512 MB limit
  try {
    await access(outputPath, fsConstants.R_OK);
    return true;
  } catch {
    // ignore
  }

  const tempPath = `${outputPath}.part`;
  const isWorkerStreamUrl = (() => {
    try {
      const u = new URL(url);
      return u.pathname.includes('/stream') && (u.hostname.endsWith('.workers.dev') || u.hostname.includes('youtube-proxy'));
    } catch {
      return false;
    }
  })();

  const downloadChunked = async () => {
    const fileStream = createWriteStream(tempPath);
    let downloadedBytes = 0;
    const chunkSize = 8 * 1024 * 1024;
    let offset = 0;
    let total: number | null = null;
    const startedAt = Date.now();
    const budgetMs = IS_VERCEL ? 150_000 : 300_000;

    try {
      while (downloadedBytes < maxBytes) {
        if (Date.now() - startedAt > budgetMs) {
          throw new Error('Download timed out');
        }
        const end = offset + chunkSize - 1;
        const rangeValue = `bytes=${offset}-${end}`;
        const fetchChunk = async () => fetch(url, {
          headers: {
            Range: rangeValue,
            ...getBypassHeadersForUrl(url),
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
          },
          signal: AbortSignal.timeout(60_000),
        });

        let res: Response | null = null;
        const retries = isWorkerStreamUrl ? 3 : 1;
        for (let attempt = 0; attempt < retries; attempt += 1) {
          res = await fetchChunk();
          if (res.status === 200 || res.status === 206 || res.status === 416) break;
          if (!isWorkerStreamUrl) break;
          if (![429, 500, 502, 503, 504].includes(res.status)) break;
          await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!res) throw new Error('Empty response');

        if (res.status === 416) break;
        if (res.status !== 206 && res.status !== 200) {
          throw new Error(`HTTP ${res.status}`);
        }

        if (!res.body) throw new Error('Empty body');
        const readable = Readable.fromWeb(res.body as never);
        let chunkBytes = 0;
        for await (const chunk of readable) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          chunkBytes += buf.length;
          downloadedBytes += buf.length;
          if (downloadedBytes > maxBytes) throw new Error('Exceeded size limit');
          if (!fileStream.write(buf)) await once(fileStream, 'drain');
        }

        if (chunkBytes <= 0) throw new Error('Downloaded empty chunk');

        if (res.status === 200) {
          total = downloadedBytes;
          break;
        }

        const cr = res.headers.get('content-range') || '';
        const m = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
        if (m) {
          const start = parseInt(m[1], 10);
          const endByte = parseInt(m[2], 10);
          if (start !== offset) {
            throw new Error(`Unexpected range start ${start} (expected ${offset})`);
          }
          if (m[3] !== '*') total = parseInt(m[3], 10);
          offset = endByte + 1;
        } else {
          offset += chunkBytes;
        }

        if (total && offset >= total) break;
      }

      fileStream.end();
      await once(fileStream, 'finish');
    } catch (err) {
      fileStream.destroy();
      await once(fileStream, 'close').catch(() => {});
      throw err;
    }

    if (downloadedBytes <= 0) throw new Error('Downloaded empty file');
    await rename(tempPath, outputPath);
    try {
      const head = await readFile(outputPath, { encoding: null, flag: 'r' }).then((b) => b.subarray(0, 16));
      const headStr = head.toString('utf8').toLowerCase();
      const isMp4 = head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp';
      const isWebm = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
      const looksHtml = headStr.includes('<!doctype') || headStr.includes('<html') || headStr.includes('<head');
      if (!isMp4 && !isWebm && looksHtml) {
        await unlink(outputPath).catch(() => {});
        throw new Error('Downloaded HTML instead of video');
      }
    } catch {
      // ignore
    }
    console.log(`Video downloaded (chunked): ${Math.round(downloadedBytes / 1024 / 1024 * 10) / 10}MB → ${outputPath}`);
    return true;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (isWorkerStreamUrl) {
        console.log('Fetching video stream to /tmp (chunked)…');
        return await downloadChunked();
      }
      console.log(`Fetching video stream to /tmp…`);
      const res = await fetch(url, {
        headers: {
          ...getBypassHeadersForUrl(url),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
        },
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) {
        console.warn(`Stream fetch HTTP ${res.status}`);
        continue;
      }

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      if (contentLength > 0 && contentLength > maxBytes) {
        console.warn(`Video too large to cache locally: ${Math.round(contentLength / 1024 / 1024)}MB`);
        return false;
      }

      if (!res.body) {
        console.warn('Stream fetch returned empty body');
        continue;
      }

      const fileStream = createWriteStream(tempPath);
      let downloadedBytes = 0;
      try {
        const readable = Readable.fromWeb(res.body as never);
        for await (const chunk of readable) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          downloadedBytes += buf.length;
          if (downloadedBytes > maxBytes) {
            throw new Error(`Downloaded video exceeds size limit: ${Math.round(downloadedBytes / 1024 / 1024)}MB`);
          }
          if (!fileStream.write(buf)) {
            await once(fileStream, 'drain');
          }
        }
        fileStream.end();
        await once(fileStream, 'finish');
      } catch (streamErr) {
        fileStream.destroy();
        await once(fileStream, 'close').catch(() => {});
        throw streamErr;
      }

      if (downloadedBytes <= 0) {
        console.warn('Downloaded empty file');
        continue;
      }

      await rename(tempPath, outputPath);
      try {
        const head = await readFile(outputPath, { encoding: null, flag: 'r' }).then((b) => b.subarray(0, 16));
        const headStr = head.toString('utf8').toLowerCase();
        const isMp4 = head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp';
        const isWebm = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
        const looksHtml = headStr.includes('<!doctype') || headStr.includes('<html') || headStr.includes('<head');
        if (!isMp4 && !isWebm && looksHtml) {
          console.warn('Downloaded file looks like HTML, rejecting');
          await unlink(outputPath).catch(() => {});
          continue;
        }
      } catch {}
      console.log(`Video downloaded: ${Math.round(downloadedBytes / 1024 / 1024 * 10) / 10}MB → ${outputPath}`);
      return true;
    } catch (err) {
      console.warn('downloadStreamToLocalFile failed:', err instanceof Error ? err.message.slice(0, 100) : err);
    }

    await unlink(tempPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }

  return false;
}

async function preflightStream(url: string): Promise<boolean> {
  const isWorker = (() => {
    try {
      const u = new URL(url);
      return u.hostname.endsWith('.workers.dev') || u.hostname.includes('youtube-proxy');
    } catch {
      return false;
    }
  })();

  const attempts = isWorker ? 3 : 1;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Range: 'bytes=0-1',
          ...getBypassHeadersForUrl(url),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
        },
        signal: AbortSignal.timeout(12_000),
      });
      const type = (res.headers.get('content-type') || '').toLowerCase();
      res.body?.cancel();
      const statusOk = res.status === 200 || res.status === 206;
      const typeOk = !type || type.startsWith('video/') || type.includes('octet-stream') || type.includes('application/mp4') || type.includes('application/vnd.apple.mpegurl');
      const looksBad = type.includes('text/html') || type.includes('application/json');
      if (statusOk && typeOk && !looksBad) return true;
      if (!isWorker) return false;
      if (![429, 500, 502, 503, 504].includes(res.status)) return false;
    } catch {
      if (!isWorker) return false;
    }
    await new Promise<void>((r) => setTimeout(r, 400 * (i + 1)));
  }
  return false;
}

async function downloadYouTubeOrGenericVideo(
  videoUrl: string, outputTemplate: string, hasCookies: boolean,
): Promise<PreparedSource> {
  // On Vercel, yt-dlp cannot solve YouTube's JS signature challenges.
  // More critically: each yt-dlp attempt makes YouTube API requests that accumulate
  // on the same datacenter IP and trigger LOGIN_REQUIRED ("Sign in to confirm you're not a bot")
  // by the time we reach DirectInnerTube. Skip yt-dlp entirely on Vercel for YouTube.
  if (FORCE_YOUTUBE_STREAM_FALLBACKS && isYouTubeUrl(videoUrl)) {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const cfWorkerUrl = getCfWorkerUrl();
    if (cfWorkerUrl) {
      try {
        const localPath = path.join(path.dirname(outputTemplate), 'source.mp4');
        const preferred = getCfWorkerMaxHeight();
        const heights = Array.from(new Set([preferred, 720, 480, 360, 240, 144].filter(Boolean)));
        let remoteCandidate = '';
        for (const h of heights) {
          const u = new URL(cfWorkerUrl);
          u.pathname = `${u.pathname.replace(/\/$/, '')}/resolve`;
          u.searchParams.set('videoId', videoId);
          u.searchParams.set('maxHeight', String(h));
          let resolved: { streamUrl?: string; userAgent?: string; error?: string } | null = null;
          let resolveError = '';
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const res = await fetch(u.toString(), {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(25_000),
              });
              if (!res.ok) {
                let details = '';
                try { details = (await res.text()).slice(0, 220); } catch {}
                throw new Error(`HTTP ${res.status}${details ? `: ${details}` : ''}`);
              }
              resolved = await res.json() as { streamUrl?: string; userAgent?: string; error?: string };
              if (resolved?.streamUrl) break;
              resolveError = resolved?.error || 'Missing streamUrl';
            } catch (e) {
              resolveError = e instanceof Error ? e.message.slice(0, 220) : String(e).slice(0, 220);
            }
            await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
          }

          const streamUrl = resolved?.streamUrl || '';
          if (!streamUrl) {
            console.warn(`CF Worker /resolve failed for maxHeight=${h}: ${resolveError}`);
            continue;
          }

          const ok = await preflightStream(streamUrl);
          if (!ok) {
            console.warn(`CF Worker resolved stream preflight failed for maxHeight=${h}, trying next…`);
            continue;
          }
          const downloaded = await downloadStreamToLocalFile(streamUrl, localPath);
          if (downloaded) {
            console.log('Vercel environment: using locally cached YouTube source for ffmpeg input');
            return { inputPath: localPath };
          }
          remoteCandidate = streamUrl;
        }
        if (remoteCandidate) {
          console.log('Vercel environment: using resolved YouTube stream URL directly as ffmpeg input (no local cache)');
          const ffmpegHeaders =
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36\r\n' +
            'Referer: https://www.youtube.com/\r\n' +
            'Origin: https://www.youtube.com\r\n' +
            'Accept: */*\r\n' +
            'Accept-Encoding: identity\r\n';
          return { inputPath: remoteCandidate, ffmpegHeaders };
        }
        throw new Error('CF Worker resolve is unavailable');
      } catch (e) {
        console.warn(
          'CF Worker stream URL build failed, trying Vercel edge proxy…',
          e instanceof Error ? e.message.slice(0, 120) : e,
        );
      }
    }

    const baseUrl = getAppBaseUrl();
    if (baseUrl) {
      const proxyUrl = `${baseUrl}/api/yt-proxy?videoId=${encodeURIComponent(videoId)}`;
      try {
        const res = await fetch(proxyUrl, {
          headers: { Range: 'bytes=0-1', ...getVercelProtectionBypassHeaders() },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 200 || res.status === 206) {
          console.log('Vercel environment: using /api/yt-proxy as ffmpeg input');
          const ffmpegHeaders =
            `${getBypassFfmpegHeaderString()}` +
            'Accept: */*\r\n' +
            'Accept-Encoding: identity\r\n';
          return { inputPath: proxyUrl, ffmpegHeaders };
        }
        console.warn(`yt-proxy preflight failed (HTTP ${res.status}), falling back to yt-dlp stream URL`);
      } catch (e) {
        console.warn(
          'yt-proxy preflight failed, falling back to yt-dlp stream URL:',
          e instanceof Error ? e.message.slice(0, 120) : e,
        );
      }
    }

    console.log('Vercel environment: using non-yt-dlp YouTube stream fallbacks');
    const streamUrl = await getYouTubeStreamUrlWithFallbacks(videoId);
    try {
      const localPath = path.join(path.dirname(outputTemplate), 'source.mp4');
      const ok = await preflightStream(streamUrl);
      if (ok) {
        const downloaded = await downloadStreamToLocalFile(streamUrl, localPath);
        if (downloaded) {
          console.log('Vercel environment: using locally cached fallback stream for ffmpeg input');
          return { inputPath: localPath };
        }
      }
    } catch {}
    const internalBaseUrl = getAppBaseUrl();
    const ffmpegHeaders =
      `${internalBaseUrl && streamUrl.startsWith(internalBaseUrl) ? getBypassFfmpegHeaderString() : ''}` +
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36\r\n' +
      'Referer: https://www.youtube.com/\r\n' +
      'Origin: https://www.youtube.com\r\n' +
      'Accept: */*\r\n' +
      'Accept-Encoding: identity\r\n';
    return { inputPath: streamUrl, ffmpegHeaders };
  }

  const baseArgs = [
    '--no-playlist', '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate, '--merge-output-format', 'mp4',
  ];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  const strategies: string[][] = [];

  if (isYouTubeUrl(videoUrl)) {
    if (hasCookies && !(await hasFreshCookieFile())) await exportChromeCookies(videoUrl);
    const cookieFileArg = (await hasFreshCookieFile()) ? ['--cookies', COOKIE_FILE_PATH] : [];
    const cookieBrowserArg = hasCookies ? ['--cookies-from-browser', 'chrome'] : [];

    // Support YOUTUBE_COOKIES env var (Netscape format cookie file content)
    const envCookieContent = process.env.YOUTUBE_COOKIES;
    if (envCookieContent) {
      try {
        const envCookiePath = path.join(CACHE_DIR, 'env-yt-cookies.txt');
        await writeFile(envCookiePath, envCookieContent);
        strategies.push([...proxyArg, '--cookies', envCookiePath, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
        strategies.push([...proxyArg, '--cookies', envCookiePath, ...baseArgs, '-f', 'best', videoUrl]);
        console.log('yt-dlp: YOUTUBE_COOKIES env var detected, added cookie strategies');
      } catch { /* ignore cookie write errors */ }
    }

    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=mweb', ...baseArgs, '-f', `best[height<=${LOCAL_MAX_HEIGHT}]/best`, videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android_testsuite', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android_embedded', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=ios', ...baseArgs, '-f', `best[height<=${LOCAL_MAX_HEIGHT}]/best`, videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    if (cookieFileArg.length) strategies.push([...proxyArg, ...cookieFileArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    if (cookieBrowserArg.length) strategies.push([...proxyArg, ...cookieBrowserArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, ...baseArgs, '-f', '18', videoUrl]);
    strategies.push(['--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', 'best', videoUrl]);
    strategies.push([...baseArgs, '-f', 'best', videoUrl]);
  } else {
    strategies.push([...baseArgs, '-f', 'bestvideo*+bestaudio/best', videoUrl]);
  }

  let stdout = '', stderr = '', lastError: unknown;
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`yt-dlp download strategy ${i + 1}/${strategies.length}…`);
      const r = await runYtDlp(strategies[i], false);
      stdout = r.stdout; stderr = r.stderr; lastError = null;
      console.log(`yt-dlp download strategy ${i + 1} succeeded`);
      break;
    } catch (err) {
      lastError = err;
      stdout = (err && typeof err === 'object' && 'stdout' in err) ? String(err.stdout) : '';
      stderr = (err && typeof err === 'object' && 'stderr' in err) ? String(err.stderr) : '';
    }
  }

  const resolvedPath = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop();

  if (!resolvedPath && isYouTubeUrl(videoUrl)) {
    // yt-dlp failed for YouTube (bot detection on non-Vercel environments with proxy config)
    const ytdlpErr = stderr.slice(0, 200);
    console.warn(`yt-dlp download failed (${ytdlpErr.slice(0, 120)}), trying stream proxy fallbacks…`);
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');
    return { inputPath: await getYouTubeStreamUrlWithFallbacks(videoId) };
  }

  if (!resolvedPath) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : '') || 'No file path returned.';
    throw new Error(`Failed to download video: ${msg}`);
  }
  return { inputPath: resolvedPath };
}

// ── Thumbnail generation ──────────────────────────────────────────────────────
async function generateThumbnail(clipPath: string, clipDuration: number): Promise<string> {
  // Don't try to generate thumbnails from remote URLs
  if (clipPath.startsWith('http')) return '';

  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = thumbFileName(path.basename(clipPath));
  const thumbPath = path.join(PUBLIC_CLIP_DIR, fileName);
  const seekTime = Math.min(10, Math.max(2, Math.floor(clipDuration * 0.25)));

  const tryThumb = async (seek: number) => {
    await execFile(ffmpegPath, [
      '-y', '-ss', String(seek), '-i', clipPath,
      '-vframes', '1', '-q:v', '2', '-vf', 'scale=640:-2', thumbPath,
    ], { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
    await access(thumbPath, fsConstants.R_OK);
  };

  try {
    await tryThumb(seekTime);
    return `/api/serve-clip/${fileName}`;
  } catch {
    try {
      await tryThumb(1);
      return `/api/serve-clip/${fileName}`;
    } catch {
      return '';
    }
  }
}

// ── Clip creation ──────────────────────────────────────────────────────────────
async function createLocalClip(params: {
  inputPath: string;  // local file path OR remote HTTPS URL (ffmpeg supports both)
  inputHeaders?: string;
  startTime: number;
  endTime: number;
  title: string;
}): Promise<ClipResult> {
  await ensureDirectories();
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = clipFileName(params.title);
  const outputPath = path.join(PUBLIC_CLIP_DIR, fileName);
  const duration = Math.max(1, params.endTime - params.startTime);

  const isRemoteInput = params.inputPath.startsWith('http');
  const isWorkerStream = isRemoteInput && (() => {
    try {
      const u = new URL(params.inputPath);
      return u.pathname.includes('/stream') && (u.hostname.endsWith('.workers.dev') || u.hostname.includes('youtube-proxy'));
    } catch {
      return false;
    }
  })();

  // Detect Bilibili CDN streams (need anti-leech headers)
  const isBilibiliStream = isRemoteInput && (
    params.inputPath.includes('bilivideo.com') ||
    params.inputPath.includes('bilivideo.cn') ||
    params.inputPath.includes('upos-sz') ||
    params.inputPath.includes('akamaized.net')
  );

  // HTTP reconnect flags for remote inputs
  const httpInputFlags = isRemoteInput ? [
    '-reconnect', '1',
    '-reconnect_at_eof', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
  ] : [];

  // Bilibili CDN requires Referer + UA or it returns 403
  const bilibiliHeaders = isBilibiliStream ? [
    'Referer: https://www.bilibili.com\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n',
  ] : [];

  const inputHeaders = isRemoteInput
    ? `${(params.inputHeaders || '').replace(/\r?\n/g, '\r\n')}${params.inputHeaders ? (params.inputHeaders.endsWith('\n') || params.inputHeaders.endsWith('\r\n') ? '' : '\r\n') : ''}${bilibiliHeaders.join('')}`
    : '';

  const ffmpegInputHeaders = (isRemoteInput && inputHeaders)
    ? ['-headers', inputHeaders]
    : [];

  // On Vercel: use aggressive compression to keep output small for base64 inline transport.
  // 360p + CRF 28 + ultrafast → typically 1.5-4 MB for a 30-60s clip.
  const videoFilter = SHOULD_INLINE_CLIPS
    ? ['-vf', VERCEL_SCALE]
    : ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  const crf = SHOULD_INLINE_CLIPS ? VERCEL_CRF : (isRemoteInput ? '18' : '17');
  const preset = SHOULD_INLINE_CLIPS ? 'veryfast' : (isRemoteInput ? 'veryfast' : 'fast');

  const seekArgs = (!isRemoteInput || isWorkerStream)
    ? ['-ss', String(params.startTime), '-i', params.inputPath, '-t', String(duration)]
    : ['-i', params.inputPath, '-ss', String(params.startTime), '-t', String(duration)];

  const args = [
    '-y',
    ...ffmpegInputHeaders,
    ...httpInputFlags,
    ...seekArgs,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', crf,
    '-profile:v', 'high',
    '-level:v', '4.1',
    '-pix_fmt', 'yuv420p',
    ...videoFilter,
    '-c:a', 'aac',
    '-b:a', IS_VERCEL ? '128k' : '160k',
    '-ar', '44100',
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    await execFile(ffmpegPath, args, {
      cwd: CACHE_DIR,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  } catch (error) {
    const errStderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
    const errStdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
    const combined = `${errStderr}\n${errStdout}`.trim();
    const tail = combined.length > 6000 ? combined.slice(-6000) : combined;
    throw new Error(tail || 'ffmpeg failed to generate the clip.');
  }

  const thumbnailUrl = await generateThumbnail(outputPath, duration);
  console.log(`Clip created: ${outputPath}, thumbnail: ${thumbnailUrl || '(none)'}`);

  // ── Convert clip to base64 data URL for reliable cross-Lambda transport ──────
  // On Vercel, /tmp is NOT shared across Lambda invocations.
  // If the client fetches /api/serve-clip/[filename] later, it may hit a different
  // instance where the file does not exist → 404.
  // Solution: read the clip into memory and return it as a data URL embedded
  // directly in the SSE response.  The client stores it as a Blob URL and can
  // play / download it without any additional server round-trip.
  let dataUrl = '';
  try {
    let fileBuffer = await readFile(outputPath);
    let fileSizeBytes = fileBuffer.length;

    if (SHOULD_INLINE_CLIPS && fileSizeBytes > MAX_INLINE_BYTES) {
      const attempts = [
        { crfDelta: 6, width: VERCEL_TARGET_WIDTH_NUM, height: VERCEL_TARGET_HEIGHT_NUM },
        { crfDelta: 10, width: 854, height: 480 },
        { crfDelta: 14, width: 640, height: 360 },
      ];

      const baseCrf = clampInt(VERCEL_CRF, 22, 40, 26);
      for (let i = 0; i < attempts.length && fileSizeBytes > MAX_INLINE_BYTES; i += 1) {
        const t = attempts[i];
        const fallbackCrf = String(Math.min(40, baseCrf + t.crfDelta));
        const fallbackW = String(ensureEven(t.width));
        const fallbackH = String(ensureEven(t.height));
        const fallbackPath = outputPath.replace(/\.mp4$/, `.small.${i + 1}.mp4`);

        try {
          await execFile(ffmpegPath, [
            '-y',
            '-i', outputPath,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', fallbackCrf,
            '-vf', `scale=${fallbackW}:${fallbackH}:force_original_aspect_ratio=decrease,pad=${fallbackW}:${fallbackH}:(ow-iw)/2:(oh-ih)/2`,
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ar', '44100',
            '-movflags', '+faststart',
            fallbackPath,
          ], { cwd: CACHE_DIR, timeout: 2 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });

          await access(fallbackPath, fsConstants.R_OK);
          fileBuffer = await readFile(fallbackPath);
          fileSizeBytes = fileBuffer.length;
          await unlink(fallbackPath).catch(() => {});
        } catch {
          await unlink(fallbackPath).catch(() => {});
        }
      }

      if (fileSizeBytes <= MAX_INLINE_BYTES) {
        unlink(outputPath).catch(() => {});
      }
    }

    if (SHOULD_INLINE_CLIPS && fileSizeBytes <= MAX_INLINE_BYTES) {
      dataUrl = `data:video/mp4;base64,${fileBuffer.toString('base64')}`;
      console.log(`Clip inlined as data URL: ${Math.round(fileSizeBytes / 1024)}KB`);
      if (dataUrl) {
        unlink(outputPath).catch(() => {});
      }
    } else {
      console.warn(`Clip too large for inline (${Math.round(fileSizeBytes / 1024 / 1024)}MB > ${MAX_INLINE_BYTES / 1024 / 1024}MB limit), falling back to serve-clip`);
    }
  } catch (readErr) {
    console.warn('Could not read clip for data URL:', readErr instanceof Error ? readErr.message : readErr);
  }

  return {
    outputPath,
    publicUrl: `/api/serve-clip/${fileName}`,  // fallback if dataUrl is empty
    dataUrl,                                    // preferred — works across Lambda invocations
    thumbnailUrl,
  };
}

// ── Video analysis (public API) ────────────────────────────────────────────────
async function analyzeVideo(videoUrl: string): Promise<VideoAnalysisResult> {
  const normalizedUrl = await normalizeVideoUrl(videoUrl);
  await ensureDirectories();
  const workDir = path.join(CACHE_DIR, sourceId(normalizedUrl));
  await mkdir(workDir, { recursive: true });

  if (isYouTubeUrl(normalizedUrl)) {
    try {
      return await analyzeYouTubeVideo(normalizedUrl, workDir);
    } catch (error) {
      console.warn('YouTube analysis failed completely, using fallback:', error instanceof Error ? error.message.slice(0, 100) : '');
      // Final fallback: try Piped/transcript one more time without yt-dlp
      try {
        return await analyzeYouTubeViaPipedAndTranscript(normalizedUrl);
      } catch {
        return { duration: 180, title: 'YouTube video', highlights: buildFallbackHighlights(180) };
      }
    }
  }

  if (isBilibiliUrl(normalizedUrl)) {
    try {
      return await analyzeBilibiliVideo(normalizedUrl, workDir);
    } catch (error) {
      console.warn('Bilibili analysis failed, using fallback:', error instanceof Error ? error.message.slice(0, 100) : '');
      return { duration: 180, title: 'Bilibili video', highlights: buildFallbackHighlights(180) };
    }
  }

  return { duration: 180, title: 'Source video', highlights: buildFallbackHighlights(180) };
}

async function downloadYouTubeClip(params: {
  videoUrl: string; title: string; startTime: number; endTime: number;
}) {
  const source = await downloadSourceVideo(params.videoUrl);
  return createLocalClip({
    inputPath: source.inputPath,
    inputHeaders: source.ffmpegHeaders,
    startTime: params.startTime,
    endTime: params.endTime,
    title: params.title,
  });
}

const videoClipper = {
  analyzeVideo, createLocalClip, downloadSourceVideo, downloadYouTubeClip,
  isYouTubeUrl, isBilibiliUrl,
};

export default videoClipper;
