/**
 * video-clipper.ts
 * Core server-side library for AI-powered video analysis and clip generation.
 * Supports Bilibili and YouTube via yt-dlp + ffmpeg.
 * Generates real MP4 clips and JPEG thumbnails from highlight timestamps.
 *
 * Serverless-compatible:
 *  - All file I/O uses /tmp (writable on Vercel and other serverless platforms)
 *  - ffmpeg binary resolved via @ffmpeg-installer/ffmpeg (cross-platform)
 *  - yt-dlp: tries python3 -m yt_dlp first; on Linux auto-downloads standalone binary to /tmp
 *  - Clips are served via /api/serve-clip/[filename] API route (not static public/ dir)
 */

import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

const execFile = promisify(execFileCallback);

// ── Directories (writable on all platforms including serverless) ────────────
const TMP_DIR = '/tmp';
const PUBLIC_CLIP_DIR = path.join(TMP_DIR, 'generated-clips');
const CACHE_DIR = path.join(TMP_DIR, 'video-cache');

// ── yt-dlp binary ───────────────────────────────────────────────────────────
const YT_DLP_BIN_PATH = path.join(TMP_DIR, 'yt-dlp');
// URL for yt-dlp standalone Linux binary (no Python required)
const YT_DLP_LINUX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

// ── ffmpeg (cross-platform via @ffmpeg-installer/ffmpeg) ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller: { path: string } = require('@ffmpeg-installer/ffmpeg');

// Cookie file from a previous yt-dlp export (macOS local dev only)
const COOKIE_FILE_PATH = path.join(CACHE_DIR, 'yt-cookies.txt');
const CHROME_COOKIE_DB = path.join(
  process.env.HOME || '',
  'Library/Application Support/Google/Chrome/Default/Cookies',
);

// ── Types ───────────────────────────────────────────────────────────────────
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

// ── Clip config ─────────────────────────────────────────────────────────────
const CLIP_TARGET_DURATION = 60;
const CLIP_MIN_DURATION = 45;
const CLIP_MAX_DURATION = 65;
const MAX_HIGHLIGHTS = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function cleanCueText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Highlight normalisation ──────────────────────────────────────────────────
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
  for (const highlight of normalized) {
    const previous = deduped[deduped.length - 1];
    if (!previous) { deduped.push(highlight); continue; }
    const adjustedStart = Math.max(highlight.start_time, previous.end_time);
    const adjustedEnd = Math.min(
      safeDuration,
      Math.max(adjustedStart + CLIP_MIN_DURATION, highlight.end_time),
    );
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
    duration,
  );
}

function buildHeuristicHighlights(cues: CaptionCue[], duration: number) {
  if (cues.length === 0) return buildFallbackHighlights(duration);

  const windows: Highlight[] = [];
  const step = 20;
  const length = CLIP_TARGET_DURATION;
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
      (sum, kw) => sum + (text.toLowerCase().includes(kw.toLowerCase()) ? 2 : 0),
      0,
    );
    const punctuationScore = (text.match(/[!?！？]/g) || []).length;
    const densityScore = Math.min(8, Math.floor(text.length / 80));
    const score = 4 + keywordScore + punctuationScore + densityScore;
    const title =
      text
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .join(' ') || `Highlight at ${formatSeconds(start)}`;

    windows.push({
      title: title.slice(0, 80),
      start_time: start,
      end_time: end,
      summary: text.slice(0, 140),
      engagement_score: Math.min(10, score),
    });
  }

  windows.sort((a, b) => b.engagement_score - a.engagement_score);
  const targetCount = Math.min(MAX_HIGHLIGHTS, Math.max(6, Math.floor(duration / 120)));
  const selected: Highlight[] = [];
  for (const candidate of windows) {
    const overlaps = selected.some(
      (item) =>
        Math.max(item.start_time, candidate.start_time) <
        Math.min(item.end_time, candidate.end_time),
    );
    if (!overlaps) selected.push(candidate);
    if (selected.length === targetCount) break;
  }

  return normalizeHighlights(
    selected.length >= 2 ? selected : buildFallbackHighlights(duration),
    duration,
  );
}

