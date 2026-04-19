/**
 * video-clipper.ts
 * Core server-side library for AI-powered video analysis and clip generation.
 * Supports Bilibili and YouTube via yt-dlp + ffmpeg.
 * Generates real MP4 clips and JPEG thumbnails from highlight timestamps.
 */

import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

const execFile = promisify(execFileCallback);

const ROOT_DIR = process.cwd();
const PUBLIC_CLIP_DIR = path.join(ROOT_DIR, 'public', 'generated-clips');
const CACHE_DIR = path.join(ROOT_DIR, '.cache', 'video-sources');
const YT_DLP_MODULE = 'yt_dlp';
const FFMPEG_EXE = path.join(
  process.env.HOME || '',
  'Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
);
const FFMPEG_DIR = path.dirname(FFMPEG_EXE);
const CHROME_COOKIE_DB = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Default/Cookies'
);
// Temporary cookie export file path (yt-dlp can export cookies here for reuse)
const COOKIE_FILE_PATH = path.join(CACHE_DIR, 'yt-cookies.txt');

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
  publicUrl: string;
  thumbnailUrl: string;
}

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

function isYouTubeUrl(videoUrl: string) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  } catch {
    return false;
  }
}

function isBilibiliUrl(videoUrl: string) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes('bilibili.com') || hostname.includes('b23.tv');
  } catch {
    return false;
  }
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
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function cleanCueText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Target clip duration: ~60s each, max 10 clips
const CLIP_TARGET_DURATION = 60;
const CLIP_MIN_DURATION = 45;
const CLIP_MAX_DURATION = 65;
const MAX_HIGHLIGHTS = 10;

function normalizeHighlights(input: Highlight[], duration: number) {
  const safeDuration = Math.max(duration, 60);

  const normalized = input
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const title = typeof item.title === 'string' && item.title.trim()
        ? item.title.trim().slice(0, 80)
        : `Highlight ${index + 1}`;
      const summary = typeof item.summary === 'string' && item.summary.trim()
        ? item.summary.trim().slice(0, 160)
        : 'Automatically selected highlight from the source video.';
      const score = Number.isFinite(item.engagement_score)
        ? Math.max(1, Math.min(10, Math.round(item.engagement_score)))
        : 7;

      let start = Number.isFinite(item.start_time) ? Math.floor(item.start_time) : 0;
      let end = Number.isFinite(item.end_time) ? Math.ceil(item.end_time) : start + CLIP_TARGET_DURATION;

      start = Math.max(0, Math.min(start, Math.max(0, safeDuration - CLIP_MIN_DURATION)));
      end = Math.max(start + CLIP_MIN_DURATION, Math.min(end, safeDuration));

      if (end - start > CLIP_MAX_DURATION) end = start + CLIP_MAX_DURATION;
      if (end > safeDuration) {
        end = safeDuration;
        start = Math.max(0, end - CLIP_TARGET_DURATION);
      }

      return {
        title,
        summary,
        engagement_score: score,
        start_time: start,
        end_time: end,
      };
    })
    .sort((a, b) => a.start_time - b.start_time);

  const deduped: Highlight[] = [];

  for (const highlight of normalized) {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(highlight);
      continue;
    }

    const adjustedStart = Math.max(highlight.start_time, previous.end_time);
    const adjustedEnd = Math.min(safeDuration, Math.max(adjustedStart + CLIP_MIN_DURATION, highlight.end_time));

    if (adjustedEnd - adjustedStart < CLIP_MIN_DURATION) continue;

    deduped.push({
      ...highlight,
      start_time: adjustedStart,
      end_time: Math.min(adjustedEnd, adjustedStart + CLIP_MAX_DURATION),
    });
  }

  return deduped.slice(0, MAX_HIGHLIGHTS);
}

function buildFallbackHighlights(duration: number) {
  // Generate 6-8 highlights evenly spaced, ~60s each
  const safeDuration = Math.max(duration, 120);
  const maxClips = Math.min(MAX_HIGHLIGHTS, Math.floor(safeDuration / (CLIP_MIN_DURATION + 10)));
  const clipCount = Math.max(2, maxClips);
  const spacing = Math.floor(safeDuration / (clipCount + 1));

  return normalizeHighlights(
    Array.from({ length: clipCount }, (_, index) => {
      const start = Math.max(0, spacing * (index + 1) - Math.floor(CLIP_TARGET_DURATION / 2));
      return {
        title: `Highlight ${index + 1}`,
        start_time: start,
        end_time: Math.min(start + CLIP_TARGET_DURATION, safeDuration),
        summary: `Automatically selected highlight ${index + 1}`,
        engagement_score: 7,
      };
    }),
    duration
  );
}

