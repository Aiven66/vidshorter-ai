"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/agent/runner.ts
var import_node_crypto2 = require("crypto");

// src/lib/server/video-clipper.ts
var import_node_util = require("util");
var import_node_child_process = require("child_process");
var import_node_crypto = require("crypto");
var import_promises = require("fs/promises");
var import_node_path = __toESM(require("path"));
var import_node_fs = require("fs");
var import_node_events = require("events");
var import_node_stream = require("stream");
var execFile = (0, import_node_util.promisify)(import_node_child_process.execFile);
var TMP_DIR = "/tmp";
var PUBLIC_CLIP_DIR = import_node_path.default.join(TMP_DIR, "generated-clips");
var CACHE_DIR = import_node_path.default.join(TMP_DIR, "video-cache");
var YT_DLP_BIN_PATH = import_node_path.default.join(TMP_DIR, "yt-dlp");
var YT_DLP_LINUX_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
var YT_DLP_DARWIN_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
var ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
var PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.mha.fi",
  "https://watchapi.whatever.social",
  "https://api.piped.projectsegfau.lt",
  "https://piped-api.privacy.com.de"
];
var INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://iv.datura.network",
  "https://invidious.lunar.icu",
  "https://yt.artemislena.eu"
];
var COBALT_INSTANCES = [
  "https://cobalt.ggtyler.dev/",
  "https://cobalt.api.timelessnesses.me/"
];
function getCobaltInstances() {
  const urls = [...COBALT_INSTANCES];
  const token = (process.env.COBALT_API_TOKEN || process.env.COBALT_TOKEN || process.env.COBALT_API_KEY || "").trim();
  if (token) urls.push("https://api.cobalt.tools/");
  return urls;
}
function getCfWorkerUrl() {
  const raw = String(process.env["CF_WORKER_URL"] || process.env.CF_WORKER_URL || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}
function getCfWorkerMaxHeight() {
  const fallback = IS_VERCEL ? 720 : YOUTUBE_MAX_HEIGHT;
  return clampInt(process.env.CF_WORKER_MAX_HEIGHT, 144, 1080, fallback);
}
function getAppBaseUrl() {
  const raw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const value = raw || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!value) return "";
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProto.replace(/\/$/, "");
}
function getVercelProtectionBypassHeaders() {
  const secret = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || process.env.VERCEL_BYPASS_SECRET || "").trim();
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}
function getBypassHeadersForUrl(url) {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) return {};
  if (!url.startsWith(baseUrl)) return {};
  return getVercelProtectionBypassHeaders();
}
function getBypassFfmpegHeaderString() {
  const headers = getVercelProtectionBypassHeaders();
  const secret = headers["x-vercel-protection-bypass"];
  return secret ? `x-vercel-protection-bypass: ${secret}\r
` : "";
}
function getLocalMediaBaseUrl() {
  const raw = String(process.env.VIDSHORTER_LOCAL_MEDIA_BASE_URL || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}
var COOKIE_FILE_PATH = import_node_path.default.join(CACHE_DIR, "yt-cookies.txt");
var CHROME_COOKIE_DB = import_node_path.default.join(
  process.env.HOME || "",
  "Library/Application Support/Google/Chrome/Default/Cookies"
);
var CLIP_TARGET_DURATION = 60;
var CLIP_MIN_DURATION = 45;
var CLIP_MAX_DURATION = 65;
var MAX_HIGHLIGHTS = 10;
var IS_VERCEL = !!process.env.VERCEL;
var SHOULD_INLINE_CLIPS = IS_VERCEL || process.env.INLINE_CLIPS === "1";
var FORCE_YOUTUBE_STREAM_FALLBACKS = IS_VERCEL || process.env.PREFER_EDGE_YOUTUBE === "1" || process.env.FORCE_YOUTUBE_STREAM === "1";
function clampInt(value, min, max, fallback) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function ensureEven(n) {
  return n % 2 === 0 ? n : n - 1;
}
function clipDurations(duration) {
  const d = Math.max(0, Math.floor(duration));
  if (d <= 8 * 60) return { target: 35, min: 20, max: 45 };
  if (d <= 20 * 60) return { target: 50, min: 35, max: 60 };
  return { target: CLIP_TARGET_DURATION, min: CLIP_MIN_DURATION, max: CLIP_MAX_DURATION };
}
var VERCEL_CRF = String(clampInt(process.env.VERCEL_CLIP_CRF, 18, 40, 23));
var VERCEL_TARGET_WIDTH_NUM = ensureEven(clampInt(process.env.VERCEL_CLIP_WIDTH, 640, 1920, 1920));
var VERCEL_TARGET_HEIGHT_NUM = ensureEven(clampInt(process.env.VERCEL_CLIP_HEIGHT, 360, 1080, 1080));
var VERCEL_TARGET_WIDTH = String(VERCEL_TARGET_WIDTH_NUM);
var VERCEL_TARGET_HEIGHT = String(VERCEL_TARGET_HEIGHT_NUM);
var VERCEL_SCALE = `scale=trunc(min(iw\\,${VERCEL_TARGET_WIDTH})/2)*2:trunc(min(ih\\,${VERCEL_TARGET_HEIGHT})/2)*2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`;
var INLINE_CRF = IS_VERCEL ? VERCEL_CRF : String(clampInt(process.env.LOCAL_INLINE_CRF, 16, 32, 20));
var INLINE_PRESET = IS_VERCEL ? "veryfast" : String(process.env.LOCAL_INLINE_PRESET || "fast");
var MAX_INLINE_BYTES = 25 * 1024 * 1024;
var LOCAL_MAX_HEIGHT = process.env.CLIP_MAX_HEIGHT || "1080";
var YOUTUBE_MAX_HEIGHT = parseInt(
  process.env.YOUTUBE_MAX_HEIGHT || (IS_VERCEL ? "1080" : LOCAL_MAX_HEIGHT),
  10
) || (IS_VERCEL ? 1080 : 1080);
function isYouTubeUrl(videoUrl) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes("youtube.com") || hostname.includes("youtu.be");
  } catch {
    return false;
  }
}
function isBilibiliUrl(videoUrl) {
  try {
    const { hostname } = new URL(videoUrl);
    return hostname.includes("bilibili.com") || hostname.includes("b23.tv");
  } catch {
    return false;
  }
}
function isValidYouTubeVideoId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{11}$/.test(value);
}
function extractYouTubeVideoId(url) {
  try {
    const u = new URL(url);
    const vParam = u.searchParams.get("v");
    if (isValidYouTubeVideoId(vParam)) return vParam;
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return isValidYouTubeVideoId(id) ? id : null;
    }
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["shorts", "embed", "live"].includes(parts[0])) {
      const id = parts[1];
      return isValidYouTubeVideoId(id) ? id : null;
    }
    const maybeId = parts[0];
    return isValidYouTubeVideoId(maybeId) ? maybeId : null;
  } catch {
    return null;
  }
}
async function resolveFinalUrl(inputUrl) {
  try {
    const res = await fetch(inputUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(1e4)
    });
    res.body?.cancel();
    return res.url || inputUrl;
  } catch {
    return inputUrl;
  }
}
async function normalizeVideoUrl(videoUrl) {
  const trimmed = videoUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (isYouTubeUrl(trimmed)) {
      const id = extractYouTubeVideoId(trimmed);
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (u.hostname.includes("b23.tv")) {
      return await resolveFinalUrl(trimmed);
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}
function sourceId(videoUrl) {
  return (0, import_node_crypto.createHash)("sha1").update(videoUrl).digest("hex");
}
function clipFileName(title) {
  const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `${safe || "highlight"}-${(0, import_node_crypto.randomUUID)()}.mp4`;
}
function thumbFileName(clipFile) {
  return clipFile.replace(/\.mp4$/, ".jpg");
}
function formatSeconds(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const secs = total % 60;
  const head = hours > 0 ? `${String(hours).padStart(2, "0")}:` : "";
  return `${head}${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
function parseVttTimestamp(value) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}
function cleanCueText(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
}
function buildHighlightReason(text, score) {
  const t = (text || "").toLowerCase();
  const hasPunct = /[!?！？]/.test(text);
  const hasKeyword = [
    "important",
    "secret",
    "best",
    "amazing",
    "crazy",
    "must",
    "mistake",
    "learn",
    "\u5173\u952E",
    "\u91CD\u70B9",
    "\u4E00\u5B9A",
    "\u9707\u60CA",
    "\u5389\u5BB3",
    "\u65B9\u6CD5",
    "\u79D8\u8BC0",
    "\u6280\u5DE7"
  ].some((k) => t.includes(k.toLowerCase()));
  const dense = text.length >= 160;
  if (hasPunct || score >= 8 || hasKeyword) {
    return {
      zh: "\u8BE5\u7247\u6BB5\u4FE1\u606F\u5BC6\u5EA6\u9AD8\u4E14\u5305\u542B\u5173\u952E\u8868\u8FBE\uFF0C\u9002\u5408\u4F5C\u4E3A\u9AD8\u5149\u5C55\u793A\u3002",
      en: "High information density with key moments, making it a strong highlight."
    };
  }
  if (dense) {
    return {
      zh: "\u8BE5\u7247\u6BB5\u5185\u5BB9\u8FDE\u8D2F\u4E14\u4FE1\u606F\u91CF\u8F83\u9AD8\uFF0C\u9002\u5408\u4F5C\u4E3A\u9AD8\u5149\u6458\u8981\u3002",
      en: "Clear, content-rich segment selected as a concise highlight."
    };
  }
  return {
    zh: "\u8BE5\u7247\u6BB5\u4EE3\u8868\u89C6\u9891\u4E2D\u7684\u5178\u578B\u7247\u6BB5\uFF0C\u9002\u5408\u4F5C\u4E3A\u9AD8\u5149\u56DE\u987E\u3002",
    en: "Representative moment selected to summarize the video."
  };
}
function normalizeHighlights(input, duration) {
  const safeDuration = Math.max(duration, 60);
  const cfg = clipDurations(safeDuration);
  const normalized = input.filter((item) => item && typeof item === "object").map((item, index) => {
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 80) : `Highlight ${index + 1}`;
    const score = Number.isFinite(item.engagement_score) ? Math.max(1, Math.min(10, Math.round(item.engagement_score))) : 7;
    const baseText = typeof item.summary === "string" && item.summary.trim() ? item.summary.trim().slice(0, 220) : title;
    const reason = buildHighlightReason(baseText, score);
    const summary = `${reason.zh} ${reason.en}`;
    let start = Number.isFinite(item.start_time) ? Math.floor(item.start_time) : 0;
    let end = Number.isFinite(item.end_time) ? Math.ceil(item.end_time) : start + cfg.target;
    start = Math.max(0, Math.min(start, Math.max(0, safeDuration - cfg.min)));
    end = Math.max(start + cfg.min, Math.min(end, safeDuration));
    if (end - start > cfg.max) end = start + cfg.max;
    if (end > safeDuration) {
      end = safeDuration;
      start = Math.max(0, end - cfg.target);
    }
    return { title, summary, engagement_score: score, start_time: start, end_time: end };
  }).sort((a, b) => a.start_time - b.start_time);
  const deduped = [];
  for (const h of normalized) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(h);
      continue;
    }
    const adjustedStart = Math.max(h.start_time, prev.end_time);
    const adjustedEnd = Math.min(safeDuration, Math.max(adjustedStart + cfg.min, h.end_time));
    if (adjustedEnd - adjustedStart < cfg.min) continue;
    deduped.push({
      ...h,
      start_time: adjustedStart,
      end_time: Math.min(adjustedEnd, adjustedStart + cfg.max)
    });
  }
  return deduped.slice(0, MAX_HIGHLIGHTS);
}
function buildFallbackHighlights(duration) {
  const safeDuration = Math.max(duration, 60);
  const cfg = clipDurations(safeDuration);
  const maxClips = Math.min(MAX_HIGHLIGHTS, Math.floor(safeDuration / (cfg.min + 8)));
  const clipCount = Math.max(3, Math.min(MAX_HIGHLIGHTS, maxClips));
  const spacing = Math.floor(safeDuration / (clipCount + 1));
  return normalizeHighlights(
    Array.from({ length: clipCount }, (_, i) => {
      const start = Math.max(0, spacing * (i + 1) - Math.floor(cfg.target / 2));
      return {
        title: `Highlight ${i + 1}`,
        start_time: start,
        end_time: Math.min(start + cfg.target, safeDuration),
        summary: "AI \u81EA\u52A8\u4ECE\u89C6\u9891\u4E2D\u5747\u5300\u9009\u53D6\u7684\u4EE3\u8868\u6027\u7247\u6BB5\u3002AI-selected representative segment sampled across the video.",
        engagement_score: 7
      };
    }),
    duration
  );
}
function buildHeuristicHighlights(cues, duration) {
  if (cues.length === 0) return buildFallbackHighlights(duration);
  const windows = [];
  const step = 20;
  const cfg = clipDurations(duration);
  const len = cfg.target;
  const keywords = [
    "important",
    "secret",
    "best",
    "amazing",
    "crazy",
    "must",
    "mistake",
    "learn",
    "\u5173\u952E",
    "\u91CD\u70B9",
    "\u4E00\u5B9A",
    "\u9707\u60CA",
    "\u5389\u5BB3",
    "\u65B9\u6CD5",
    "\u79D8\u8BC0",
    "\u6280\u5DE7"
  ];
  for (let start = 0; start < Math.max(duration - cfg.min, 1); start += step) {
    const end = Math.min(duration, start + len);
    const text = cues.filter((c) => c.end >= start && c.start <= end).map((c) => c.text).join(" ").trim();
    if (!text) continue;
    const keywordScore = keywords.reduce((s, kw) => s + (text.toLowerCase().includes(kw.toLowerCase()) ? 2 : 0), 0);
    const punctuationScore = (text.match(/[!?！？]/g) || []).length;
    const densityScore = Math.min(8, Math.floor(text.length / 80));
    const score = 4 + keywordScore + punctuationScore + densityScore;
    const title = text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 8).join(" ") || `Highlight at ${formatSeconds(start)}`;
    windows.push({ title: title.slice(0, 80), start_time: start, end_time: end, summary: text.slice(0, 140), engagement_score: Math.min(10, score) });
  }
  windows.sort((a, b) => b.engagement_score - a.engagement_score);
  const targetCount = Math.min(MAX_HIGHLIGHTS, Math.max(3, Math.min(10, Math.round(duration / 600) + 3)));
  const selected = [];
  for (const c of windows) {
    if (!selected.some(
      (s) => Math.max(s.start_time, c.start_time) < Math.min(s.end_time, c.end_time)
    )) selected.push(c);
    if (selected.length === targetCount) break;
  }
  return normalizeHighlights(selected.length >= 2 ? selected : buildFallbackHighlights(duration), duration);
}
async function ensureDirectories() {
  await (0, import_promises.mkdir)(PUBLIC_CLIP_DIR, { recursive: true });
  await (0, import_promises.mkdir)(CACHE_DIR, { recursive: true });
}
async function ensureFfmpegAvailable() {
  try {
    const fp = ffmpegInstaller.path;
    await (0, import_promises.access)(fp, import_node_fs.constants.X_OK);
    return fp;
  } catch {
  }
  try {
    const { stdout } = await execFile("which", ["ffmpeg"]);
    const fp = stdout.trim();
    if (fp) {
      await (0, import_promises.access)(fp, import_node_fs.constants.X_OK);
      return fp;
    }
  } catch {
  }
  throw new Error("ffmpeg is not available.");
}
var ytDlpCommand = null;
var ytDlpUseModule = false;
async function canUsePythonYtDlpModule() {
  try {
    const { stdout } = await execFile("python3", ["-c", 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'], {
      timeout: 5e3,
      env: { ...process.env, PYTHONWARNINGS: "ignore" }
    });
    const [major, minor] = stdout.trim().split(".").map((x) => parseInt(x, 10));
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
    return major > 3 || major === 3 && minor >= 10;
  } catch {
    return false;
  }
}
async function ensureYtDlp() {
  if (ytDlpCommand) return;
  try {
    if (await canUsePythonYtDlpModule()) {
      await execFile("python3", ["-m", "yt_dlp", "--version"], {
        timeout: 8e3,
        env: { ...process.env, PYTHONWARNINGS: "ignore" }
      });
      ytDlpCommand = "python3";
      ytDlpUseModule = true;
      console.log("yt-dlp: using python3 -m yt_dlp");
      return;
    }
  } catch {
  }
  try {
    await execFile("yt-dlp", ["--version"], { timeout: 5e3 });
    ytDlpCommand = "yt-dlp";
    ytDlpUseModule = false;
    console.log("yt-dlp: using system binary");
    return;
  } catch {
  }
  try {
    await (0, import_promises.access)(YT_DLP_BIN_PATH, import_node_fs.constants.X_OK);
    await execFile(YT_DLP_BIN_PATH, ["--version"], { timeout: 5e3 });
    ytDlpCommand = YT_DLP_BIN_PATH;
    ytDlpUseModule = false;
    console.log(`yt-dlp: using cached binary at ${YT_DLP_BIN_PATH}`);
    return;
  } catch {
  }
  const downloadUrl = process.platform === "linux" ? YT_DLP_LINUX_URL : process.platform === "darwin" ? YT_DLP_DARWIN_URL : "";
  if (downloadUrl) {
    console.log("Downloading yt-dlp binary\u2026");
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await (0, import_promises.writeFile)(YT_DLP_BIN_PATH, Buffer.from(await res.arrayBuffer()));
      await (0, import_promises.chmod)(YT_DLP_BIN_PATH, 493);
      await execFile(YT_DLP_BIN_PATH, ["--version"], { timeout: 1e4 });
      ytDlpCommand = YT_DLP_BIN_PATH;
      ytDlpUseModule = false;
      console.log("yt-dlp: downloaded standalone binary");
      return;
    } catch (err) {
      console.error("Failed to download yt-dlp:", err);
    }
  }
  throw new Error("yt-dlp not available. Install with: pip3 install yt-dlp");
}
async function runYtDlp(args, isBilibili = false) {
  await ensureYtDlp();
  const ffmpegPath = await ensureFfmpegAvailable().catch(() => "");
  const ffmpegDir = ffmpegPath ? import_node_path.default.dirname(ffmpegPath) : "";
  const commonArgs = [
    "--no-check-certificate",
    "--ignore-errors",
    "--socket-timeout",
    "30",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    ...ffmpegDir ? ["--ffmpeg-location", ffmpegDir] : [],
    ...isBilibili ? [
      "--add-header",
      "Referer: https://www.bilibili.com/",
      "--add-header",
      "Origin: https://www.bilibili.com",
      "--add-header",
      "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8"
    ] : []
  ];
  const env = { ...process.env, PYTHONWARNINGS: "ignore" };
  if (ffmpegDir) env.PATH = `${ffmpegDir}:${process.env.PATH || ""}`;
  if (!process.env.HTTP_PROXY) delete env.HTTP_PROXY;
  if (!process.env.HTTPS_PROXY) delete env.HTTPS_PROXY;
  if (!process.env.ALL_PROXY) delete env.ALL_PROXY;
  const [cmd, cmdArgs] = ytDlpUseModule ? ["python3", ["-m", "yt_dlp", ...commonArgs, ...args]] : [ytDlpCommand, [...commonArgs, ...args]];
  return execFile(cmd, cmdArgs, {
    cwd: CACHE_DIR,
    maxBuffer: 30 * 1024 * 1024,
    timeout: 15 * 60 * 1e3,
    env
  });
}
async function getYouTubeStreamUrlViaYtDlp(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const maxH = Math.max(144, Math.min(2160, YOUTUBE_MAX_HEIGHT));
  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ["--proxy", proxyUrl] : [];
  const args = [
    ...proxyArg,
    "--no-playlist",
    "--extractor-args",
    "youtube:player_client=android",
    "-f",
    `best[ext=mp4][height<=${maxH}][acodec!=none][vcodec!=none]/best[height<=${maxH}][acodec!=none][vcodec!=none]/best`,
    "-g",
    videoUrl
  ];
  const r = await runYtDlp(args, false);
  const lines = String(r.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const url = lines.find((l) => /^https?:\/\//i.test(l)) || "";
  if (!url) {
    throw new Error("yt-dlp did not return a stream URL");
  }
  return url;
}
async function getYouTubeAvStreamUrlsViaYtDlp(videoId) {
  const pageUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const maxH = Math.max(144, Math.min(2160, YOUTUBE_MAX_HEIGHT));
  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ["--proxy", proxyUrl] : [];
  const args = [
    ...proxyArg,
    "--no-playlist",
    "--extractor-args",
    "youtube:player_client=android",
    "-f",
    `bestvideo[height<=${maxH}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxH}]+bestaudio/best`,
    "-g",
    pageUrl
  ];
  const r = await runYtDlp(args, false);
  const lines = String(r.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => /^https?:\/\//i.test(l));
  if (lines.length === 0) throw new Error("yt-dlp did not return stream URLs");
  if (lines.length === 1) return { videoUrl: lines[0], audioUrl: null };
  return { videoUrl: lines[0], audioUrl: lines[1] };
}
async function getYouTubeInfoViaPiped(videoId) {
  let lastError = "No Piped instance reachable";
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VidShorter/1.0)" },
        signal: AbortSignal.timeout(12e3)
      });
      if (!res.ok) {
        lastError = `${instance}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const combined = (data.videoStreams || []).filter((s) => !s.videoOnly && s.mimeType?.includes("mp4"));
      const parseQuality = (value) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const stream = combined.map((s) => ({ s, q: parseQuality(s.quality) })).filter((item) => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT).sort((a, b) => b.q - a.q)[0]?.s || combined.map((s) => ({ s, q: parseQuality(s.quality) })).sort((a, b) => b.q - a.q)[0]?.s || (data.videoStreams || [])[0];
      if (!stream?.url) {
        lastError = `${instance}: no stream URL in response`;
        continue;
      }
      const subtitle = (data.subtitles || []).find(
        (s) => (s.code === "en" || s.code?.startsWith("en") || s.autoGenerated) && s.mimeType?.includes("vtt")
      ) || (data.subtitles || []).find((s) => s.mimeType?.includes("vtt")) || data.subtitles?.[0];
      console.log(`Piped success (${instance}): "${data.title?.slice(0, 50)}", stream: ${stream.quality}`);
      return {
        title: data.title || "YouTube video",
        duration: data.duration || 300,
        streamUrl: stream.url,
        subtitleUrl: subtitle?.url || null
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`Piped ${instance} failed: ${lastError}`);
    }
  }
  throw new Error(`All Piped instances failed. Last error: ${lastError}`);
}
async function getYouTubeInfoViaInvidious(videoId) {
  let lastError = "No instance tried";
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=title,lengthSeconds,formatStreams`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; VidShorter/1.0)" },
          signal: AbortSignal.timeout(12e3)
        }
      );
      if (!res.ok) {
        lastError = `${instance}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const streams = (data.formatStreams || []).filter((f) => f.url);
      const parseQuality = (value) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const stream = streams.map((s) => ({ s, q: parseQuality(s.qualityLabel) })).filter((item) => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT).sort((a, b) => b.q - a.q)[0]?.s || streams.map((s) => ({ s, q: parseQuality(s.qualityLabel) })).sort((a, b) => b.q - a.q)[0]?.s;
      if (!stream?.url) {
        lastError = `${instance}: no stream found`;
        continue;
      }
      console.log(`Invidious (${instance}): "${(data.title || "").slice(0, 50)}"`);
      return {
        title: data.title || "YouTube Video",
        duration: data.lengthSeconds || 300,
        streamUrl: stream.url,
        subtitleUrl: null
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`Invidious ${instance} failed: ${lastError}`);
    }
  }
  throw new Error(`All Invidious instances failed. Last: ${lastError}`);
}
async function getYouTubeInfoViaYouTubeJs(videoId) {
  let lastError = "not tried";
  const clientTypes = ["TV_EMBEDDED", "TV", "ANDROID", "IOS"];
  for (const ct of clientTypes) {
    try {
      console.log(`YouTube.js trying client: ${ct}\u2026`);
      const { Innertube, UniversalCache } = await import("youtubei.js");
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
      });
      const info = await yt.getBasicInfo(videoId, ct);
      const title = info?.basic_info?.title ?? "YouTube Video";
      const duration = info?.basic_info?.duration ?? 300;
      const allFormats = [
        ...info?.streaming_data?.formats ?? [],
        ...info?.streaming_data?.adaptive_formats ?? []
      ];
      const parseQuality = (value) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const candidates = allFormats.filter((f) => f.has_audio && f.has_video && f.url);
      const mp4 = candidates.filter((f) => f.mime_type?.startsWith("video/mp4"));
      const withQ = (arr) => arr.map((f) => ({ f, q: f.height || parseQuality(f.quality_label) })).filter((x) => x.q > 0);
      const pickBest = (arr) => withQ(arr).filter((x) => x.q <= YOUTUBE_MAX_HEIGHT).sort((a, b) => b.q - a.q)[0]?.f || withQ(arr).sort((a, b) => b.q - a.q)[0]?.f || arr[0];
      const format = pickBest(mp4.length ? mp4 : candidates) ?? allFormats[0];
      if (!format) {
        lastError = `${ct}: no format found`;
        continue;
      }
      let streamUrl = "";
      if (typeof format.decipher === "function") {
        streamUrl = format.decipher(yt.session?.player) || format.url || "";
      } else {
        streamUrl = format.url || "";
      }
      if (!streamUrl) {
        lastError = `${ct}: empty URL after decipher`;
        continue;
      }
      console.log(`YouTube.js success (${ct}): "${title.slice(0, 50)}"`);
      return { title, duration, streamUrl, subtitleUrl: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.warn(`YouTube.js ${ct} failed: ${lastError}`);
    }
  }
  throw new Error(`YouTube.js all clients failed. Last: ${lastError}`);
}
async function getYouTubeInfoViaCobalt(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const body = JSON.stringify({
    url: videoUrl,
    videoQuality: String(Math.min(YOUTUBE_MAX_HEIGHT, 1080)),
    youtubeVideoCodec: "h264",
    audioBitrate: "128"
  });
  let lastError = "no instances tried";
  for (const instance of getCobaltInstances()) {
    try {
      const res = await fetch(instance, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(2e4)
      });
      if (!res.ok) {
        lastError = `${instance}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      if (data.status === "error" || !data.url) {
        lastError = `${instance}: ${data.error?.code ?? data.status ?? "no url"}`;
        continue;
      }
      let title = "YouTube Video";
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
          { signal: AbortSignal.timeout(6e3) }
        );
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          title = oembedData.title || title;
        }
      } catch {
      }
      console.log(`cobalt (${instance}) YouTube: status=${data.status}, title="${title.slice(0, 50)}"`);
      return { title, duration: 300, streamUrl: data.url, subtitleUrl: null };
    } catch (err) {
      lastError = `${instance}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
    }
  }
  throw new Error(`All cobalt instances failed for YouTube. Last: ${lastError}`);
}
async function getYouTubeInfoViaCFWorker(videoId) {
  const cfWorkerUrl = getCfWorkerUrl();
  if (!cfWorkerUrl) throw new Error("CF_WORKER_URL not configured");
  const maxHeight = getCfWorkerMaxHeight();
  const u = new URL(cfWorkerUrl);
  u.pathname = `${u.pathname.replace(/\/$/, "")}/resolve`;
  u.searchParams.set("videoId", videoId);
  u.searchParams.set("maxHeight", String(maxHeight));
  const endpoint = u.toString();
  const fetchResolved = async () => fetch(endpoint, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(25e3)
  });
  let res = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    res = await fetchResolved();
    if (res.ok) break;
    if (![429, 500, 502, 503, 504].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  if (!res) throw new Error("CF Worker: empty response");
  if (!res.ok) {
    let details = "";
    try {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const d = await res.json();
        details = [d.error, d.details].filter(Boolean).join(" | ").slice(0, 220);
      } else {
        details = (await res.text()).slice(0, 220);
      }
    } catch {
    }
    throw new Error(`CF Worker returned HTTP ${res.status}${details ? `: ${details}` : ""}`);
  }
  const data = await res.json();
  if (!data.streamUrl) throw new Error(data.error ?? "CF Worker: missing streamUrl");
  const streamEndpoint = new URL(cfWorkerUrl);
  streamEndpoint.pathname = `${streamEndpoint.pathname.replace(/\/$/, "")}/stream`;
  streamEndpoint.searchParams.set("videoId", videoId);
  streamEndpoint.searchParams.set("maxHeight", String(maxHeight));
  console.log(`CF Worker success: "${(data.title ?? "").slice(0, 50)}", client=${data.client}, quality=${data.quality}`);
  return {
    title: data.title || "YouTube Video",
    duration: data.duration || 300,
    streamUrl: streamEndpoint.toString(),
    subtitleUrl: null
  };
}
async function getYouTubeInfoViaEdgeFunction(videoId) {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) throw new Error("APP_BASE_URL/NEXT_PUBLIC_APP_URL/VERCEL_URL env var not set \u2014 edge function unavailable");
  const endpoint = `${baseUrl}/api/yt-stream?videoId=${encodeURIComponent(videoId)}`;
  const res = await fetch(endpoint, {
    headers: { Accept: "application/json", ...getVercelProtectionBypassHeaders() },
    signal: AbortSignal.timeout(25e3)
  });
  if (!res.ok) throw new Error(`Edge function HTTP ${res.status}`);
  const data = await res.json();
  if (!data.streamUrl) throw new Error(data.error ?? "Edge function: missing streamUrl");
  const proxyUrl = `${baseUrl}/api/yt-proxy?videoId=${encodeURIComponent(videoId)}&maxHeight=${encodeURIComponent(String(YOUTUBE_MAX_HEIGHT))}`;
  console.log(
    `Edge function success: "${(data.title ?? "").slice(0, 50)}", client=${data.client}, quality=${data.quality}`
  );
  return {
    title: data.title || "YouTube Video",
    duration: data.duration || 300,
    streamUrl: proxyUrl,
    subtitleUrl: null
  };
}
var innerTubeCache = /* @__PURE__ */ new Map();
async function getYouTubeInfoViaDirectInnerTube(videoId) {
  const cached = innerTubeCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`DirectInnerTube cache hit for ${videoId}`);
    return cached.result;
  }
  const ytCookies = (process.env.YOUTUBE_COOKIES || "").trim();
  let cookieHeader = "";
  if (ytCookies) {
    if (ytCookies.includes("	")) {
      cookieHeader = ytCookies.split("\n").filter((l) => !l.startsWith("#") && l.trim()).map((l) => {
        const p = l.split("	");
        return p.length >= 7 ? `${p[5]}=${p[6]}` : "";
      }).filter(Boolean).join("; ");
    } else {
      cookieHeader = ytCookies;
    }
  }
  const clients = [
    // WEB client with auth cookies (highest priority when available — handles age-restricted)
    ...cookieHeader ? [{
      name: "WEB_COOKIES",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": "2.20240101.00.00",
        "Cookie": cookieHeader
      },
      context: {
        client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" }
      }
    }] : [],
    // ANDROID_VR — bypasses age restrictions on some content
    {
      name: "ANDROID_VR",
      headers: {
        "User-Agent": "com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        "X-Youtube-Client-Name": "28",
        "X-Youtube-Client-Version": "1.57.29"
      },
      context: {
        client: {
          clientName: "ANDROID_VR",
          clientVersion: "1.57.29",
          androidSdkVersion: 32,
          hl: "en",
          gl: "US"
        }
      }
    },
    {
      name: "IOS_v20",
      headers: {
        "User-Agent": "com.google.ios.youtube/20.03.03 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        "X-Youtube-Client-Name": "5",
        "X-Youtube-Client-Version": "20.03.03"
      },
      context: {
        client: {
          clientName: "IOS",
          clientVersion: "20.03.03",
          deviceMake: "Apple",
          deviceModel: "iPhone16,2",
          osName: "iPhone",
          osVersion: "18.3.2.22D82",
          hl: "en",
          gl: "US",
          clientFormFactor: "SMALL_FORM_FACTOR"
        }
      }
    },
    {
      name: "ANDROID_v20",
      headers: {
        "User-Agent": "com.google.android.youtube/20.03.03 (Linux; U; Android 14) gzip",
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": "20.03.03"
      },
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "20.03.03",
          androidSdkVersion: 34,
          hl: "en",
          gl: "US",
          clientFormFactor: "SMALL_FORM_FACTOR"
        }
      }
    },
    {
      name: "IOS_v19",
      headers: {
        "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
        "X-Youtube-Client-Name": "5",
        "X-Youtube-Client-Version": "19.29.1"
      },
      context: {
        client: {
          clientName: "IOS",
          clientVersion: "19.29.1",
          deviceMake: "Apple",
          deviceModel: "iPhone16,2",
          osName: "iPhone",
          osVersion: "17.5.1.21F90",
          hl: "en",
          gl: "US"
        }
      }
    },
    {
      name: "ANDROID_TESTSUITE",
      headers: {
        "User-Agent": "com.google.android.youtube/1.9 (Linux; U; Android 11) gzip",
        "X-Youtube-Client-Name": "30",
        "X-Youtube-Client-Version": "1.9"
      },
      context: {
        client: {
          clientName: "ANDROID_TESTSUITE",
          clientVersion: "1.9",
          androidSdkVersion: 30,
          hl: "en",
          gl: "US"
        }
      }
    }
  ];
  const errors = [];
  for (const client of clients) {
    try {
      const body = {
        videoId,
        context: client.context,
        playbackContext: {
          contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" }
        }
      };
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://www.youtube.com",
          "Referer": "https://www.youtube.com/",
          ...client.headers
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(18e3)
      });
      if (!res.ok) {
        errors.push(`${client.name}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const ps = data.playabilityStatus?.status;
      if (ps && ps !== "OK") {
        errors.push(`${client.name}: ${ps} (${data.playabilityStatus?.reason ?? ""})`);
        continue;
      }
      const allFormats = [
        ...data.streamingData?.formats ?? [],
        ...data.streamingData?.adaptiveFormats ?? []
      ];
      if (!allFormats.length) {
        errors.push(`${client.name}: no formats in response`);
        continue;
      }
      const combined = allFormats.filter(
        (f) => f.url && f.mimeType?.startsWith("video/mp4") && (f.audioQuality || f.audioChannels)
      );
      const parseQuality = (value) => {
        const m = value?.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const format = combined.map((f) => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) })).filter((item) => item.q > 0 && item.q <= YOUTUBE_MAX_HEIGHT).sort((a, b) => b.q - a.q)[0]?.f || combined.map((f) => ({ f, q: parseQuality(f.qualityLabel ?? f.quality) })).sort((a, b) => b.q - a.q)[0]?.f || combined[0] || allFormats.find((f) => f.url);
      if (!format?.url) {
        const hasCipher = allFormats.some((f) => f.signatureCipher);
        errors.push(`${client.name}: no direct URL${hasCipher ? " (cipher-only)" : ""}`);
        continue;
      }
      const title = data.videoDetails?.title ?? "YouTube Video";
      const dur = parseInt(data.videoDetails?.lengthSeconds ?? "300", 10);
      console.log(`DirectInnerTube (${client.name}): "${title.slice(0, 50)}", quality=${format.qualityLabel ?? format.quality}`);
      const result = {
        title,
        duration: Number.isFinite(dur) ? dur : 300,
        streamUrl: format.url,
        subtitleUrl: null
      };
      innerTubeCache.set(videoId, { result, expiresAt: Date.now() + 30 * 60 * 1e3 });
      return result;
    } catch (err) {
      errors.push(`${client.name}: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
    }
  }
  throw new Error(`Direct InnerTube failed for all clients. Errors: ${errors.join(" | ")}`);
}
async function getBilibiliStreamViaCobalt(videoUrl) {
  const body = JSON.stringify({ url: videoUrl, videoQuality: "480", audioBitrate: "128" });
  let lastError = "no instances tried";
  for (const instance of getCobaltInstances()) {
    try {
      const res = await fetch(instance, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(2e4)
      });
      if (!res.ok) {
        lastError = `${instance}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      if (data.status === "error" || !data.url) {
        lastError = `${instance}: ${data.error?.code ?? data.status ?? "no url"}`;
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
async function getBilibiliStreamUrlDirect(videoUrl) {
  const bvMatch = videoUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
  const avMatch = videoUrl.match(/\/video\/av(\d+)/i);
  if (!bvMatch && !avMatch) throw new Error("Cannot extract BV/AV ID from Bilibili URL");
  const bilibiliHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...process.env.BILIBILI_COOKIE ? { Cookie: process.env.BILIBILI_COOKIE } : {}
  };
  const viewApiUrl = bvMatch ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvMatch[1]}` : `https://api.bilibili.com/x/web-interface/view?aid=${avMatch[1]}`;
  const viewRes = await fetch(viewApiUrl, {
    headers: bilibiliHeaders,
    signal: AbortSignal.timeout(12e3)
  });
  if (!viewRes.ok) throw new Error(`Bilibili view API HTTP ${viewRes.status}`);
  const viewData = await viewRes.json();
  if (viewData.code !== 0 || !viewData.data?.cid) {
    throw new Error(`Bilibili view API error: code=${viewData.code} ${viewData.message ?? ""}`);
  }
  const cid = viewData.data.cid;
  const bvid = bvMatch ? bvMatch[1] : String(viewData.data.bvid || "");
  const aid = avMatch ? avMatch[1] : String(viewData.data.aid || "");
  const playParams = bvid ? `bvid=${bvid}&cid=${cid}` : `avid=${aid}&cid=${cid}`;
  for (const qn of [80, 64, 32, 16]) {
    try {
      const playRes = await fetch(
        `https://api.bilibili.com/x/player/playurl?${playParams}&qn=${qn}&fnval=1&fnver=0&fourk=0`,
        { headers: bilibiliHeaders, signal: AbortSignal.timeout(12e3) }
      );
      if (!playRes.ok) continue;
      const playData = await playRes.json();
      if (playData.code !== 0 || !playData.data?.durl?.length) continue;
      const streamUrl = playData.data.durl[0].url;
      if (!streamUrl) continue;
      console.log(`Bilibili direct API: CID=${cid} qn=${qn} url=${streamUrl.slice(0, 80)}...`);
      return streamUrl;
    } catch (err) {
      console.warn(`Bilibili direct API qn=${qn} failed:`, err instanceof Error ? err.message.slice(0, 80) : err);
    }
  }
  throw new Error("Bilibili direct API: no stream URL obtained for any quality level");
}
async function fetchPipedSubtitleCues(subtitleUrl) {
  try {
    const res = await fetch(subtitleUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return [];
    const vttText = await res.text();
    const tmpFile = import_node_path.default.join(CACHE_DIR, `sub-${(0, import_node_crypto.randomUUID)()}.vtt`);
    await (0, import_promises.writeFile)(tmpFile, vttText);
    const cues = await parseVttFile(tmpFile);
    (0, import_promises.unlink)(tmpFile).catch(() => {
    });
    return cues;
  } catch {
    return [];
  }
}
async function fetchYouTubeTranscriptCues(videoId) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const withTimeout = async (fn, ms) => Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
    for (const lang of ["en", "en-US", "zh-Hans", "zh", ""]) {
      try {
        const transcript = await withTimeout(
          () => lang ? YoutubeTranscript.fetchTranscript(videoId, { lang }) : YoutubeTranscript.fetchTranscript(videoId),
          12e3
        );
        if (transcript.length > 0) {
          return transcript.map((item) => ({
            start: item.offset / 1e3,
            end: (item.offset + item.duration) / 1e3,
            text: item.text
          }));
        }
      } catch {
      }
    }
  } catch (err) {
    console.warn("youtube-transcript failed:", err instanceof Error ? err.message : err);
  }
  return [];
}
async function analyzeYouTubeViaPipedAndTranscript(videoUrl) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) throw new Error("Invalid YouTube URL");
  let title = "YouTube video";
  let duration = 300;
  let cues = [];
  const metaGetters = IS_VERCEL ? [
    ...getCfWorkerUrl() ? [() => getYouTubeInfoViaCFWorker(videoId)] : [],
    ...getAppBaseUrl() ? [() => getYouTubeInfoViaEdgeFunction(videoId)] : [],
    () => getYouTubeInfoViaInvidious(videoId),
    () => getYouTubeInfoViaPiped(videoId)
  ] : [
    ...getCfWorkerUrl() ? [() => getYouTubeInfoViaCFWorker(videoId)] : [],
    ...getAppBaseUrl() ? [() => getYouTubeInfoViaEdgeFunction(videoId)] : [],
    () => getYouTubeInfoViaDirectInnerTube(videoId),
    () => getYouTubeInfoViaYouTubeJs(videoId),
    () => getYouTubeInfoViaInvidious(videoId),
    () => getYouTubeInfoViaPiped(videoId)
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
      break;
    } catch (err) {
      console.warn("Meta getter failed:", err instanceof Error ? err.message.slice(0, 80) : err);
    }
  }
  if (cues.length === 0) {
    cues = await fetchYouTubeTranscriptCues(videoId);
    console.log(`youtube-transcript: ${cues.length} cues`);
  }
  if (duration <= 60 && cues.length > 0) {
    duration = Math.ceil(cues[cues.length - 1].end) + 30;
  }
  if (title === "YouTube video") {
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
        { signal: AbortSignal.timeout(5e3) }
      );
      if (r.ok) {
        const d = await r.json();
        title = d.title || title;
      }
    } catch {
    }
  }
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}
async function hasChromeCookies() {
  try {
    await (0, import_promises.access)(CHROME_COOKIE_DB, import_node_fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function hasFreshCookieFile() {
  try {
    const { stat } = await import("fs/promises");
    const stats = await stat(COOKIE_FILE_PATH);
    return Date.now() - stats.mtimeMs < 30 * 60 * 1e3;
  } catch {
    return false;
  }
}
async function exportChromeCookies(videoUrl) {
  if (!ytDlpUseModule) return false;
  try {
    const ffmpegPath = await ensureFfmpegAvailable().catch(() => "");
    const ffmpegDir = ffmpegPath ? import_node_path.default.dirname(ffmpegPath) : "";
    const env = {
      ...process.env,
      PYTHONWARNINGS: "ignore",
      ...ffmpegDir ? { PATH: `${ffmpegDir}:${process.env.PATH || ""}` } : {}
    };
    await execFile("python3", [
      "-m",
      "yt_dlp",
      "--no-check-certificate",
      "--cookies-from-browser",
      "chrome",
      "--cookies",
      COOKIE_FILE_PATH,
      "--skip-download",
      "--no-playlist",
      "-q",
      videoUrl
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 3e4, env });
    await (0, import_promises.access)(COOKIE_FILE_PATH, import_node_fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
async function detectProxy() {
  const fromEnv = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || process.env.https_proxy || process.env.http_proxy || process.env.all_proxy;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (process.env.VERCEL) return void 0;
  const candidates = [7897, 7890, 7891, 1087, 1080, 8080, 8118, 10809];
  for (const port of candidates) {
    try {
      await execFile("bash", ["-c", `timeout 0.5 bash -c "</dev/tcp/127.0.0.1/${port}" 2>/dev/null && echo ok`], { timeout: 1500 });
      return `http://127.0.0.1:${port}`;
    } catch {
    }
  }
  return void 0;
}
async function findFirstFile(dir, extensions) {
  try {
    const files = await (0, import_promises.readdir)(dir);
    return files.find((f) => extensions.some((ext) => f.endsWith(ext))) || null;
  } catch {
    return null;
  }
}
async function parseVttFile(filePath) {
  const raw = await (0, import_promises.readFile)(filePath, "utf8");
  const blocks = raw.split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((v) => v.trim().split(" ")[0]);
    const text = cleanCueText(lines.slice(lines.indexOf(timeLine) + 1).join(" "));
    if (!text) continue;
    cues.push({
      start: parseVttTimestamp(startRaw.replace(",", ".")),
      end: parseVttTimestamp(endRaw.replace(",", ".")),
      text
    });
  }
  return cues;
}
function parseYtDlpJson(stdout) {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) throw new Error("No JSON in yt-dlp output");
  return JSON.parse(stdout.slice(jsonStart));
}
async function analyzeYouTubeVideo(videoUrl, workDir) {
  if (FORCE_YOUTUBE_STREAM_FALLBACKS) {
    console.log("Vercel environment detected: skipping yt-dlp analysis, using proxy+transcript");
    return analyzeYouTubeViaPipedAndTranscript(videoUrl);
  }
  const outputTemplate = import_node_path.default.join(workDir, "analysis.%(ext)s");
  const baseArgs = [
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en.*,en,zh.*,zh-Hans.*,zh-Hant.*",
    "--convert-subs",
    "vtt",
    "-o",
    outputTemplate,
    videoUrl
  ];
  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ["--proxy", proxyUrl] : [];
  const strategies = [
    [...proxyArg, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs],
    [...proxyArg, "--extractor-args", "youtube:player_client=android_embedded", ...baseArgs],
    [...proxyArg, "--extractor-args", "youtube:player_client=ios", ...baseArgs],
    [...proxyArg, ...baseArgs],
    baseArgs
  ];
  if (await hasFreshCookieFile()) {
    strategies.splice(3, 0, [...proxyArg, "--cookies", COOKIE_FILE_PATH, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs]);
  }
  if (await hasChromeCookies()) {
    strategies.splice(3, 0, [...proxyArg, "--cookies-from-browser", "chrome", "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs]);
  }
  let stdout = "", stderr = "", lastError;
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`yt-dlp analysis strategy ${i + 1}/${strategies.length}\u2026`);
      const r = await runYtDlp(strategies[i], false);
      stdout = r.stdout;
      stderr = r.stderr;
      lastError = null;
      console.log(`yt-dlp analysis strategy ${i + 1} succeeded`);
      break;
    } catch (err) {
      lastError = err;
      stdout = err && typeof err === "object" && "stdout" in err ? String(err.stdout) : "";
      stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    }
  }
  if (!stdout.trim()) {
    const ytdlpErr = stderr.slice(0, 200) || (lastError instanceof Error ? lastError.message.slice(0, 200) : "");
    console.warn(`yt-dlp analysis failed (${ytdlpErr}), falling back to Piped+transcript\u2026`);
    return await analyzeYouTubeViaPipedAndTranscript(videoUrl);
  }
  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor(info.duration || 180));
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Source video";
  const subtitleFile = await findFirstFile(workDir, [".vtt"]);
  const cues = subtitleFile ? await parseVttFile(import_node_path.default.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}
async function getBilibiliVideoMeta(videoUrl) {
  const bvMatch = videoUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
  const avMatch = videoUrl.match(/\/video\/av(\d+)/i);
  if (!bvMatch && !avMatch) throw new Error("Cannot extract BV/AV ID from Bilibili URL");
  const apiUrl = bvMatch ? `https://api.bilibili.com/x/web-interface/view?bvid=${bvMatch[1]}` : `https://api.bilibili.com/x/web-interface/view?aid=${avMatch[1]}`;
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Referer": "https://www.bilibili.com/",
      ...process.env.BILIBILI_COOKIE ? { Cookie: process.env.BILIBILI_COOKIE } : {}
    },
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) throw new Error(`Bilibili API HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error(`Bilibili API error: code=${data.code}, msg=${data.message ?? ""}`);
  }
  return {
    title: data.data.title?.trim() || "Bilibili Video",
    duration: data.data.duration || 300
  };
}
async function analyzeBilibiliVideo(videoUrl, workDir) {
  if (process.env.VERCEL) {
    console.log("Vercel environment: using Bilibili direct API for analysis");
    try {
      const { title: title2, duration: duration2 } = await getBilibiliVideoMeta(videoUrl);
      console.log(`Bilibili API: "${title2.slice(0, 50)}", duration=${duration2}s`);
      return { duration: duration2, title: title2, highlights: buildFallbackHighlights(duration2) };
    } catch (err) {
      console.warn("Bilibili direct API failed:", err instanceof Error ? err.message.slice(0, 100) : err);
      return { duration: 300, title: "Bilibili Video", highlights: buildFallbackHighlights(300) };
    }
  }
  const outputTemplate = import_node_path.default.join(workDir, "analysis.%(ext)s");
  const bilibiliHeaders = [
    "--add-header",
    "Referer: https://www.bilibili.com/",
    "--add-header",
    "Origin: https://www.bilibili.com",
    "--add-header",
    "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8"
  ];
  const analysisArgs = [
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "zh-Hans,zh-Hant,zh,en.*",
    "--convert-subs",
    "vtt",
    "-o",
    outputTemplate,
    videoUrl
  ];
  const hasCookies = await hasChromeCookies();
  const strategies = [
    ...hasCookies ? [["--cookies-from-browser", "chrome", ...bilibiliHeaders, ...analysisArgs]] : [],
    [...bilibiliHeaders, ...analysisArgs]
  ];
  let stdout = "", stderr = "", lastError;
  for (const s of strategies) {
    try {
      const r = await runYtDlp(s, true);
      stdout = r.stdout;
      stderr = r.stderr;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      stdout = err && typeof err === "object" && "stdout" in err ? String(err.stdout) : "";
      stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    }
  }
  if (!stdout.trim()) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : "") || "yt-dlp failed for Bilibili.";
    console.warn(`Bilibili analysis fallback: yt-dlp failed (${msg.slice(0, 120)}), using direct API meta`);
    try {
      const { title: title2, duration: duration2 } = await getBilibiliVideoMeta(videoUrl);
      return { duration: duration2, title: title2, highlights: buildFallbackHighlights(duration2) };
    } catch (err) {
      console.warn("Bilibili direct API failed:", err instanceof Error ? err.message.slice(0, 100) : err);
      return { duration: 300, title: "Bilibili Video", highlights: buildFallbackHighlights(300) };
    }
  }
  const info = parseYtDlpJson(stdout);
  const duration = Math.max(45, Math.floor(info.duration || 180));
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Bilibili video";
  const subtitleFile = await findFirstFile(workDir, [".vtt"]);
  const cues = subtitleFile ? await parseVttFile(import_node_path.default.join(workDir, subtitleFile)) : [];
  return { duration, title, highlights: buildHeuristicHighlights(cues, duration) };
}
async function downloadSourceVideo(videoUrl, options) {
  const normalizedUrl = await normalizeVideoUrl(videoUrl);
  if (normalizedUrl.startsWith("http://127.0.0.1") || normalizedUrl.startsWith("http://localhost")) {
    return { inputPath: normalizedUrl };
  }
  await ensureDirectories();
  const sourceDir = import_node_path.default.join(CACHE_DIR, sourceId(normalizedUrl));
  await (0, import_promises.mkdir)(sourceDir, { recursive: true });
  if (options?.forceRefresh) {
    const files = await (0, import_promises.readdir)(sourceDir).catch(() => []);
    await Promise.all(
      files.filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f)).map((f) => (0, import_promises.unlink)(import_node_path.default.join(sourceDir, f)).catch(() => {
      }))
    );
  } else {
    const cachedFile = await findFirstFile(sourceDir, [".mp4", ".mkv", ".webm", ".mov"]);
    if (cachedFile) {
      console.log(`Using cached video: ${cachedFile}`);
      return { inputPath: import_node_path.default.join(sourceDir, cachedFile) };
    }
  }
  const outputTemplate = import_node_path.default.join(sourceDir, "source.%(ext)s");
  const hasCookies = await hasChromeCookies();
  if (isBilibiliUrl(normalizedUrl)) {
    return { inputPath: await downloadBilibiliVideo(normalizedUrl, outputTemplate, hasCookies) };
  }
  return downloadYouTubeOrGenericVideo(normalizedUrl, outputTemplate, hasCookies);
}
async function downloadBilibiliVideo(videoUrl, outputTemplate, hasCookies) {
  if (process.env.VERCEL) {
    try {
      console.log("Vercel: trying Bilibili direct API for stream URL");
      const streamUrl = await getBilibiliStreamUrlDirect(videoUrl);
      console.log("Bilibili direct API: got stream URL, will pass directly to ffmpeg");
      return streamUrl;
    } catch (directErr) {
      console.warn("Bilibili direct API failed:", directErr instanceof Error ? directErr.message.slice(0, 100) : directErr);
    }
    try {
      console.log("Vercel: trying cobalt.tools for Bilibili download");
      const cobaltUrl = await getBilibiliStreamViaCobalt(videoUrl);
      console.log("Bilibili (cobalt): got stream URL, will pass to ffmpeg");
      return cobaltUrl;
    } catch (cobaltErr) {
      console.warn("cobalt.tools Bilibili failed on Vercel:", cobaltErr instanceof Error ? cobaltErr.message.slice(0, 100) : cobaltErr);
    }
    throw new Error("Bilibili: all Vercel download methods failed (direct API + cobalt.tools)");
  }
  const bilibiliHeaders = [
    "--add-header",
    "Referer: https://www.bilibili.com/",
    "--add-header",
    "Origin: https://www.bilibili.com",
    "--add-header",
    "Accept-Language: zh-CN,zh;q=0.9"
  ];
  const baseDownloadArgs = [
    "--no-playlist",
    "--restrict-filenames",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    "--merge-output-format",
    "mp4"
  ];
  const strategies = [
    ...hasCookies ? [
      ["--cookies-from-browser", "chrome", ...bilibiliHeaders, ...baseDownloadArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl],
      ["--cookies-from-browser", "chrome", ...bilibiliHeaders, ...baseDownloadArgs, "-f", "best", videoUrl]
    ] : [],
    [...bilibiliHeaders, ...baseDownloadArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl],
    [...bilibiliHeaders, ...baseDownloadArgs, "-f", "best", videoUrl]
  ];
  let stdout = "", stderr = "", lastError;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const r = await runYtDlp(strategies[i], true);
      stdout = r.stdout;
      stderr = r.stderr;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      stdout = err && typeof err === "object" && "stdout" in err ? String(err.stdout) : "";
      stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    }
  }
  const resolvedPath = stdout.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!resolvedPath) {
    const ytdlpErr = stderr.trim() || (lastError instanceof Error ? lastError.message : "") || "yt-dlp failed";
    console.warn(`yt-dlp Bilibili failed (${ytdlpErr.slice(0, 150)}), trying direct API\u2026`);
    try {
      const streamUrl = await getBilibiliStreamUrlDirect(videoUrl);
      console.log("Bilibili direct API: got stream URL, will pass directly to ffmpeg");
      return streamUrl;
    } catch (directErr) {
      console.warn(`Bilibili direct API failed (${directErr instanceof Error ? directErr.message.slice(0, 120) : String(directErr)}), trying cobalt.tools\u2026`);
      try {
        const cobaltUrl = await getBilibiliStreamViaCobalt(videoUrl);
        console.log("cobalt.tools Bilibili stream URL obtained, using as ffmpeg input");
        return cobaltUrl;
      } catch (cobaltErr) {
        const cobaltMsg = cobaltErr instanceof Error ? cobaltErr.message.slice(0, 100) : String(cobaltErr);
        throw new Error(`Failed to download Bilibili video. yt-dlp: ${ytdlpErr.slice(0, 100)}. cobalt.tools: ${cobaltMsg}`);
      }
    }
  }
  return resolvedPath;
}
async function getYouTubeStreamUrlWithFallbacks(videoId) {
  const allowCobalt = true;
  const startedAt = Date.now();
  const budgetMs = IS_VERCEL ? 12e4 : 18e4;
  const streamGetters = IS_VERCEL ? [
    ...getCfWorkerUrl() ? [{ name: "CF Worker", fn: () => getYouTubeInfoViaCFWorker(videoId) }] : [],
    ...getAppBaseUrl() ? [{ name: "EdgeFunction", fn: () => getYouTubeInfoViaEdgeFunction(videoId) }] : [],
    ...allowCobalt ? [{ name: "cobalt", fn: () => getYouTubeInfoViaCobalt(videoId) }] : [],
    { name: "Invidious", fn: () => getYouTubeInfoViaInvidious(videoId) },
    { name: "Piped", fn: () => getYouTubeInfoViaPiped(videoId) }
  ] : [
    ...getCfWorkerUrl() ? [{ name: "CF Worker", fn: () => getYouTubeInfoViaCFWorker(videoId) }] : [],
    ...getAppBaseUrl() ? [{ name: "EdgeFunction", fn: () => getYouTubeInfoViaEdgeFunction(videoId) }] : [],
    { name: "cobalt", fn: () => getYouTubeInfoViaCobalt(videoId) },
    { name: "DirectInnerTube", fn: () => getYouTubeInfoViaDirectInnerTube(videoId) },
    { name: "YouTube.js", fn: () => getYouTubeInfoViaYouTubeJs(videoId) },
    { name: "Invidious", fn: () => getYouTubeInfoViaInvidious(videoId) },
    { name: "Piped", fn: () => getYouTubeInfoViaPiped(videoId) }
  ];
  const errors = [];
  for (const getter of streamGetters) {
    try {
      if (Date.now() - startedAt > budgetMs) break;
      const { streamUrl } = await getter.fn();
      console.log(`Stream URL obtained via ${getter.name} for videoId=${videoId}`);
      return streamUrl;
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
    `Failed to get YouTube stream. All methods failed: ${errors.join(" | ")}
Time budget exceeded: ${budgetMs}ms
Deploy a Cloudflare Worker (see /cf-worker/README.md) and set CF_WORKER_URL in Vercel env vars for reliable access.`
  );
}
async function downloadStreamToLocalFile(url, outputPath) {
  const maxBytes = 400 * 1024 * 1024;
  try {
    await (0, import_promises.access)(outputPath, import_node_fs.constants.R_OK);
    return true;
  } catch {
  }
  const tempPath = `${outputPath}.part`;
  const isWorkerStreamUrl = (() => {
    try {
      const u = new URL(url);
      return u.pathname.includes("/stream") && (u.hostname.endsWith(".workers.dev") || u.hostname.includes("youtube-proxy"));
    } catch {
      return false;
    }
  })();
  const downloadChunked = async () => {
    const fileStream = (0, import_node_fs.createWriteStream)(tempPath);
    let downloadedBytes = 0;
    const chunkSize = 8 * 1024 * 1024;
    let offset = 0;
    let total = null;
    const startedAt = Date.now();
    const budgetMs = IS_VERCEL ? 15e4 : 3e5;
    const youtubeHeaderHint = (() => {
      try {
        const u = new URL(url);
        return u.hostname.includes("googlevideo.com") || u.hostname.includes("youtube.com");
      } catch {
        return false;
      }
    })();
    try {
      while (downloadedBytes < maxBytes) {
        if (Date.now() - startedAt > budgetMs) {
          throw new Error("Download timed out");
        }
        const end = offset + chunkSize - 1;
        const rangeValue = `bytes=${offset}-${end}`;
        const fetchChunk = async () => fetch(url, {
          headers: {
            Range: rangeValue,
            ...getBypassHeadersForUrl(url),
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            ...youtubeHeaderHint ? { Referer: "https://www.youtube.com/", Origin: "https://www.youtube.com" } : {},
            "Accept": "*/*",
            "Accept-Encoding": "identity"
          },
          signal: AbortSignal.timeout(6e4)
        });
        let res = null;
        const retries = isWorkerStreamUrl ? 3 : 1;
        for (let attempt = 0; attempt < retries; attempt += 1) {
          res = await fetchChunk();
          if (res.status === 200 || res.status === 206 || res.status === 416) break;
          if (!isWorkerStreamUrl) break;
          if (![429, 500, 502, 503, 504].includes(res.status)) break;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!res) throw new Error("Empty response");
        if (res.status === 416) break;
        if (res.status !== 206 && res.status !== 200) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("Empty body");
        const readable = import_node_stream.Readable.fromWeb(res.body);
        let chunkBytes = 0;
        for await (const chunk of readable) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunkBytes += buf.length;
          downloadedBytes += buf.length;
          if (downloadedBytes > maxBytes) throw new Error("Exceeded size limit");
          if (!fileStream.write(buf)) await (0, import_node_events.once)(fileStream, "drain");
        }
        if (chunkBytes <= 0) throw new Error("Downloaded empty chunk");
        if (res.status === 200) {
          total = downloadedBytes;
          break;
        }
        const cr = res.headers.get("content-range") || "";
        const m = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
        if (m) {
          const start = parseInt(m[1], 10);
          const endByte = parseInt(m[2], 10);
          if (start !== offset) {
            throw new Error(`Unexpected range start ${start} (expected ${offset})`);
          }
          if (m[3] !== "*") total = parseInt(m[3], 10);
          offset = endByte + 1;
        } else {
          offset += chunkBytes;
        }
        if (total && offset >= total) break;
      }
      fileStream.end();
      await (0, import_node_events.once)(fileStream, "finish");
    } catch (err) {
      fileStream.destroy();
      await (0, import_node_events.once)(fileStream, "close").catch(() => {
      });
      throw err;
    }
    if (downloadedBytes <= 0) throw new Error("Downloaded empty file");
    await (0, import_promises.rename)(tempPath, outputPath);
    try {
      const head = await (0, import_promises.readFile)(outputPath, { encoding: null, flag: "r" }).then((b) => b.subarray(0, 16));
      const headStr = head.toString("utf8").toLowerCase();
      const isMp4 = head.length >= 8 && head.subarray(4, 8).toString("ascii") === "ftyp";
      const isWebm = head.length >= 4 && head[0] === 26 && head[1] === 69 && head[2] === 223 && head[3] === 163;
      const looksHtml = headStr.includes("<!doctype") || headStr.includes("<html") || headStr.includes("<head");
      if (!isMp4 && !isWebm && looksHtml) {
        await (0, import_promises.unlink)(outputPath).catch(() => {
        });
        throw new Error("Downloaded HTML instead of video");
      }
    } catch {
    }
    console.log(`Video downloaded (chunked): ${Math.round(downloadedBytes / 1024 / 1024 * 10) / 10}MB \u2192 ${outputPath}`);
    return true;
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (isWorkerStreamUrl) {
        console.log("Fetching video stream to /tmp (chunked)\u2026");
        return await downloadChunked();
      }
      console.log(`Fetching video stream to /tmp\u2026`);
      const res = await fetch(url, {
        headers: {
          ...getBypassHeadersForUrl(url),
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Encoding": "identity"
        },
        signal: AbortSignal.timeout(24e4)
      });
      if (!res.ok) {
        console.warn(`Stream fetch HTTP ${res.status}`);
        continue;
      }
      const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
      if (contentLength > 0 && contentLength > maxBytes) {
        console.warn(`Video too large to cache locally: ${Math.round(contentLength / 1024 / 1024)}MB`);
        return false;
      }
      if (!res.body) {
        console.warn("Stream fetch returned empty body");
        continue;
      }
      const fileStream = (0, import_node_fs.createWriteStream)(tempPath);
      let downloadedBytes = 0;
      try {
        const readable = import_node_stream.Readable.fromWeb(res.body);
        for await (const chunk of readable) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          downloadedBytes += buf.length;
          if (downloadedBytes > maxBytes) {
            throw new Error(`Downloaded video exceeds size limit: ${Math.round(downloadedBytes / 1024 / 1024)}MB`);
          }
          if (!fileStream.write(buf)) {
            await (0, import_node_events.once)(fileStream, "drain");
          }
        }
        fileStream.end();
        await (0, import_node_events.once)(fileStream, "finish");
      } catch (streamErr) {
        fileStream.destroy();
        await (0, import_node_events.once)(fileStream, "close").catch(() => {
        });
        throw streamErr;
      }
      if (downloadedBytes <= 0) {
        console.warn("Downloaded empty file");
        continue;
      }
      await (0, import_promises.rename)(tempPath, outputPath);
      try {
        const head = await (0, import_promises.readFile)(outputPath, { encoding: null, flag: "r" }).then((b) => b.subarray(0, 16));
        const headStr = head.toString("utf8").toLowerCase();
        const isMp4 = head.length >= 8 && head.subarray(4, 8).toString("ascii") === "ftyp";
        const isWebm = head.length >= 4 && head[0] === 26 && head[1] === 69 && head[2] === 223 && head[3] === 163;
        const looksHtml = headStr.includes("<!doctype") || headStr.includes("<html") || headStr.includes("<head");
        if (!isMp4 && !isWebm && looksHtml) {
          console.warn("Downloaded file looks like HTML, rejecting");
          await (0, import_promises.unlink)(outputPath).catch(() => {
          });
          continue;
        }
      } catch {
      }
      console.log(`Video downloaded: ${Math.round(downloadedBytes / 1024 / 1024 * 10) / 10}MB \u2192 ${outputPath}`);
      return true;
    } catch (err) {
      console.warn("downloadStreamToLocalFile failed:", err instanceof Error ? err.message.slice(0, 100) : err);
    }
    await (0, import_promises.unlink)(tempPath).catch(() => {
    });
    await (0, import_promises.unlink)(outputPath).catch(() => {
    });
  }
  return false;
}
async function preflightStream(url) {
  const isWorker = (() => {
    try {
      const u = new URL(url);
      return u.hostname.endsWith(".workers.dev") || u.hostname.includes("youtube-proxy");
    } catch {
      return false;
    }
  })();
  const youtubeHeaderHint = (() => {
    try {
      const u = new URL(url);
      return u.hostname.includes("googlevideo.com") || u.hostname.includes("youtube.com");
    } catch {
      return false;
    }
  })();
  const attempts = isWorker ? 3 : 1;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Range: "bytes=0-1",
          ...getBypassHeadersForUrl(url),
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          ...youtubeHeaderHint ? { Referer: "https://www.youtube.com/", Origin: "https://www.youtube.com" } : {},
          "Accept": "*/*",
          "Accept-Encoding": "identity"
        },
        signal: AbortSignal.timeout(12e3)
      });
      const type = (res.headers.get("content-type") || "").toLowerCase();
      res.body?.cancel();
      const statusOk = res.status === 200 || res.status === 206;
      const typeOk = !type || type.startsWith("video/") || type.includes("octet-stream") || type.includes("application/mp4") || type.includes("application/vnd.apple.mpegurl");
      const looksBad = type.includes("text/html") || type.includes("application/json");
      if (statusOk && typeOk && !looksBad) return true;
      if (!isWorker) return false;
      if (![429, 500, 502, 503, 504].includes(res.status)) return false;
    } catch {
      if (!isWorker) return false;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return false;
}
async function downloadYouTubeOrGenericVideo(videoUrl, outputTemplate, hasCookies) {
  if (FORCE_YOUTUBE_STREAM_FALLBACKS && isYouTubeUrl(videoUrl)) {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) throw new Error("Invalid YouTube URL");
    const cfWorkerUrl = getCfWorkerUrl();
    if (cfWorkerUrl) {
      try {
        const localPath = import_node_path.default.join(import_node_path.default.dirname(outputTemplate), "source.mp4");
        const preferred = getCfWorkerMaxHeight();
        const heights = Array.from(new Set([preferred, 720, 480, 360, 240, 144].filter(Boolean)));
        let remoteCandidate = "";
        for (const h of heights) {
          const u = new URL(cfWorkerUrl);
          u.pathname = `${u.pathname.replace(/\/$/, "")}/stream`;
          u.searchParams.set("videoId", videoId);
          u.searchParams.set("maxHeight", String(h));
          const streamProxyUrl = u.toString();
          const ok = await preflightStream(streamProxyUrl);
          if (!ok) {
            console.warn(`CF Worker /stream preflight failed for maxHeight=${h}, trying next\u2026`);
            continue;
          }
          const downloaded = await downloadStreamToLocalFile(streamProxyUrl, localPath);
          if (downloaded) {
            console.log("Vercel environment: using locally cached YouTube source for ffmpeg input");
            return { inputPath: localPath };
          }
          remoteCandidate = streamProxyUrl;
        }
        if (remoteCandidate) {
          console.log("Vercel environment: using CF Worker stream proxy directly as ffmpeg input (no local cache)");
          return { inputPath: remoteCandidate };
        }
        throw new Error("CF Worker stream is unavailable");
      } catch (e) {
        console.warn(
          "CF Worker stream URL build failed, trying Vercel edge proxy\u2026",
          e instanceof Error ? e.message.slice(0, 120) : e
        );
      }
    }
    const baseUrl = getAppBaseUrl();
    if (baseUrl) {
      const proxyUrl2 = `${baseUrl}/api/yt-proxy?videoId=${encodeURIComponent(videoId)}`;
      try {
        const res = await fetch(proxyUrl2, {
          headers: { Range: "bytes=0-1", ...getVercelProtectionBypassHeaders() },
          signal: AbortSignal.timeout(1e4)
        });
        if (res.status === 200 || res.status === 206) {
          console.log("Vercel environment: using /api/yt-proxy as ffmpeg input");
          const ffmpegHeaders2 = `${getBypassFfmpegHeaderString()}Accept: */*\r
Accept-Encoding: identity\r
`;
          return { inputPath: proxyUrl2, ffmpegHeaders: ffmpegHeaders2 };
        }
        console.warn(`yt-proxy preflight failed (HTTP ${res.status}), falling back to yt-dlp stream URL`);
      } catch (e) {
        console.warn(
          "yt-proxy preflight failed, falling back to yt-dlp stream URL:",
          e instanceof Error ? e.message.slice(0, 120) : e
        );
      }
    }
    console.log("Vercel environment: using non-yt-dlp YouTube stream fallbacks");
    const streamUrl = await getYouTubeStreamUrlWithFallbacks(videoId);
    try {
      const localPath = import_node_path.default.join(import_node_path.default.dirname(outputTemplate), "source.mp4");
      const ok = await preflightStream(streamUrl);
      if (ok) {
        const downloaded = await downloadStreamToLocalFile(streamUrl, localPath);
        if (downloaded) {
          console.log("Vercel environment: using locally cached fallback stream for ffmpeg input");
          return { inputPath: localPath };
        }
      }
    } catch {
    }
    const internalBaseUrl = getAppBaseUrl();
    const ffmpegHeaders = `${internalBaseUrl && streamUrl.startsWith(internalBaseUrl) ? getBypassFfmpegHeaderString() : ""}User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36\r
Referer: https://www.youtube.com/\r
Origin: https://www.youtube.com\r
Accept: */*\r
Accept-Encoding: identity\r
`;
    return { inputPath: streamUrl, ffmpegHeaders };
  }
  if (isYouTubeUrl(videoUrl)) {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (videoId) {
      try {
        const av = await getYouTubeAvStreamUrlsViaYtDlp(videoId);
        const ffmpegHeaders = "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36\r\nReferer: https://www.youtube.com/\r\nOrigin: https://www.youtube.com\r\nAccept: */*\r\nAccept-Encoding: identity\r\n";
        return { inputPath: av.videoUrl, audioInputPath: av.audioUrl || void 0, ffmpegHeaders };
      } catch (e) {
        console.warn("yt-dlp stream URL failed, falling back to download:", e instanceof Error ? e.message.slice(0, 120) : e);
      }
    }
  }
  const baseArgs = [
    "--no-playlist",
    "--restrict-filenames",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate,
    "--merge-output-format",
    "mp4"
  ];
  const proxyUrl = await detectProxy();
  const proxyArg = proxyUrl ? ["--proxy", proxyUrl] : [];
  const strategies = [];
  if (isYouTubeUrl(videoUrl)) {
    if (hasCookies && !await hasFreshCookieFile()) await exportChromeCookies(videoUrl);
    const cookieFileArg = await hasFreshCookieFile() ? ["--cookies", COOKIE_FILE_PATH] : [];
    const cookieBrowserArg = hasCookies ? ["--cookies-from-browser", "chrome"] : [];
    const envCookieContent = process.env.YOUTUBE_COOKIES;
    if (envCookieContent) {
      try {
        const envCookiePath = import_node_path.default.join(CACHE_DIR, "env-yt-cookies.txt");
        await (0, import_promises.writeFile)(envCookiePath, envCookieContent);
        strategies.push([...proxyArg, "--cookies", envCookiePath, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
        strategies.push([...proxyArg, "--cookies", envCookiePath, ...baseArgs, "-f", "best", videoUrl]);
        console.log("yt-dlp: YOUTUBE_COOKIES env var detected, added cookie strategies");
      } catch {
      }
    }
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=mweb", ...baseArgs, "-f", `best[height<=${LOCAL_MAX_HEIGHT}]/best`, videoUrl]);
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=android_testsuite", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=android_embedded", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=ios", ...baseArgs, "-f", `best[height<=${LOCAL_MAX_HEIGHT}]/best`, videoUrl]);
    strategies.push([...proxyArg, "--extractor-args", "youtube:player_client=android", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    if (cookieFileArg.length) strategies.push([...proxyArg, ...cookieFileArg, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    if (cookieBrowserArg.length) strategies.push([...proxyArg, ...cookieBrowserArg, "--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs, "-f", `bestvideo[height<=${LOCAL_MAX_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${LOCAL_MAX_HEIGHT}]+bestaudio/best`, videoUrl]);
    strategies.push([...proxyArg, ...baseArgs, "-f", "18", videoUrl]);
    strategies.push(["--extractor-args", "youtube:player_client=tv_embedded", ...baseArgs, "-f", "best", videoUrl]);
    strategies.push([...baseArgs, "-f", "best", videoUrl]);
  } else {
    strategies.push([...baseArgs, "-f", "bestvideo*+bestaudio/best", videoUrl]);
  }
  let stdout = "", stderr = "", lastError;
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`yt-dlp download strategy ${i + 1}/${strategies.length}\u2026`);
      const r = await runYtDlp(strategies[i], false);
      stdout = r.stdout;
      stderr = r.stderr;
      lastError = null;
      console.log(`yt-dlp download strategy ${i + 1} succeeded`);
      break;
    } catch (err) {
      lastError = err;
      stdout = err && typeof err === "object" && "stdout" in err ? String(err.stdout) : "";
      stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    }
  }
  const resolvedPath = stdout.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!resolvedPath && isYouTubeUrl(videoUrl)) {
    const ytdlpErr = stderr.slice(0, 200);
    console.warn(`yt-dlp download failed (${ytdlpErr.slice(0, 120)}), trying stream proxy fallbacks\u2026`);
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) throw new Error("Invalid YouTube URL");
    return { inputPath: await getYouTubeStreamUrlWithFallbacks(videoId) };
  }
  if (!resolvedPath) {
    const msg = stderr.trim() || (lastError instanceof Error ? lastError.message : "") || "No file path returned.";
    throw new Error(`Failed to download video: ${msg}`);
  }
  return { inputPath: resolvedPath };
}
async function generateThumbnail(clipPath, clipDuration) {
  if (clipPath.startsWith("http")) return "";
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = thumbFileName(import_node_path.default.basename(clipPath));
  const thumbPath = import_node_path.default.join(PUBLIC_CLIP_DIR, fileName);
  const seekTime = Math.min(10, Math.max(2, Math.floor(clipDuration * 0.25)));
  const tryThumb = async (seek) => {
    await execFile(ffmpegPath, [
      "-y",
      "-ss",
      String(seek),
      "-i",
      clipPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      "-vf",
      "scale=640:-2",
      thumbPath
    ], { timeout: 3e4, maxBuffer: 5 * 1024 * 1024 });
    await (0, import_promises.access)(thumbPath, import_node_fs.constants.R_OK);
  };
  try {
    await tryThumb(seekTime);
    const thumbBuffer = await (0, import_promises.readFile)(thumbPath);
    (0, import_promises.unlink)(thumbPath).catch(() => {
    });
    return `data:image/jpeg;base64,${thumbBuffer.toString("base64")}`;
  } catch {
    try {
      await tryThumb(1);
      const thumbBuffer = await (0, import_promises.readFile)(thumbPath);
      (0, import_promises.unlink)(thumbPath).catch(() => {
      });
      return `data:image/jpeg;base64,${thumbBuffer.toString("base64")}`;
    } catch {
      (0, import_promises.unlink)(thumbPath).catch(() => {
      });
      return "";
    }
  }
}
async function createLocalClip(params) {
  await ensureDirectories();
  const ffmpegPath = await ensureFfmpegAvailable();
  const fileName = clipFileName(params.title);
  const outputPath = import_node_path.default.join(PUBLIC_CLIP_DIR, fileName);
  const duration = Math.max(1, params.endTime - params.startTime);
  const isRemoteInput = params.inputPath.startsWith("http");
  const isWorkerStream = isRemoteInput && (() => {
    try {
      const u = new URL(params.inputPath);
      return u.pathname.includes("/stream") && (u.hostname.endsWith(".workers.dev") || u.hostname.includes("youtube-proxy"));
    } catch {
      return false;
    }
  })();
  const isBilibiliStream = isRemoteInput && (params.inputPath.includes("bilivideo.com") || params.inputPath.includes("bilivideo.cn") || params.inputPath.includes("upos-sz") || params.inputPath.includes("akamaized.net"));
  const httpInputFlags = isRemoteInput ? [
    "-reconnect",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5"
  ] : [];
  const bilibiliHeaders = isBilibiliStream ? [
    "Referer: https://www.bilibili.com\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n"
  ] : [];
  const inputHeaders = isRemoteInput ? `${(params.inputHeaders || "").replace(/\r?\n/g, "\r\n")}${params.inputHeaders ? params.inputHeaders.endsWith("\n") || params.inputHeaders.endsWith("\r\n") ? "" : "\r\n" : ""}${bilibiliHeaders.join("")}` : "";
  const ffmpegInputHeaders = isRemoteInput && inputHeaders ? ["-headers", inputHeaders] : [];
  const videoFilter = SHOULD_INLINE_CLIPS ? ["-vf", VERCEL_SCALE] : ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"];
  const crf = SHOULD_INLINE_CLIPS ? INLINE_CRF : isRemoteInput ? "16" : "17";
  const preset = SHOULD_INLINE_CLIPS ? INLINE_PRESET : isRemoteInput ? "medium" : "fast";
  const fastSeek = !isRemoteInput || isWorkerStream || params.inputPath.includes("googlevideo.com");
  const hasAudioInput = typeof params.audioInputPath === "string" && params.audioInputPath.length > 0;
  const audioIsRemote = hasAudioInput && params.audioInputPath.startsWith("http");
  const audioHeaders = audioIsRemote && inputHeaders ? ["-headers", inputHeaders] : [];
  const seekArgs = (() => {
    const t = ["-t", String(duration)];
    if (!hasAudioInput) {
      return fastSeek ? ["-ss", String(params.startTime), ...ffmpegInputHeaders, "-i", params.inputPath, ...t] : [...ffmpegInputHeaders, "-i", params.inputPath, "-ss", String(params.startTime), ...t];
    }
    return fastSeek ? [
      "-ss",
      String(params.startTime),
      ...ffmpegInputHeaders,
      "-i",
      params.inputPath,
      "-ss",
      String(params.startTime),
      ...audioHeaders,
      "-i",
      params.audioInputPath,
      ...t
    ] : [
      ...ffmpegInputHeaders,
      "-i",
      params.inputPath,
      ...audioHeaders,
      "-i",
      params.audioInputPath,
      "-ss",
      String(params.startTime),
      ...t
    ];
  })();
  const args = [
    "-y",
    ...httpInputFlags,
    ...seekArgs,
    "-map",
    "0:v:0",
    ...hasAudioInput ? ["-map", "1:a:0?"] : ["-map", "0:a:0?"],
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    crf,
    "-profile:v",
    "high",
    "-level:v",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    ...videoFilter,
    "-c:a",
    "aac",
    "-b:a",
    IS_VERCEL ? "128k" : "160k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    outputPath
  ];
  try {
    await execFile(ffmpegPath, args, {
      cwd: CACHE_DIR,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60 * 1e3
    });
  } catch (error) {
    const errStderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const errStdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    const combined = `${errStderr}
${errStdout}`.trim();
    const tail = combined.length > 6e3 ? combined.slice(-6e3) : combined;
    throw new Error(tail || "ffmpeg failed to generate the clip.");
  }
  const thumbnailUrl = await generateThumbnail(outputPath, duration);
  console.log(`Clip created: ${outputPath}, thumbnail: ${thumbnailUrl || "(none)"}`);
  const localBase = getLocalMediaBaseUrl();
  if (localBase) {
    return {
      outputPath,
      publicUrl: `${localBase}/api/serve-clip/${fileName}`,
      dataUrl: "",
      thumbnailUrl
    };
  }
  let dataUrl = "";
  try {
    let fileBuffer = await (0, import_promises.readFile)(outputPath);
    let fileSizeBytes = fileBuffer.length;
    if (SHOULD_INLINE_CLIPS && fileSizeBytes > MAX_INLINE_BYTES) {
      const attempts = [
        { crfDelta: 6, width: VERCEL_TARGET_WIDTH_NUM, height: VERCEL_TARGET_HEIGHT_NUM },
        { crfDelta: 10, width: 854, height: 480 },
        { crfDelta: 14, width: 640, height: 360 },
        { crfDelta: 18, width: 426, height: 240 }
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
            "-y",
            "-i",
            outputPath,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            fallbackCrf,
            "-vf",
            `scale=${fallbackW}:${fallbackH}:force_original_aspect_ratio=decrease,pad=${fallbackW}:${fallbackH}:(ow-iw)/2:(oh-ih)/2`,
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            fallbackPath
          ], { cwd: CACHE_DIR, timeout: 2 * 60 * 1e3, maxBuffer: 20 * 1024 * 1024 });
          await (0, import_promises.access)(fallbackPath, import_node_fs.constants.R_OK);
          fileBuffer = await (0, import_promises.readFile)(fallbackPath);
          fileSizeBytes = fileBuffer.length;
          await (0, import_promises.unlink)(fallbackPath).catch(() => {
          });
        } catch {
          await (0, import_promises.unlink)(fallbackPath).catch(() => {
          });
        }
      }
      if (fileSizeBytes <= MAX_INLINE_BYTES) {
        (0, import_promises.unlink)(outputPath).catch(() => {
        });
      }
    }
    if (SHOULD_INLINE_CLIPS && fileSizeBytes <= MAX_INLINE_BYTES) {
      dataUrl = `data:video/mp4;base64,${fileBuffer.toString("base64")}`;
      console.log(`Clip inlined as data URL: ${Math.round(fileSizeBytes / 1024)}KB`);
      if (dataUrl) {
        (0, import_promises.unlink)(outputPath).catch(() => {
        });
      }
    } else {
      console.warn(`Clip too large for inline (${Math.round(fileSizeBytes / 1024 / 1024)}MB > ${MAX_INLINE_BYTES / 1024 / 1024}MB limit), falling back to serve-clip`);
    }
  } catch (readErr) {
    console.warn("Could not read clip for data URL:", readErr instanceof Error ? readErr.message : readErr);
  }
  return {
    outputPath,
    publicUrl: `/api/serve-clip/${fileName}`,
    // fallback if dataUrl is empty
    dataUrl,
    // preferred — works across Lambda invocations
    thumbnailUrl
  };
}
async function analyzeVideo(videoUrl) {
  const normalizedUrl = await normalizeVideoUrl(videoUrl);
  await ensureDirectories();
  const workDir = import_node_path.default.join(CACHE_DIR, sourceId(normalizedUrl));
  await (0, import_promises.mkdir)(workDir, { recursive: true });
  if (isYouTubeUrl(normalizedUrl)) {
    try {
      return await analyzeYouTubeVideo(normalizedUrl, workDir);
    } catch (error) {
      console.warn("YouTube analysis failed completely, using fallback:", error instanceof Error ? error.message.slice(0, 100) : "");
      try {
        return await analyzeYouTubeViaPipedAndTranscript(normalizedUrl);
      } catch {
        return { duration: 180, title: "YouTube video", highlights: buildFallbackHighlights(180) };
      }
    }
  }
  if (isBilibiliUrl(normalizedUrl)) {
    try {
      return await analyzeBilibiliVideo(normalizedUrl, workDir);
    } catch (error) {
      console.warn("Bilibili analysis failed, using fallback:", error instanceof Error ? error.message.slice(0, 100) : "");
      return { duration: 180, title: "Bilibili video", highlights: buildFallbackHighlights(180) };
    }
  }
  return { duration: 180, title: "Source video", highlights: buildFallbackHighlights(180) };
}
async function downloadYouTubeClip(params) {
  const source = await downloadSourceVideo(params.videoUrl);
  return createLocalClip({
    inputPath: source.inputPath,
    audioInputPath: source.audioInputPath,
    inputHeaders: source.ffmpegHeaders,
    startTime: params.startTime,
    endTime: params.endTime,
    title: params.title
  });
}
var videoClipper = {
  analyzeVideo,
  createLocalClip,
  downloadSourceVideo,
  downloadYouTubeClip,
  isYouTubeUrl,
  isBilibiliUrl
};
var video_clipper_default = videoClipper;

// src/agent/runner.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function mustGetEnv(name, fallback = "") {
  const v = (process.env[name] || fallback).trim();
  return v;
}
async function postJson(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
async function reportWithRetry(serverUrl, headers, payload) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await postJson(`${serverUrl}/api/agent/jobs/report`, payload, headers);
      return;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(4e3, 300 * Math.pow(2, attempt));
      await sleep(delay);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message.slice(0, 200) : String(lastErr).slice(0, 200);
  throw new Error(`report failed after retries: ${msg}`);
}
async function report(serverUrl, headers, payload) {
  await reportWithRetry(serverUrl, headers, payload);
}
async function processJob(serverUrl, headers, job) {
  await report(serverUrl, headers, {
    jobId: job.id,
    status: "processing",
    stage: "ai_analysis",
    progress: 10,
    message: "Analyzing video and generating highlights..."
  });
  const analysis = await video_clipper_default.analyzeVideo(job.videoUrl);
  const autoCount = (() => {
    const d = Math.max(0, Math.floor(Number(analysis.duration) || 0));
    if (d >= 2 * 60 * 60) return 10;
    if (d >= 90 * 60) return 9;
    if (d >= 60 * 60) return 8;
    if (d >= 40 * 60) return 7;
    if (d >= 25 * 60) return 6;
    if (d >= 15 * 60) return 5;
    if (d >= 8 * 60) return 4;
    return 3;
  })();
  const desired = typeof job.desiredClipCount === "number" && job.desiredClipCount > 0 ? Math.max(1, Math.min(10, Math.floor(job.desiredClipCount))) : autoCount;
  const highlights = analysis.highlights.slice(0, desired);
  await report(serverUrl, headers, {
    jobId: job.id,
    status: "processing",
    stage: "analysis_complete",
    progress: 35,
    message: `Found ${highlights.length} highlight moments.`,
    result: { title: analysis.title, duration: analysis.duration, highlights }
  });
  await report(serverUrl, headers, {
    jobId: job.id,
    status: "processing",
    stage: "generating_clip",
    progress: 40,
    message: "Preparing source video..."
  });
  const source = await video_clipper_default.downloadSourceVideo(job.videoUrl);
  const clips = [];
  for (let i = 0; i < highlights.length; i += 1) {
    const h = highlights[i];
    const start = Math.max(0, Math.floor(h.start_time));
    const end = Math.max(start + 1, Math.ceil(h.end_time));
    const draft = {
      id: `${job.id}-clip-${i}`,
      title: h.title,
      startTime: start,
      endTime: end,
      duration: end - start,
      summary: h.summary,
      engagementScore: h.engagement_score,
      thumbnailUrl: "",
      videoUrl: null,
      status: "processing"
    };
    await report(serverUrl, headers, {
      jobId: job.id,
      status: "processing",
      stage: "generating_clip",
      progress: 45 + Math.floor(i / highlights.length * 45),
      message: `Generating clip ${i + 1}/${highlights.length}: "${h.title}"`,
      result: { title: analysis.title, duration: analysis.duration, highlights, clips: [...clips, draft] }
    });
    try {
      const result = await video_clipper_default.createLocalClip({
        inputPath: source.inputPath,
        audioInputPath: source.audioInputPath,
        inputHeaders: source.ffmpegHeaders,
        startTime: start,
        endTime: end,
        title: h.title
      });
      const done = {
        ...draft,
        status: "completed",
        thumbnailUrl: result.thumbnailUrl || "",
        videoUrl: result.dataUrl || result.publicUrl
      };
      clips.push(done);
    } catch (err) {
      clips.push({
        ...draft,
        status: "failed",
        error: err instanceof Error ? err.message.slice(-800) : String(err).slice(-800)
      });
    }
  }
  const completed = clips.filter((c) => typeof c === "object" && c && c.status === "completed");
  if (completed.length === 0) {
    await report(serverUrl, headers, {
      jobId: job.id,
      status: "failed",
      stage: "error",
      progress: 0,
      message: "All clips failed to generate.",
      error: "All clips failed to generate.",
      result: { title: analysis.title, duration: analysis.duration, highlights, clips }
    });
    return;
  }
  await report(serverUrl, headers, {
    jobId: job.id,
    status: "completed",
    stage: "complete",
    progress: 100,
    message: `Generated ${completed.length} clips.`,
    result: { title: analysis.title, duration: analysis.duration, highlights, clips }
  });
}
async function main() {
  const serverUrl = mustGetEnv("VIDSHORTER_SERVER_URL", "http://localhost:5100").replace(/\/$/, "");
  const agentId = mustGetEnv("VIDSHORTER_AGENT_ID", `agent-${(0, import_node_crypto2.randomUUID)()}`);
  const secret = mustGetEnv("AGENT_SECRET");
  const headers = secret ? { "x-agent-secret": secret } : {};
  process.env.APP_BASE_URL = serverUrl;
  if (!process.env.PREFER_EDGE_YOUTUBE) process.env.PREFER_EDGE_YOUTUBE = "0";
  if (!process.env.INLINE_CLIPS) process.env.INLINE_CLIPS = "0";
  console.log(`agent runner started: agentId=${agentId} server=${serverUrl}`);
  for (; ; ) {
    try {
      const { job } = await postJson(
        `${serverUrl}/api/agent/jobs/pull`,
        { agentId },
        headers
      );
      if (!job) {
        await sleep(2e3);
        continue;
      }
      console.log(`job claimed: ${job.id}`);
      await processJob(serverUrl, headers, job);
      console.log(`job done: ${job.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400);
      console.warn(`agent loop error: ${msg}`);
      await sleep(1500);
    }
  }
}
main().catch((err) => {
  const msg = err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400);
  console.error(`agent fatal error: ${msg}`);
});