// ── Ensure directories ───────────────────────────────────────────────────────
async function ensureDirectories() {
  await mkdir(PUBLIC_CLIP_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
}

// ── ffmpeg (cross-platform) ──────────────────────────────────────────────────
async function ensureFfmpegAvailable(): Promise<string> {
  // 1. Try @ffmpeg-installer/ffmpeg (bundled cross-platform binary)
  try {
    const fp = ffmpegInstaller.path;
    await access(fp, fsConstants.X_OK);
    console.log(`Using bundled ffmpeg: ${fp}`);
    return fp;
  } catch {
    // fall through
  }

  // 2. Try system ffmpeg in PATH
  try {
    const { stdout } = await execFile('which', ['ffmpeg']);
    const fp = stdout.trim();
    if (fp) {
      await access(fp, fsConstants.X_OK);
      console.log(`Using system ffmpeg: ${fp}`);
      return fp;
    }
  } catch {
    // fall through
  }

  throw new Error('ffmpeg is not available. Cannot generate video clips.');
}

// ── yt-dlp binary (works both locally and on Vercel/Linux) ──────────────────
let ytDlpCommand: string | null = null;
let ytDlpUseModule = false;

async function ensureYtDlp(): Promise<void> {
  if (ytDlpCommand) return; // already resolved

  // 1. Try python3 -m yt_dlp (local dev with pip-installed yt-dlp)
  try {
    await execFile('python3', ['-m', 'yt_dlp', '--version'], {
      timeout: 8000,
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
    });
    ytDlpCommand = 'python3';
    ytDlpUseModule = true;
    console.log('Using python3 -m yt_dlp');
    return;
  } catch {
    // fall through
  }

  // 2. Try standalone yt-dlp binary in PATH
  try {
    await execFile('yt-dlp', ['--version'], { timeout: 5000 });
    ytDlpCommand = 'yt-dlp';
    ytDlpUseModule = false;
    console.log('Using system yt-dlp binary');
    return;
  } catch {
    // fall through
  }

  // 3. Try cached binary in /tmp
  try {
    await access(YT_DLP_BIN_PATH, fsConstants.X_OK);
    await execFile(YT_DLP_BIN_PATH, ['--version'], { timeout: 5000 });
    ytDlpCommand = YT_DLP_BIN_PATH;
    ytDlpUseModule = false;
    console.log(`Using cached yt-dlp binary at ${YT_DLP_BIN_PATH}`);
    return;
  } catch {
    // fall through
  }

  // 4. Download standalone Linux binary (for Vercel / Linux servers)
  if (process.platform === 'linux') {
    console.log('Downloading yt-dlp standalone Linux binary…');
    try {
      const res = await fetch(YT_DLP_LINUX_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      await writeFile(YT_DLP_BIN_PATH, Buffer.from(buf));
      await chmod(YT_DLP_BIN_PATH, 0o755);
      // Verify
      await execFile(YT_DLP_BIN_PATH, ['--version'], { timeout: 10000 });
      ytDlpCommand = YT_DLP_BIN_PATH;
      ytDlpUseModule = false;
      console.log('yt-dlp binary downloaded and ready');
      return;
    } catch (err) {
      console.error('Failed to download yt-dlp binary:', err);
    }
  }

  throw new Error(
    'yt-dlp is not available. On macOS, install with: pip3 install yt-dlp. On Linux, ensure yt-dlp is in PATH.',
  );
}

async function runYtDlp(args: string[], isBilibili = false) {
  await ensureYtDlp();

  const ffmpegPath = await ensureFfmpegAvailable().catch(() => '');
  const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : '';

  const commonArgs: string[] = [
    '--no-check-certificate',
    '--ignore-errors',
    '--socket-timeout', '30',
    '--retries', '3',
    '--fragment-retries', '3',
    '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  ];

  if (ffmpegDir) commonArgs.push('--ffmpeg-location', ffmpegDir);
  if (ffmpegPath && !ytDlpUseModule) commonArgs.push('--ffmpeg-location', path.dirname(ffmpegPath));

  if (isBilibili) {
    commonArgs.push(
      '--add-header', 'Referer: https://www.bilibili.com/',
      '--add-header', 'Origin: https://www.bilibili.com',
      '--add-header', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    );
  }

  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: 'ignore' };
  if (ffmpegDir) env.PATH = `${ffmpegDir}:${process.env.PATH || ''}`;
  if (!process.env.HTTP_PROXY) delete env.HTTP_PROXY;
  if (!process.env.HTTPS_PROXY) delete env.HTTPS_PROXY;
  if (!process.env.ALL_PROXY) delete env.ALL_PROXY;

  let cmd: string;
  let cmdArgs: string[];

  if (ytDlpUseModule) {
    // python3 -m yt_dlp [commonArgs] [args]
    cmd = 'python3';
    cmdArgs = ['-m', 'yt_dlp', ...commonArgs, ...args];
  } else {
    // /path/to/yt-dlp [commonArgs] [args]
    cmd = ytDlpCommand!;
    cmdArgs = [...commonArgs, ...args];
  }

  return execFile(cmd, cmdArgs, {
    cwd: CACHE_DIR,
    maxBuffer: 30 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    env,
  });
}

// ── Cookie helpers (macOS local dev) ─────────────────────────────────────────
async function hasChromeCookies() {
  try {
    await access(CHROME_COOKIE_DB, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasFreshCookieFile(): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(COOKIE_FILE_PATH);
    return Date.now() - stats.mtimeMs < 30 * 60 * 1000;
  } catch {
    return false;
  }
}

async function exportChromeCookies(videoUrl: string): Promise<boolean> {
  if (!ytDlpUseModule) return false; // only available with python yt-dlp
  try {
    const ffmpegPath = await ensureFfmpegAvailable().catch(() => '');
    const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : '';
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONWARNINGS: 'ignore',
      ...(ffmpegDir ? { PATH: `${ffmpegDir}:${process.env.PATH || ''}` } : {}),
    };
    await execFile('python3', [
      '-m', 'yt_dlp',
      '--no-check-certificate',
      '--cookies-from-browser', 'chrome',
      '--cookies', COOKIE_FILE_PATH,
      '--skip-download',
      '--no-playlist',
      '-q',
      videoUrl,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 30_000, env });
    await access(COOKIE_FILE_PATH, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ── Proxy detection ──────────────────────────────────────────────────────────
async function detectProxy(): Promise<string | undefined> {
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    process.env.all_proxy;
  if (fromEnv?.trim()) return fromEnv.trim();

  // Only probe local proxy ports on non-serverless environments
  if (process.env.VERCEL) return undefined;

  const candidates = [7897, 7890, 7891, 1087, 1080, 8080, 8118, 10809];
  for (const port of candidates) {
    try {
      await execFile('bash', ['-c', `timeout 0.5 bash -c "</dev/tcp/127.0.0.1/${port}" 2>/dev/null && echo ok`], {
        timeout: 1500,
      });
      return `http://127.0.0.1:${port}`;
    } catch {
      // try next
    }
  }
  return undefined;
}

// ── VTT parsing ──────────────────────────────────────────────────────────────
async function findFirstFile(dir: string, extensions: string[]) {
  try {
    const files = await readdir(dir);
    return files.find((file) => extensions.some((ext) => file.endsWith(ext))) || null;
  } catch {
    return null;
  }
}

async function parseVttFile(filePath: string) {
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
  if (jsonStart === -1) throw new Error('No JSON found in yt-dlp output');
  return JSON.parse(stdout.slice(jsonStart));
}

// ── YouTube analysis ─────────────────────────────────────────────────────────
async function analyzeYouTubeVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
  const outputTemplate = path.join(workDir, 'analysis.%(ext)s');
  const baseArgs = [
    '--no-playlist', '--skip-download', '--dump-single-json',
    '--write-auto-subs', '--write-subs',
    '--sub-langs', 'en.*,en,zh.*,zh-Hans.*,zh-Hant.*',
    '--convert-subs', 'vtt',
    '-o', outputTemplate,
    videoUrl,
  ];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  const strategies: string[][] = [
    [...proxyArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs],
    [...proxyArg, '--extractor-args', 'youtube:player_client=android_embedded', ...baseArgs],
    [...proxyArg, '--extractor-args', 'youtube:player_client=ios', ...baseArgs],
    [...proxyArg, ...baseArgs],
    baseArgs,
  ];

  // Add cookie strategies if available (local dev only)
  if (await hasFreshCookieFile()) {
    strategies.splice(3, 0, [
      ...proxyArg, '--cookies', COOKIE_FILE_PATH,
      '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs,
    ]);
  }
  if (await hasChromeCookies()) {
    strategies.splice(3, 0, [
      ...proxyArg, '--cookies-from-browser', 'chrome',
      '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs,
    ]);
  }

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`YouTube analysis strategy ${i + 1}/${strategies.length}…`);
      const result = await runYtDlp(strategies[i], false);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      console.log(`YouTube analysis strategy ${i + 1} succeeded`);
      break;
    } catch (error) {
      lastError = error;
      stdout = (error && typeof error === 'object' && 'stdout' in error) ? String(error.stdout) : '';
      stderr = (error && typeof error === 'object' && 'stderr' in error) ? String(error.stderr) : '';
      console.log(`Strategy ${i + 1} failed: ${stderr.substring(0, 200)}`);
    }
  }

  if (!stdout.trim()) {
    const msg =
      stderr.trim() ||
      (lastError instanceof Error ? lastError.message : '') ||
      'Failed to fetch YouTube metadata.';
    throw new Error(`Failed to analyze YouTube video: ${msg}`);
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Source video';
  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}

// ── Bilibili analysis ────────────────────────────────────────────────────────
async function analyzeBilibiliVideo(videoUrl: string, workDir: string): Promise<VideoAnalysisResult> {
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
    '-o', outputTemplate,
    videoUrl,
  ];

  const hasCookies = await hasChromeCookies();
  const strategies: string[][] = [];
  if (hasCookies) strategies.push(['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...analysisArgs]);
  strategies.push([...bilibiliHeaders, ...analysisArgs]);

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await runYtDlp(strategies[i], true);
      stdout = result.stdout;
      stderr = result.stderr;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      stdout = (error && typeof error === 'object' && 'stdout' in error) ? String(error.stdout) : '';
      stderr = (error && typeof error === 'object' && 'stderr' in error) ? String(error.stderr) : '';
    }
  }

  if (!stdout.trim()) {
    const msg =
      stderr.trim() ||
      (lastError instanceof Error ? lastError.message : '') ||
      'Failed to fetch Bilibili metadata.';
    throw new Error(`Failed to analyze Bilibili video: ${msg}`);
  }

  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor((info.duration as number) || 180));
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Bilibili video';
  const subtitleFile = await findFirstFile(workDir, ['.vtt']);
  const cues = subtitleFile ? await parseVttFile(path.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}

// ── Video download ───────────────────────────────────────────────────────────
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

  if (isBilibiliUrl(videoUrl)) return downloadBilibiliVideo(videoUrl, outputTemplate, hasCookies);
  return downloadYouTubeOrGenericVideo(videoUrl, outputTemplate, hasCookies);
}