function buildHeuristicHighlights(cues: CaptionCue[], duration: number) {
  if (cues.length === 0) return buildFallbackHighlights(duration);

  const windows: Highlight[] = [];
  const step = 20; // slide window every 20s
  const length = CLIP_TARGET_DURATION; // aim for ~60s clips
  const keywords = [
    'important', 'secret', 'best', 'amazing', 'crazy', 'must', 'mistake', 'learn',
    '关键', '重点', '一定', '震惊', '厉害', '方法', '秘诀', '技巧',
  ];

  for (let start = 0; start < Math.max(duration - CLIP_MIN_DURATION, 1); start += step) {
    const end = Math.min(duration, start + length);
    const text = cues
      .filter((cue) => cue.end >= start && cue.start <= end)
      .map((cue) => cue.text)
      .join(' ')
      .trim();

    if (!text) continue;

    const keywordScore = keywords.reduce(
      (sum, keyword) => sum + (text.toLowerCase().includes(keyword.toLowerCase()) ? 2 : 0),
      0
    );
    const punctuationScore = (text.match(/[!?！？]/g) || []).length;
    const densityScore = Math.min(8, Math.floor(text.length / 80));
    const score = 4 + keywordScore + punctuationScore + densityScore;
    const title = text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .join(' ')
      || `Highlight at ${formatSeconds(start)}`;

    windows.push({
      title: title.slice(0, 80),
      start_time: start,
      end_time: end,
      summary: text.slice(0, 140),
      engagement_score: Math.min(10, score),
    });
  }

  windows.sort((a, b) => b.engagement_score - a.engagement_score);

  // Target 6-10 clips depending on video length
  const targetCount = Math.min(MAX_HIGHLIGHTS, Math.max(6, Math.floor(duration / 120)));
  const selected: Highlight[] = [];
  for (const candidate of windows) {
    const overlaps = selected.some(
      (item) =>
        Math.max(item.start_time, candidate.start_time) < Math.min(item.end_time, candidate.end_time)
    );
    if (!overlaps) selected.push(candidate);
    if (selected.length === targetCount) break;
  }

  return normalizeHighlights(selected.length >= 2 ? selected : buildFallbackHighlights(duration), duration);
}

