/**
 * P0-3 一键可直接发布成片（本地渲染管线，去基座 API）。
 *
 * 把「切一段」升级为「可直接发布」：
 *   粗剪(jump-cut) → 9:16 blur-fit 重构 → 卡拉OK字幕 → 片头钩子 → 结尾 CTA → 分级(水印/画质)
 *
 * 设计取舍：
 *  1. **只用 ffmpeg 一个依赖**。桌面端（@ffmpeg-installer/ffmpeg）没有 sharp、也不保证
 *     有 drawtext；因此水印与钩子/CTA 全部走 **ASS 字幕层**（libass/subtitles 滤镜），
 *     与字幕共用一条渲染链路，零新增依赖。
 *  2. **能力探测而非假设**：libass 不可用时降级为「无字幕渲染」并在结果里回带
 *     `warnings`（不静默、不报致命错、更不回落横屏小分辨率）。
 *  3. **分级 fail-closed**：未知/缺失 plan 一律按免费档（720p + 水印）渲染。
 *  4. 内存纪律：输出用 ffmpeg 直写磁盘，绝不整块读视频进内存。
 */

const { execFile, spawnSync } = require('node:child_process');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const { ffmpegPath, probeDurationSeconds } = require('./local-highlights');

const execFileAsync = promisify(execFile);

/** 设计基准分辨率（ASS 的 PlayRes）；实际输出按 plan 缩放，libass 会等比缩放字号。 */
const DESIGN_W = 1080;
const DESIGN_H = 1920;

/** 画幅 → 设计尺寸。plan 档位在此之上按倍率缩放。 */
const ASPECTS = {
  '9:16': { w: DESIGN_W, h: DESIGN_H },
  '1:1': { w: DESIGN_W, h: DESIGN_W },
  '16:9': { w: DESIGN_H, h: DESIGN_W },
};

/** plan → 输出倍率 + 是否水印。免费档 720p（1080*2/3=720）带水印。 */
const TIERS = {
  pro: { label: '4k', factor: 2, watermark: false },
  starter: { label: '1080p', factor: 1, watermark: false },
  free: { label: '720p', factor: 2 / 3, watermark: true },
};

/**
 * 画质/水印分级（fail-closed：未知 plan → 免费档）。
 * @param {string} [plan] 'free' | 'starter' | 'pro'
 * @param {string} [aspect] '9:16' | '1:1' | '16:9'
 */
function resolveExportTarget(plan, aspect = '9:16') {
  const tier = TIERS[plan] || TIERS.free;
  const base = ASPECTS[aspect] || ASPECTS['9:16'];
  const even = (v) => Math.max(2, Math.round((v * tier.factor) / 2) * 2);
  return {
    label: tier.label,
    watermark: tier.watermark,
    aspect: ASPECTS[aspect] ? aspect : '9:16',
    width: even(base.w),
    height: even(base.h),
  };
}

// ── ffmpeg 能力 / 媒体探测 ───────────────────────────────────────────────────

let subtitleFilterMemo = null;

/** 探测当前 ffmpeg 是否含 subtitles 滤镜（libass）。结果 memoized。 */
async function hasSubtitleFilter() {
  if (subtitleFilterMemo !== null) return subtitleFilterMemo;
  const bin = ffmpegPath();
  if (!bin) {
    subtitleFilterMemo = false;
    return false;
  }
  try {
    const { stdout } = await execFileAsync(bin, ['-hide_banner', '-filters'], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 20_000,
      env: { ...process.env, LANG: 'C' },
    });
    subtitleFilterMemo = /^\s*\S+\s+subtitles\s/m.test(String(stdout || ''));
  } catch {
    subtitleFilterMemo = false;
  }
  return subtitleFilterMemo;
}

/** 读 ffmpeg -i 的 stderr（媒体信息都在 stderr）。 */
async function probeMedia(inputPath) {
  const bin = ffmpegPath();
  if (!bin) return { width: 0, height: 0, duration: 0, hasAudio: false };
  const r = await execFileAsync(bin, ['-hide_banner', '-i', inputPath], { timeout: 30_000 })
    .catch((e) => ({ stderr: e && e.stderr ? e.stderr : '' }));
  const stderr = String((r && r.stderr) || '');
  const dim = stderr.match(/,\s*(\d{2,5})x(\d{2,5})[\s,]/);
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const sec = dur
    ? parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3])
    : 0;
  return {
    width: dim ? parseInt(dim[1], 10) : 0,
    height: dim ? parseInt(dim[2], 10) : 0,
    duration: Number.isFinite(sec) ? sec : 0,
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(stderr),
  };
}