async function downloadBilibiliVideo(
  videoUrl: string,
  outputTemplate: string,
  hasCookies: boolean,
): Promise<string> {
  const bilibiliHeaders = [
    '--add-header', 'Referer: https://www.bilibili.com/',
    '--add-header', 'Origin: https://www.bilibili.com',
    '--add-header', 'Accept-Language: zh-CN,zh;q=0.9',
  ];
  const baseDownloadArgs = [
    '--no-playlist', '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    '--merge-output-format', 'mp4',
  ];

  const strategies: string[][] = [];
  if (hasCookies) {
    strategies.push(['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...baseDownloadArgs, '-f', 'bestvideo[height<=360]+bestaudio/best', videoUrl]);
    strategies.push(['--cookies-from-browser', 'chrome', ...bilibiliHeaders, ...baseDownloadArgs, '-f', 'best', videoUrl]);
  }
  strategies.push([...bilibiliHeaders, ...baseDownloadArgs, '-f', 'bestvideo[height<=360]+bestaudio/best', videoUrl]);
  strategies.push([...bilibiliHeaders, ...baseDownloadArgs, '-f', 'best', videoUrl]);

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await runYtDlp(strategies[i], true);
      stdout = result.stdout; stderr = result.stderr; lastError = null; break;
    } catch (error) {
      lastError = error;
      stdout = (error && typeof error === 'object' && 'stdout' in error) ? String(error.stdout) : '';
      stderr = (error && typeof error === 'object' && 'stderr' in error) ? String(error.stderr) : '';
    }
  }

  const resolvedPath = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  if (!resolvedPath) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : '') || 'No file path returned.';
    throw new Error(`Failed to download Bilibili video: ${msg}`);
  }
  return resolvedPath;
}