async function ensureDirectories() {
  await mkdir(PUBLIC_CLIP_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
}

/**
 * Ensures ffmpeg is available and the symlink `ffmpeg` exists in the binary directory.
 * yt-dlp expects a binary named exactly "ffmpeg" in the --ffmpeg-location directory.
 */
async function ensureFfmpegAvailable(): Promise<string> {
  try {
    await access(FFMPEG_EXE, fsConstants.X_OK);

    const ffmpegLink = path.join(FFMPEG_DIR, 'ffmpeg');
    try {
      await access(ffmpegLink, fsConstants.X_OK);
    } catch {
      try {
        await symlink(FFMPEG_EXE, ffmpegLink);
        console.log(`Created ffmpeg symlink at ${ffmpegLink}`);
      } catch (symlinkErr) {
        console.warn('Could not create ffmpeg symlink:', symlinkErr);
      }
    }

    return FFMPEG_EXE;
  } catch {
    try {
      const { stdout } = await execFile('which', ['ffmpeg']);
      const fp = stdout.trim();
      if (fp) {
        await access(fp, fsConstants.X_OK);
        return fp;
      }
    } catch {
      // Ignore
    }
    throw new Error('ffmpeg is not available. Please install ffmpeg to enable video clipping.');
  }
}

async function hasChromeCookies() {
  try {
    await access(CHROME_COOKIE_DB, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a cookie export file is fresh enough to use (< 30 minutes old).
 */
async function hasFreshCookieFile(): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(COOKIE_FILE_PATH);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs < 30 * 60 * 1000; // 30 minutes
  } catch {
    return false;
  }
}

/**
 * Export Chrome cookies to a Netscape-format cookie file for use with yt-dlp.
 * This is more reliable than --cookies-from-browser when Chrome is open,
 * because we export once then reuse the file.
 */
async function exportChromeCookies(videoUrl: string): Promise<boolean> {
  const ffmpegDirToUse = await ensureFfmpegAvailable().then(() => FFMPEG_DIR).catch(() => '');
  try {
    const exportArgs = [
      '-m', YT_DLP_MODULE,
      '--no-check-certificate',
      '--cookies-from-browser', 'chrome',
      '--cookies', COOKIE_FILE_PATH,
      '--skip-download',
      '--no-playlist',
      '-q',
      videoUrl,
    ];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONWARNINGS: 'ignore',
    };
    if (ffmpegDirToUse) {
      env.PATH = `${ffmpegDirToUse}:${process.env.PATH || ''}`;
    }
    // Remove proxy env if empty to avoid overriding system proxy
    if (!process.env.HTTP_PROXY) delete env.HTTP_PROXY;
    if (!process.env.HTTPS_PROXY) delete env.HTTPS_PROXY;

    await execFile('python3', exportArgs, {
      cwd: ROOT_DIR,
      maxBuffer: 5 * 1024 * 1024,
      timeout: 30 * 1000,
      env,
    });
    // Verify file was created
    await access(COOKIE_FILE_PATH, fsConstants.R_OK);
    console.log(`Chrome cookies exported to ${COOKIE_FILE_PATH}`);
    return true;
  } catch (err) {
    console.warn('Failed to export Chrome cookies:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Get the proxy URL to use, checking env vars and common local proxy ports.
 */
async function detectProxy(): Promise<string | undefined> {
  // Priority 1: explicit environment variables
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.all_proxy;
  if (fromEnv?.trim()) {
    console.log(`Using proxy from env: ${fromEnv.trim()}`);
    return fromEnv.trim();
  }

  // Priority 2: check well-known local proxy ports (Clash, sing-box, Shadowsocks, etc.)
  const candidates = [7897, 7890, 7891, 1087, 1080, 8080, 8118, 10809];
  for (const port of candidates) {
    try {
      // Quick TCP probe: try to connect within 500ms
      await execFile('bash', ['-c', `timeout 0.5 bash -c "</dev/tcp/127.0.0.1/${port}" 2>/dev/null && echo ok`], {
        timeout: 1500,
      });
      const proxyUrl = `http://127.0.0.1:${port}`;
      console.log(`Detected local proxy at ${proxyUrl}`);
      return proxyUrl;
    } catch {
      // Port not open, try next
    }
  }

  return undefined;
}

async function runYtDlp(args: string[], isBilibili = false) {
  const ffmpegDirToUse = await ensureFfmpegAvailable().then(() => FFMPEG_DIR).catch(() => '');

  const baseArgs: string[] = [
    '-m',
    YT_DLP_MODULE,
    '--no-check-certificate',
    '--ignore-errors',
    '--socket-timeout', '30',
    '--retries', '3',
    '--fragment-retries', '3',
    '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  ];

  if (ffmpegDirToUse) {
    baseArgs.push('--ffmpeg-location', ffmpegDirToUse);
  }

  if (isBilibili) {
    baseArgs.push(
      '--add-header', 'Referer: https://www.bilibili.com/',
      '--add-header', 'Origin: https://www.bilibili.com',
      '--add-header', 'Accept: application/json, text/plain, */*',
      '--add-header', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    );
  }

  // Build clean env - don't override with empty strings
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: 'ignore' };
  if (ffmpegDirToUse) {
    env.PATH = `${ffmpegDirToUse}:${process.env.PATH || ''}`;
  }
  // Only set proxy env vars if they are actually set (don't override with empty)
  if (!process.env.HTTP_PROXY) delete env.HTTP_PROXY;
  if (!process.env.HTTPS_PROXY) delete env.HTTPS_PROXY;
  if (!process.env.ALL_PROXY) delete env.ALL_PROXY;

  return execFile('python3', [
    ...baseArgs,
    ...args,
  ], {
    cwd: ROOT_DIR,
    maxBuffer: 30 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    env,
  });
}

async function findFirstFile(dir: string, extensions: string[]) {
  const files = await readdir(dir);
  return files.find((file) => extensions.some((ext) => file.endsWith(ext))) || null;
}

async function parseVttFile(filePath: string) {
  const raw = await readFile(filePath, 'utf8');
  const blocks = raw.split(/\n\s*\n/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map((value) => value.trim().split(' ')[0]);
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

/**
 * Parse JSON from yt-dlp output - handles warnings/deprecation notices before JSON
 */
function parseYtDlpJson(stdout: string): Record<string, unknown> {
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON found in yt-dlp output');
  }
  return JSON.parse(stdout.slice(jsonStart));
}

async function analyzeYouTubeVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
  const outputTemplate = path.join(workDir, 'analysis.%(ext)s');
  const baseArgs = [
    '--no-playlist',
    '--skip-download',
    '--dump-single-json',
    '--write-auto-subs',
    '--write-subs',
    '--sub-langs', 'en.*,en,zh.*,zh-Hans.*,zh-Hant.*',
    '--convert-subs', 'vtt',
    '-o', outputTemplate,
    videoUrl,
  ];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  const strategies: string[][] = [];

  // Strategy 1: tv_embedded (bypasses SABR, most reliable)
  strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs]);

  // Strategy 2: android_embedded (no SABR, direct URLs)
  strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android_embedded', ...baseArgs]);

  // Strategy 3: ios client
  strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=ios', ...baseArgs]);

  // Strategy 4: with Chrome cookies file + tv_embedded
  if (await hasFreshCookieFile()) {
    strategies.push([
      ...proxyArg,
      '--cookies', COOKIE_FILE_PATH,
      '--extractor-args', 'youtube:player_client=tv_embedded',
      ...baseArgs,
    ]);
  }

  // Strategy 5: cookies-from-browser + tv_embedded
  if (await hasChromeCookies()) {
    strategies.push([
      ...proxyArg,
      '--cookies-from-browser', 'chrome',
      '--extractor-args', 'youtube:player_client=tv_embedded',
      ...baseArgs,
    ]);
  }

  // Strategy 6: fallback - default client, no special options
  strategies.push([...proxyArg, ...baseArgs]);

  // Strategy 7: no proxy fallback
  strategies.push([...baseArgs]);

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    const args = strategies[i];
    try {
      console.log(`Trying YouTube analysis strategy ${i + 1}/${strategies.length}...`);
      const result = await runYtDlp(args, false);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      console.log(`YouTube analysis strategy ${i + 1} succeeded!`);
      break;
    } catch (error) {
      lastError = error;
      stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
      stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
      console.log(`YouTube analysis strategy ${i + 1} failed: ${stderr.substring(0, 200)}`);
    }
  }

  if (!stdout.trim()) {
    const message =
      stderr.trim()
      || (lastError instanceof Error ? lastError.message : '')
      || 'Failed to fetch YouTube metadata for analysis.';
    throw new Error(`Failed to analyze YouTube video: ${message}`);
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Source video';
  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  const highlights = buildHeuristicHighlights(cues, duration);

  return { duration, title, highlights };
}

/**
 * Analyze a Bilibili video: get title, duration, and find highlight timestamps.
 */
async function analyzeBilibiliVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
  const outputTemplate = path.join(workDir, 'analysis.%(ext)s');
  const hasCookies = await hasChromeCookies();

  const bilibiliHeaders = [
    '--add-header', 'Referer: https://www.bilibili.com/',
    '--add-header', 'Origin: https://www.bilibili.com',
    '--add-header', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
  ];

  const analysisArgs = [
    '--no-playlist',
    '--skip-download',
    '--dump-single-json',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', 'zh-Hans,zh-Hant,zh,en.*',
    '--convert-subs', 'vtt',
    '-o', outputTemplate,
    videoUrl,
  ];

  const strategies: string[][] = [];

  if (hasCookies) {
    strategies.push(['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...analysisArgs]);
  }
  strategies.push([...bilibiliHeaders, ...analysisArgs]);

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`Trying Bilibili analysis strategy ${i + 1}/${strategies.length}...`);
      const result = await runYtDlp(strategies[i], true);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      console.log('Bilibili analysis succeeded!');
      break;
    } catch (error) {
      lastError = error;
      stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
      stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
      console.log(`Bilibili analysis strategy ${i + 1} failed: ${stderr.substring(0, 300)}`);
    }
  }

  if (!stdout.trim()) {
    const message =
      stderr.trim()
      || (lastError instanceof Error ? lastError.message : '')
      || 'Failed to fetch Bilibili metadata.';
    throw new Error(`Failed to analyze Bilibili video: ${message}`);
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Bilibili video';

  console.log(`Bilibili video: "${title}", duration: ${duration}s`);

  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  console.log(`Found ${cues.length} subtitle cues for Bilibili video`);

  const highlights = buildHeuristicHighlights(cues, duration);
  return { duration, title, highlights };
}

async function downloadSourceVideo(videoUrl: string) {
  await ensureDirectories();

  const sourceDir = path.join(CACHE_DIR, sourceId(videoUrl));
  await mkdir(sourceDir, { recursive: true });
  const cachedFile = await findFirstFile(sourceDir, ['.mp4', '.mkv', '.webm', '.mov']);
  if (cachedFile) {
    console.log(`Using cached video: ${cachedFile}`);
    return path.join(sourceDir, cachedFile);
  }

  const outputTemplate = path.join(sourceDir, 'source.%(ext)s');
  const hasCookies = await hasChromeCookies();

  if (isBilibiliUrl(videoUrl)) {
    console.log('Downloading Bilibili video...');
    return downloadBilibiliVideo(videoUrl, outputTemplate, hasCookies);
  }

  return downloadYouTubeOrGenericVideo(videoUrl, outputTemplate, hasCookies);
}

/**
 * Download a Bilibili video using yt-dlp with Chrome cookies.
 */
async function downloadBilibiliVideo(videoUrl: string, outputTemplate: string, hasCookies: boolean): Promise<string> {
  const bilibiliHeaders = [
    '--add-header', 'Referer: https://www.bilibili.com/',
    '--add-header', 'Origin: https://www.bilibili.com',
    '--add-header', 'Accept-Language: zh-CN,zh;q=0.9',
  ];

  const baseDownloadArgs = [
    '--no-playlist',
    '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    '--merge-output-format', 'mp4',
  ];

  const strategies: string[][] = [];

  if (hasCookies) {
    strategies.push([
      '--cookies-from-browser', 'chrome',
      ...bilibiliHeaders,
      ...baseDownloadArgs,
      '-f', 'bestvideo[height<=360][ext=mp4][vcodec^=hev]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]',
      videoUrl,
    ]);
    strategies.push([
      '--cookies-from-browser', 'chrome',
      ...bilibiliHeaders,
      ...baseDownloadArgs,
      '-f', 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best',
      videoUrl,
    ]);
    strategies.push([
      '--cookies-from-browser', 'chrome',
      ...bilibiliHeaders,
      ...baseDownloadArgs,
      '-f', 'bestvideo+bestaudio/best',
      videoUrl,
    ]);
  }

  strategies.push([
    ...bilibiliHeaders,
    ...baseDownloadArgs,
    '-f', 'bestvideo[height<=360]+bestaudio/best',
    videoUrl,
  ]);
  strategies.push([
    ...bilibiliHeaders,
    ...baseDownloadArgs,
    '-f', 'best',
    videoUrl,
  ]);

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`Trying Bilibili download strategy ${i + 1}/${strategies.length}...`);
      const result = await runYtDlp(strategies[i], true);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      console.log(`Bilibili download strategy ${i + 1} succeeded!`);
      break;
    } catch (error) {
      lastError = error;
      stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
      stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
      console.log(`Bilibili download strategy ${i + 1} failed: ${stderr.substring(0, 200)}`);
    }
  }

  const resolvedPath = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!resolvedPath) {
    const message =
      stderr.trim()
      || (lastError instanceof Error ? lastError.message : '')
      || 'yt-dlp did not return a local file path for Bilibili video.';
    throw new Error(
      `Failed to download Bilibili video: ${message}\n\n` +
      `Tip: Please ensure Chrome browser has a Bilibili account session active.`
    );
  }

  console.log(`Bilibili video downloaded to: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Download a YouTube or generic video using yt-dlp.
 *
 * YouTube strategy order:
 *  1. tv_embedded  - bypasses SABR, no IP-locked URLs
 *  2. android_embedded - reliable non-web client, direct MP4 URLs
 *  3. ios - Apple client, direct MP4 URLs
 *  4. android - full Android client
 *  5. tv_embedded + cookies (for age-restricted content)
 *  6. web client format 18 (fallback)
 *  7. any best format (last resort)
 */
async function downloadYouTubeOrGenericVideo(videoUrl: string, outputTemplate: string, hasCookies: boolean): Promise<string> {
  const baseArgs = [
    '--no-playlist',
    '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    '--merge-output-format', 'mp4',
  ];

  const strategies: string[][] = [];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  if (isYouTubeUrl(videoUrl)) {
    // Export cookies once if Chrome is available (more reliable than --cookies-from-browser)
    if (hasCookies && !(await hasFreshCookieFile())) {
      console.log('Exporting Chrome cookies for YouTube...');
      await exportChromeCookies(videoUrl);
    }

    const cookieFileArg: string[] = (await hasFreshCookieFile())
      ? ['--cookies', COOKIE_FILE_PATH]
      : [];

    const cookieBrowserArg: string[] = hasCookies
      ? ['--cookies-from-browser', 'chrome']
      : [];

    // Strategy 1: tv_embedded - bypasses SABR entirely
    strategies.push([
      ...proxyArg,
      '--extractor-args', 'youtube:player_client=tv_embedded',
      ...baseArgs,
      '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480][ext=mp4]/best[height<=480]/best',
      videoUrl,
    ]);

    // Strategy 2: android_embedded - direct downloadable MP4 URLs
    strategies.push([
      ...proxyArg,
      '--extractor-args', 'youtube:player_client=android_embedded',
      ...baseArgs,
      '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
      videoUrl,
    ]);

    // Strategy 3: ios client
    strategies.push([
      ...proxyArg,
      '--extractor-args', 'youtube:player_client=ios',
      ...baseArgs,
      '-f', 'best[height<=480]/best',
      videoUrl,
    ]);

    // Strategy 4: android client
    strategies.push([
      ...proxyArg,
      '--extractor-args', 'youtube:player_client=android',
      ...baseArgs,
      '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
      videoUrl,
    ]);

    // Strategy 5: tv_embedded + cookie file (age-restricted content)
    if (cookieFileArg.length > 0) {
      strategies.push([
        ...proxyArg,
        ...cookieFileArg,
        '--extractor-args', 'youtube:player_client=tv_embedded',
        ...baseArgs,
        '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best',
        videoUrl,
      ]);
    }

    // Strategy 6: tv_embedded + cookies-from-browser
    if (cookieBrowserArg.length > 0) {
      strategies.push([
        ...proxyArg,
        ...cookieBrowserArg,
        '--extractor-args', 'youtube:player_client=tv_embedded',
        ...baseArgs,
        '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best',
        videoUrl,
      ]);
    }

    // Strategy 7: web client format 18 (legacy 360p, direct HTTP)
    strategies.push([
      ...proxyArg,
      ...baseArgs,
      '-f', '18',
      videoUrl,
    ]);

    // Strategy 8: any best format, no proxy fallback
    strategies.push([
      '--extractor-args', 'youtube:player_client=tv_embedded',
      ...baseArgs,
      '-f', 'best',
      videoUrl,
    ]);

    // Strategy 9: last resort - default yt-dlp behavior
    strategies.push([
      ...baseArgs,
      '-f', 'best',
      videoUrl,
    ]);
  } else {
    // Generic video
    strategies.push([
      ...baseArgs,
      '-f', 'bestvideo*+bestaudio/best',
      videoUrl,
    ]);
  }

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    const args = strategies[i];
    try {
      console.log(`Trying YouTube/generic download strategy ${i + 1}/${strategies.length}...`);
      const result = await runYtDlp(args, false);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      console.log(`Download strategy ${i + 1} succeeded!`);
      break;
    } catch (error) {
      lastError = error;
      stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
      stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
      console.log(`Download strategy ${i + 1} failed: ${stderr.substring(0, 200)}`);
    }
  }

  const resolvedPath = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();

  if (!resolvedPath) {
    const message =
      stderr.trim()
      || (lastError instanceof Error ? lastError.message : '')
      || 'yt-dlp did not return a local source file path.';
    throw new Error(`Failed to download video: ${message}`);
  }

  return resolvedPath;
}

/**
 * Generate a JPEG thumbnail from a video clip at a given timestamp.
 * The thumbnail is saved alongside the clip in PUBLIC_CLIP_DIR.
 */
async function generateThumbnail(clipPath: string, clipDuration: number): Promise<string> {
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = thumbFileName(path.basename(clipPath));
  const thumbPath = path.join(PUBLIC_CLIP_DIR, fileName);

  // Seek to 25% into clip, minimum 2s, maximum 10s
  const seekTime = Math.min(10, Math.max(2, Math.floor(clipDuration * 0.25)));

  try {
    await execFile(ffmpegPath, [
      '-y',
      '-ss', String(seekTime),
      '-i', clipPath,
      '-vframes', '1',
      '-q:v', '2',
      '-vf', 'scale=640:-2',
      thumbPath,
    ], {
      timeout: 30 * 1000,
      maxBuffer: 5 * 1024 * 1024,
    });

    // Verify thumbnail was created
    await access(thumbPath, fsConstants.R_OK);
    return `/generated-clips/${fileName}`;
  } catch (err) {
    console.warn('Thumbnail generation failed:', err instanceof Error ? err.message : err);

    // Fallback: try at 1 second
    try {
      await execFile(ffmpegPath, [
        '-y',
        '-ss', '1',
        '-i', clipPath,
        '-vframes', '1',
        '-q:v', '3',
        thumbPath,
      ], {
        timeout: 20 * 1000,
        maxBuffer: 5 * 1024 * 1024,
      });
      await access(thumbPath, fsConstants.R_OK);
      return `/generated-clips/${fileName}`;
    } catch {
      // Thumbnail completely failed - return empty string, clip is still valid
      return '';
    }
  }
}

async function downloadYouTubeClip(params: {
  videoUrl: string;
  title: string;
  startTime: number;
  endTime: number;
}) {
  const inputPath = await downloadSourceVideo(params.videoUrl);
  return createLocalClip({
    inputPath,
    startTime: params.startTime,
    endTime: params.endTime,
    title: params.title,
  });
}

async function analyzeVideo(videoUrl: string): Promise<VideoAnalysisResult> {
  await ensureDirectories();
  const workDir = path.join(CACHE_DIR, sourceId(videoUrl));
  await mkdir(workDir, { recursive: true });

  if (isYouTubeUrl(videoUrl)) {
    try {
      return await analyzeYouTubeVideo(videoUrl, workDir);
    } catch (error) {
      console.warn('YouTube analysis failed, using fallback:', error);
      return {
        duration: 180,
        title: 'YouTube video',
        highlights: buildFallbackHighlights(180),
      };
    }
  }

  if (isBilibiliUrl(videoUrl)) {
    try {
      return await analyzeBilibiliVideo(videoUrl, workDir);
    } catch (error) {
      console.warn('Bilibili analysis failed, using fallback:', error);
      return {
        duration: 180,
        title: 'Bilibili video',
        highlights: buildFallbackHighlights(180),
      };
    }
  }

  return {
    duration: 180,
    title: 'Source video',
    highlights: buildFallbackHighlights(180),
  };
}

async function createLocalClip(params: {
  inputPath: string;
  startTime: number;
  endTime: number;
  title: string;
}): Promise<ClipResult> {
  await ensureDirectories();
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = clipFileName(params.title);
  const outputPath = path.join(PUBLIC_CLIP_DIR, fileName);
  const duration = Math.max(1, params.endTime - params.startTime);

  const args = [
    '-y',
    '-ss', String(params.startTime),
    '-i', params.inputPath,
    '-t', String(duration),
    '-map', '0:v:0',
    '-map', '0:a:0?',
    // High-quality H.264 encoding: CRF 18 = visually lossless, preset fast = good compression
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-profile:v', 'high',
    '-level:v', '4.1',
    // Ensure width/height are divisible by 2 (required for H.264)
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    await execFile(ffmpegPath, args, {
      cwd: ROOT_DIR,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr)
      : '';
    throw new Error(stderr.trim() || 'ffmpeg failed to generate the clip.');
  }

  // Generate thumbnail from the clip
  const thumbnailUrl = await generateThumbnail(outputPath, duration);
  console.log(`Clip created: ${outputPath}, thumbnail: ${thumbnailUrl || '(none)'}`);

  return {
    outputPath,
    publicUrl: `/generated-clips/${fileName}`,
    thumbnailUrl,
  };
}

const videoClipper = {
  analyzeVideo,
  createLocalClip,
  downloadSourceVideo,
  downloadYouTubeClip,
  isYouTubeUrl,
  isBilibiliUrl,
};

export default videoClipper;