// ── 粗剪（jump-cut）：与 src/lib/server/jump-cut.ts 同规则 ────────────────────

const PAD_SEC = 0.15;
const MIN_KEEP_GAP_SEC = 0.35;
const FILLER_MAX_SEC = 1.5;
const MIN_KEPT_SEC = 3;
const MIN_KEPT_RATIO = 0.5;
const MIN_SEGMENT_SEC = 0.4;

const FILLER_TOKENS = new Set([
  '呃', '嗯', '唔', '啊', '哦', '噢', '唉', '呀', '诶', '嘛', '哎',
  'um', 'uh', 'uhm', 'erm', 'er', 'hmm', 'hm', 'mm', 'mmm', 'ah', 'eh', 'oh',
  'like', 'well', 'so', 'okay', 'ok', 'right', 'yeah',
]);
const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of'];

/** 纯语气词 cue 判定（整条只由语气词/标点构成，且时长短）。 */
function isFillerCue(cue) {
  const dur = Number(cue.end) - Number(cue.start);
  if (!(dur > 0) || dur > FILLER_MAX_SEC) return false;
  let text = String(cue.text || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
  if (!text) return false;
  for (const phrase of FILLER_PHRASES) text = text.split(phrase).join(' ');
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(
    (t) => FILLER_TOKENS.has(t) || Array.from(t).every((ch) => FILLER_TOKENS.has(ch)),
  );
}

/**
 * 规划保留区间。**安全阀优先**：判断不出来或剪太狠一律 disabled（整段原样输出）。
 * @returns {{disabled:boolean, reason:string, segments:Array<{start:number,end:number}>|null}}
 */
function planKeepSegments(cues, duration) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (safeDuration <= 0) return { disabled: true, reason: 'invalid_duration', segments: null };
  if (!Array.isArray(cues) || cues.length === 0) {
    return { disabled: true, reason: 'no_transcript', segments: null };
  }

  const spans = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
    if (isFillerCue(cue)) continue;
    const s = Math.max(0, cue.start - PAD_SEC);
    const e = Math.min(safeDuration, cue.end + PAD_SEC);
    if (e > s) spans.push({ start: s, end: e });
  }
  if (spans.length === 0) return { disabled: true, reason: 'all_filler', segments: null };

  spans.sort((a, b) => a.start - b.start);
  const merged = [spans[0]];
  for (let i = 1; i < spans.length; i += 1) {
    const last = merged[merged.length - 1];
    const cur = spans[i];
    if (cur.start - last.end < MIN_KEEP_GAP_SEC) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }

  const segments = merged.filter((s) => s.end - s.start >= MIN_SEGMENT_SEC);
  if (segments.length === 0) return { disabled: true, reason: 'no_valid_segments', segments: null };

  const keptSec = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (keptSec < MIN_KEPT_SEC) return { disabled: true, reason: 'kept_too_short', segments: null };
  if (keptSec / safeDuration < MIN_KEPT_RATIO) {
    return { disabled: true, reason: 'kept_ratio_too_low', segments: null };
  }
  return {
    disabled: false,
    reason: 'ok',
    segments,
    keptSec: Number(keptSec.toFixed(3)),
    removedSec: Number((safeDuration - keptSec).toFixed(3)),
  };
}

/** 保留区间 → trim/concat 滤镜链（输入时间轴已是 clip 相对时间）。 */
function buildJumpCutGraph(segments, withAudio) {
  const n = segments.length;
  const fmt = (v) => v.toFixed(3);
  const vChains = [];
  const aChains = [];
  if (n === 1) {
    const s = segments[0];
    vChains.push(`[0:v]trim=start=${fmt(s.start)}:end=${fmt(s.end)},setpts=PTS-STARTPTS[vjc]`);
    if (withAudio) {
      aChains.push(`[0:a]atrim=start=${fmt(s.start)}:end=${fmt(s.end)},asetpts=PTS-STARTPTS[ajc]`);
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      const s = segments[i];
      vChains.push(`[0:v]trim=start=${fmt(s.start)}:end=${fmt(s.end)},setpts=PTS-STARTPTS[v${i}]`);
      if (withAudio) {
        aChains.push(`[0:a]atrim=start=${fmt(s.start)}:end=${fmt(s.end)},asetpts=PTS-STARTPTS[a${i}]`);
      }
    }
    const vIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
    vChains.push(`${vIn}concat=n=${n}:v=1:a=0[vjc]`);
    if (withAudio) {
      const aIn = Array.from({ length: n }, (_, i) => `[a${i}]`).join('');
      aChains.push(`${aIn}concat=n=${n}:v=0:a=1[ajc]`);
    }
  }
  return { vChains, aChains, vLabel: '[vjc]', aLabel: '[ajc]' };
}