async function downloadYouTubeOrGenericVideo(
  videoUrl: string,
  outputTemplate: string,
  hasCookies: boolean,
): Promise<string> {
  const baseArgs = [
    '--no-playlist', '--restrict-filenames',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    '--merge-output-format', 'mp4',
  ];

  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ['--proxy', proxyUrl] : [];

  const strategies: string[][] = [];

  if (isYouTubeUrl(videoUrl)) {
    // Export cookies once if Chrome is available (local dev only)
    if (hasCookies && !(await hasFreshCookieFile())) {
      await exportChromeCookies(videoUrl);
    }
    const cookieFileArg = (await hasFreshCookieFile()) ? ['--cookies', COOKIE_FILE_PATH] : [];
    const cookieBrowserArg = hasCookies ? ['--cookies-from-browser', 'chrome'] : [];

    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best', videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android_embedded', ...baseArgs, '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=ios', ...baseArgs, '-f', 'best[height<=480]/best', videoUrl]);
    strategies.push([...proxyArg, '--extractor-args', 'youtube:player_client=android', ...baseArgs, '-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', videoUrl]);
    if (cookieFileArg.length > 0) strategies.push([...proxyArg, ...cookieFileArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best', videoUrl]);
    if (cookieBrowserArg.length > 0) strategies.push([...proxyArg, ...cookieBrowserArg, '--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best', videoUrl]);
    strategies.push([...proxyArg, ...baseArgs, '-f', '18', videoUrl]);
    strategies.push(['--extractor-args', 'youtube:player_client=tv_embedded', ...baseArgs, '-f', 'best', videoUrl]);
    strategies.push([...baseArgs, '-f', 'best', videoUrl]);
  } else {
    strategies.push([...baseArgs, '-f', 'bestvideo*+bestaudio/best', videoUrl]);
  }

  let stdout = '';
  let stderr = '';
  let lastError: unknown;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`Download strategy ${i + 1}/${strategies.length}…`);
      const result = await runYtDlp(strategies[i], false);
      stdout = result.stdout; stderr = result.stderr; lastError = null;
      console.log(`Download strategy ${i + 1} succeeded`);
      break;
    } catch (error) {
      lastError = error;
      stdout = (error && typeof error === 'object' && 'stdout' in error) ? String(error.stdout) : '';
      stderr = (error && typeof error === 'object' && 'stderr' in error) ? String(error.stderr) : '';
      console.log(`Strategy ${i + 1} failed: ${stderr.substring(0, 200)}`);
    }
  }

  const resolvedPath = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  if (!resolvedPath) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : '') || 'No file path returned.';
    throw new Error(`Failed to download video: ${msg}`);
  }
  return resolvedPath;
}

// ── Thumbnail generation ──────────────────────────────────────────────────────
async function generateThumbnail(clipPath: string, clipDuration: number): Promise<string> {
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = thumbFileName(path.basename(clipPath));
  const thumbPath = path.join(PUBLIC_CLIP_DIR, fileName);
  const seekTime = Math.min(10, Math.max(2, Math.floor(clipDuration * 0.25)));

  const tryThumb = async (seek: number) => {
    await execFile(ffmpegPath, [
      '-y', '-ss', String(seek), '-i', clipPath,
      '-vframes', '1', '-q:v', '2', '-vf', 'scale=640:-2',
      thumbPath,
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

// ── Clip creation ─────────────────────────────────────────────────────────────
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
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-profile:v', 'high',
    '-level:v', '4.1',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac',
    '-b:a', '192k',
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
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(stderr.trim() || 'ffmpeg failed to generate the clip.');
  }

  const thumbnailUrl = await generateThumbnail(outputPath, duration);
  console.log(`Clip created: ${outputPath}, thumbnail: ${thumbnailUrl || '(none)'}`);

  return {
    outputPath,
    // Serve via API route (works in serverless environments, not just local static files)
    publicUrl: `/api/serve-clip/${fileName}`,
    thumbnailUrl,
  };
}

// ── Video analysis (public API) ───────────────────────────────────────────────
async function analyzeVideo(videoUrl: string): Promise<VideoAnalysisResult> {
  await ensureDirectories();
  const workDir = path.join(CACHE_DIR, sourceId(videoUrl));
  await mkdir(workDir, { recursive: true });

  if (isYouTubeUrl(videoUrl)) {
    try {
      return await analyzeYouTubeVideo(videoUrl, workDir);
    } catch (error) {
      console.warn('YouTube analysis failed, using fallback:', error);
      return { duration: 180, title: 'YouTube video', highlights: buildFallbackHighlights(180) };
    }
  }

  if (isBilibiliUrl(videoUrl)) {
    try {
      return await analyzeBilibiliVideo(videoUrl, workDir);
    } catch (error) {
      console.warn('Bilibili analysis failed, using fallback:', error);
      return { duration: 180, title: 'Bilibili video', highlights: buildFallbackHighlights(180) };
    }
  }

  return { duration: 180, title: 'Source video', highlights: buildFallbackHighlights(180) };
}

async function downloadYouTubeClip(params: {
  videoUrl: string;
  title: string;
  startTime: number;
  endTime: number;
}) {
  const inputPath = await downloadSourceVideo(params.videoUrl);
  return createLocalClip({ inputPath, startTime: params.startTime, endTime: params.endTime, title: params.title });
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