/** 把 cues 从「原 clip 时间轴」映射到「剪后时间轴」（否则字幕整体错位）。 */
function remapCues(cues, segments) {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  if (!Array.isArray(segments) || segments.length === 0) return cues;

  const offsets = [];
  let acc = 0;
  for (const seg of segments) {
    offsets.push(acc);
    acc += seg.end - seg.start;
  }

  const out = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const s = Math.max(cue.start, seg.start);
      const e = Math.min(cue.end, seg.end);
      if (e - s <= 0.05) continue;
      out.push({
        start: Number((offsets[i] + (s - seg.start)).toFixed(3)),
        end: Number((offsets[i] + (e - seg.start)).toFixed(3)),
        text: cue.text,
      });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// ── ASS 字幕（字幕 + 钩子 + CTA + 水印，共用一条 libass 链路）───────────────

const STYLE_SIZE = { small: 46, medium: 58, large: 70 };
const HIGHLIGHT = {
  yellow: '&H0000FFFF',
  cyan: '&H00FFFF00',
  pink: '&H00FF00FF',
  green: '&H0000FF00',
  orange: '&H0010A5FF',
};

function fmtAssTime(s) {
  const v = Math.max(0, Number(s) || 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = Math.min(59.99, v % 60);
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function escapeAss(text) {
  return String(text || '')
    .replace(/\r?\n/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\N/gi, ' ')
    .trim();
}

/** 把一段文本切成卡拉OK token（拉丁词/数字为一个，CJK 逐字）。w=行宽权重，sp=前是否有空格。 */
function tokenizeText(text) {
  const out = [];
  const re = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u3040-\u30ff\u4e00-\u9fa5]|[^\s]/g;
  let lastEnd = 0;
  for (const m of String(text).matchAll(re)) {
    const gap = m.index > lastEnd;
    lastEnd = m.index + m[0].length;
    const tok = m[0];
    if (/^[\u3040-\u30ff\u4e00-\u9fa5]$/.test(tok)) out.push({ tok, w: 2, sp: false });
    else if (tok.length > 12) {
      for (let i = 0; i < tok.length; i += 6) {
        const chunk = tok.slice(i, i + 6);
        out.push({ tok: chunk, w: chunk.length, sp: i === 0 ? gap : false });
      }
    } else out.push({ tok, w: tok.length, sp: gap });
  }
  return out;
}

/**
 * 生成「带真实时长的 timed token」列表。
 * 优先使用词级时间戳（本地 ASR 的 words），否则按 cue 内宽度占比分配。
 * @returns {Array<{tok:string,w:number,sp:boolean,start:number,end:number}>}
 */
function toTimedTokens({ cues, words }) {
  const out = [];

  if (Array.isArray(words) && words.length > 0) {
    let prevEnd = null;
    for (const w of words) {
      const tok = escapeAss(w && w.text);
      if (!tok) continue;
      const start = Number(w.start);
      const end = Number(w.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      out.push({ tok, w: Math.max(1, tok.length > 12 ? 6 : tok.length), sp: prevEnd !== null, start, end });
      prevEnd = end;
    }
    return out;
  }

  for (const cue of Array.isArray(cues) ? cues : []) {
    const text = escapeAss(cue && cue.text);
    if (!text) continue;
    const start = Number(cue.start);
    const end = Number(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const tokens = tokenizeText(text);
    if (tokens.length === 0) continue;
    const totalW = tokens.reduce((s, t) => s + t.w, 0) || 1;
    let acc = start;
    for (let i = 0; i < tokens.length; i += 1) {
      const span = i === tokens.length - 1 ? end - acc : ((end - start) * tokens[i].w) / totalW;
      const tStart = acc;
      const tEnd = Math.max(tStart + 0.05, i === tokens.length - 1 ? end : acc + span);
      acc = tEnd;
      out.push({ ...tokens[i], start: tStart, end: tEnd });
    }
  }
  return out;
}

/** timed token → ASS 卡拉OK 行文本（`{\k<centiseconds>}word`，标准标签序）。 */
function karaokeLineText(tokens) {
  let s = '';
  for (const t of tokens) {
    const cs = Math.max(1, Math.round((t.end - t.start) * 100));
    s += `${t.sp && s ? ' ' : ''}{\\k${cs}}${t.tok}`;
  }
  return s;
}

/** 按行宽（≤40）把 token 分组成多行；每行独立成为一个 Dialogue 事件。 */
function groupTokensIntoRows(tokens, widthLimit = 40) {
  const rows = [];
  let cur = [];
  let curW = 0;
  for (const t of tokens) {
    if (curW + t.w > widthLimit && cur.length > 0) {
      rows.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(t);
    curW += t.w;
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/**
 * 构建「可发布成片」的 ASS 文件（字幕 + 片头钩子 + 结尾 CTA + 免费档水印）。
 * @returns {Promise<string|null>} ASS 文件绝对路径；无任何事件时返回 null
 */
async function buildPublishAssFile({
  outDir,
  cues,
  words,
  title,
  duration,
  style = {},
  watermark = false,
  hook = true,
  ctaText = '',
  fontName = 'PingFang SC',
}) {
  const sizeKey = STYLE_SIZE[style.size] ? style.size : 'medium';
  const fontsize = STYLE_SIZE[sizeKey];
  const highlight = HIGHLIGHT[style.highlight] ? style.highlight : 'yellow';
  const outline = style.outline === 'none' ? 0 : style.outline === 'light' ? 2 : 3;
  const shadow = style.outline === 'none' ? 0 : 2;
  const backColour = style.background === 'none' ? '&H00000000' : '&H96000000';

  const styles = [
    `Style: Sub, ${fontName}, ${fontsize}, &H00FFFFFF, ${HIGHLIGHT[highlight]}, &H00101010, ${backColour}, -1, 0, 0, 0, 100, 100, 0, 0, 1, ${outline}, ${shadow}, 2, 60, 60, 90, 1`,
    // 片头钩子：顶部居中大字
    `Style: Hook, ${fontName}, 92, &H00FFFFFF, &H000000FF, &H00101010, &H80000000, -1, 0, 0, 0, 100, 100, 1, 0, 1, 4, 3, 8, 80, 80, 150, 1`,
    // 结尾 CTA：中下居中
    `Style: CTA, ${fontName}, 64, &H0000E5FF, &H000000FF, &H00101010, &H96000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 3, 2, 2, 80, 80, 260, 1`,
    // 水印：右下角小字
    `Style: WM, ${fontName}, 36, &H60FFFFFF, &H60FFFFFF, &H50000000, &H00000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 3, 40, 40, 40, 1`,
  ];

  const events = [];

  // 片头钩子（前 hookSeconds 秒）
  const hookSeconds = Number(style.hookFirstSeconds) > 0 ? Number(style.hookFirstSeconds) : 3;
  if (hook && title && duration > 0.5) {
    const hEnd = Math.min(duration, hookSeconds);
    events.push(`Dialogue: 1,${fmtAssTime(0)},${fmtAssTime(hEnd)},Hook,,0,0,0,,${escapeAss(title)}`);
  }

  // 结尾 CTA（最后 ctaSeconds 秒）
  const cta = escapeAss(ctaText);
  if (cta && duration > 1) {
    const cStart = Math.max(0, duration - 2.5);
    events.push(`Dialogue: 1,${fmtAssTime(cStart)},${fmtAssTime(duration)},CTA,,0,0,0,,${cta}`);
  }

  // 水印（整段，免费档）
  if (watermark && duration > 0) {
    events.push(`Dialogue: 2,${fmtAssTime(0)},${fmtAssTime(duration)},WM,,0,0,0,,clipopai.com`);
  }

  // 卡拉OK字幕
  const timed = toTimedTokens({ cues, words });
  if (timed.length > 0) {
    for (const row of groupTokensIntoRows(timed)) {
      const s = row[0].start;
      const e = row[row.length - 1].end;
      if (!(e > s)) continue;
      events.push(`Dialogue: 0,${fmtAssTime(s)},${fmtAssTime(e)},Sub,,0,0,0,,${karaokeLineText(row)}`);
    }
  }
  if (events.length === 0) return null;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${DESIGN_W}`,
    `PlayResY: ${DESIGN_H}`,
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  await fs.mkdir(outDir, { recursive: true });
  const name = `publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`;
  const p = path.join(outDir, name);
  await fs.writeFile(p, `${header}\n${events.join('\n')}\n`, 'utf-8');
  return { path: p, name };
}

// ── 滤镜图编排 ───────────────────────────────────────────────────────────────

/** 9:16（或任意画幅）blur-fit 复合滤镜：整幅 contain 居中 + 同画面放大模糊填边，绝不裁人。 */
function buildBlurFitChains(inLabel, w, h, postChain) {
  const chains = [
    `${inLabel}split=2[bg][fg]`,
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:2[bgb]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs]`,
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[vmain]`,
  ];
  if (postChain && postChain.trim()) chains.push(`[vmain]${postChain}[vout]`);
  else chains[chains.length - 1] = chains[chains.length - 1].replace('[vmain]', '[vout]');
  return chains;
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

/**
 * 渲染一条「可直接发布」的成片。
 *
 * @param {object} opts
 * @param {string} opts.inputPath   源视频本地路径
 * @param {{start:number,end:number}} opts.clip  片段窗口（源视频绝对时间，秒）
 * @param {Array} [opts.cues]       clip 相对时间的句级字幕（`{start,end,text}`）
 * @param {Array} [opts.words]      clip 相对时间的词级时间戳（优先级高于 cues）
 * @param {string} [opts.title]     片头钩子文案
 * @param {string} [opts.ctaText]   结尾 CTA 文案
 * @param {object} [opts.style]     `{size,outline,background,highlight,hookFirstSeconds,jumpCut}`
 * @param {string} [opts.plan]      'free' | 'starter' | 'pro'
 * @param {string} [opts.aspect]    '9:16' | '1:1' | '16:9'
 * @param {string} opts.outDir      输出目录（ASS 与 mp4 都写这里）
 * @param {(p:object)=>void} [opts.onProgress]
 * @returns {Promise<object>} 渲染结果
 */
async function renderPublishable(opts) {
  const inputPath = String(opts && opts.inputPath ? opts.inputPath : '').trim();
  // 本地文件路径，或本机媒体服务 URL（http://127.0.0.1:PORT/...，ffmpeg 可直接读取）。
  const isRemote = /^https?:\/\//i.test(inputPath);
  if (!inputPath || (!isRemote && !fsSync.existsSync(inputPath))) {
    const err = new Error('待渲染的媒体文件不存在。');
    err.code = 'RENDER_INPUT_MISSING';
    throw err;
  }
  const outDir = String((opts && opts.outDir) || '').trim();
  if (!outDir) {
    const err = new Error('缺少输出目录。');
    err.code = 'RENDER_OUTDIR_MISSING';
    throw err;
  }
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const bin = ffmpegPath();
  if (!bin) {
    const err = new Error('未找到可用的 ffmpeg，请重新安装桌面客户端。');
    err.code = 'NO_FFMPEG';
    err.retryable = false;
    throw err;
  }

  await fs.mkdir(outDir, { recursive: true });
  const meta = await probeMedia(inputPath);
  const srcDuration = meta.duration || (await probeDurationSeconds(inputPath, 0));

  const rawStart = Number(opts.clip && opts.clip.start);
  const rawEnd = Number(opts.clip && opts.clip.end);
  const start = Math.max(0, Number.isFinite(rawStart) ? rawStart : 0);
  const maxEnd = srcDuration > 0 ? srcDuration : Number.isFinite(rawEnd) ? rawEnd : start + 60;
  const end = Math.min(maxEnd, Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 60);
  const duration = Math.max(0.5, end - start);
  if (!(duration > 0)) {
    const err = new Error('片段时长无效，无法渲染。');
    err.code = 'RENDER_BAD_WINDOW';
    throw err;
  }

  const target = resolveExportTarget(opts.plan, opts.aspect);
  const style = opts.style && typeof opts.style === 'object' ? opts.style : {};
  const warnings = [];

  // 1) 粗剪规划（安全阀：不可用/剪太狠 → 原样输出）
  let jump = { disabled: true, reason: 'disabled_by_style', segments: null };
  if (style.jumpCut !== false) {
    jump = planKeepSegments(opts.cues, duration);
  }
  onProgress({ stage: 'plan', progress: 20, message: 'Planning publishable cut...' });

  // 2) 字幕时间轴（粗剪后需重映射）
  const effectiveCues = jump.disabled ? opts.cues : remapCues(opts.cues, jump.segments);
  const effectiveWords = jump.disabled ? opts.words : null; // 词级时间戳不做重映射（粗剪下退化为 cue 级）

  // 3) ASS（字幕 + 钩子 + CTA + 水印）
  const libass = await hasSubtitleFilter();
  let ass = null;
  if (!libass) {
    warnings.push('SUBTITLES_UNAVAILABLE');
  } else {
    ass = await buildPublishAssFile({
      outDir,
      cues: effectiveCues,
      words: effectiveWords,
      title: opts.title,
      duration: jump.disabled ? duration : jump.keptSec || duration,
      style,
      watermark: target.watermark,
      hook: style.hook !== false,
      ctaText: opts.ctaText,
      fontName: opts.fontName,
    });
    if (!ass && (opts.cues?.length || opts.words?.length)) warnings.push('NO_SUBTITLE_EVENTS');
  }

  onProgress({ stage: 'render', progress: 45, message: 'Rendering publishable video...' });

  // 4) 滤镜图：粗剪 → blur-fit → 字幕
  const chains = [];
  let inLabel = '[0:v]';
  let audioLabel = null;

  if (!jump.disabled && jump.segments && jump.segments.length > 0) {
    const jc = buildJumpCutGraph(jump.segments, meta.hasAudio);
    chains.push(...jc.vChains);
    inLabel = jc.vLabel;
    if (meta.hasAudio) {
      chains.push(...jc.aChains);
      audioLabel = jc.aLabel;
    }
  }

  const postChain = ass ? `subtitles=${ass.name}:fontsdir=./` : null;
  chains.push(...buildBlurFitChains(inLabel, target.width, target.height, postChain));

  const outputName = `publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const outputPath = path.join(outDir, outputName);

  const args = [
    '-y',
    '-nostdin',
    '-v', 'error',
    '-ss', String(start),
    '-i', inputPath,
    '-t', String(duration),
    '-filter_complex', chains.join(';'),
    '-map', '[vout]',
  ];
  if (audioLabel) args.push('-map', audioLabel);
  else args.push('-map', '0:a:0?');
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    outputPath,
  );

  try {
    // cwd=outDir 让 `subtitles=<basename>` 相对解析，彻底规避路径转义/空格问题。
    await execFileAsync(bin, args, {
      cwd: outDir,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 600_000,
      env: { ...process.env, LANG: 'C' },
    });
  } catch (err) {
    const err2 = new Error(
      `渲染失败：${err && err.message ? String(err.message).split('\n').slice(-3).join(' ').slice(0, 400) : 'unknown'}`,
    );
    err2.code = 'RENDER_FAILED';
    err2.retryable = true;
    throw err2;
  }

  const outMeta = await probeMedia(outputPath);
  if (!(outMeta.duration > 0)) {
    const err = new Error('渲染产物无效（无法解码）。');
    err.code = 'RENDER_INVALID_OUTPUT';
    err.retryable = true;
    throw err;
  }

  onProgress({ stage: 'done', progress: 100, message: 'Publishable video ready' });
  return {
    outputPath,
    outputName,
    assPath: ass ? ass.path : '',
    width: outMeta.width,
    height: outMeta.height,
    duration: Number(outMeta.duration.toFixed(2)),
    label: target.label,
    aspect: target.aspect,
    watermark: target.watermark,
    subtitles: Boolean(ass),
    jumpCut: { disabled: jump.disabled, reason: jump.reason, removedSec: jump.removedSec || 0 },
    warnings,
  };
}

module.exports = {
  resolveExportTarget,
  renderPublishable,
  buildPublishAssFile,
  planKeepSegments,
  remapCues,
  hasSubtitleFilter,
  probeMedia,
  TIERS,
  ASPECTS,
};
