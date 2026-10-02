import type { SubtitleCue } from '@/lib/server/subtitles';

/**
 * P0 — AI 粗剪清理（Jump-cut，Starter+ 付费权益）。
 *
 * 目标：按逐字稿自动剪掉「长停顿」与「纯语气词」，让成片节奏紧凑。
 *
 * 数据来源：YouTube 官方字幕 cues（`SubtitleCue { start, end, text }`，**非 ASR**），
 * 只有句/段级时间戳，拿不到词级时间戳，因此本模块一律按 **cue 粒度**工作：
 *   - 相邻 cue 之间的空隙 = 说话停顿 → 中间部分剪掉；
 *   - 整条 cue 只由语气词构成 → 整条剪掉。
 *
 * ⚠️ 安全阀优先：判断不出来（无字幕）或剪得太狠（保留不足一半 / 不足 3 秒）时
 * 一律返回 disabled，整段原样输出 —— 宁可不动，不可毁片。
 */

/** cue 区间两侧留白，避免切掉辅音起音导致「吃字」。 */
const PAD_SEC = 0.15;
/** 间隔小于此值的相邻区间直接合并，避免产生碎小的抖动切口。 */
const MIN_KEEP_GAP_SEC = 0.35;
/** 纯语气词 cue 超过此长度则不视为「纯语气词」（可能夹带有效内容）。 */
const FILLER_MAX_SEC = 1.5;
/** 保留总时长低于此值 → 判定为「剪太狠」，整体禁用。 */
const MIN_KEPT_SEC = 3;
/** 保留占比低于此值 → 判定为「剪太狠」，整体禁用。 */
const MIN_KEPT_RATIO = 0.5;
/** 单条保留区间低于此值将被丢弃（无意义的碎片）。 */
const MIN_SEGMENT_SEC = 0.4;

/** 纯语气词词表（中英）。归一化后若整条 cue 只由这些 token 构成则丢弃。 */
const FILLER_TOKENS = new Set([
  '呃', '嗯', '唔', '啊', '哦', '噢', '唉', '呀', '诶', '嘛', '哎',
  'um', 'uh', 'uhm', 'erm', 'er', 'hmm', 'hm', 'mm', 'mmm', 'ah', 'eh', 'oh',
  'like', 'well', 'so', 'okay', 'ok', 'right', 'yeah',
]);

/** 复合语气词短语（先做整串替换，避免 "you know" 被拆成两个词误判）。 */
const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of'];

export interface KeepSegment {
  /** 相对 clip 起点的秒数 */
  start: number;
  end: number;
}

export type JumpCutPlan =
  | { disabled: true; reason: string; segments: null }
  | { disabled: false; reason: string; segments: KeepSegment[]; removedSec: number; keptSec: number };

/**
 * 判断一条 cue 是否为「纯语气词」：去掉标点、复合短语与语气词 token 后不再剩任何内容。
 * 纯语气词且时长较短 → 该 cue 可整条剪掉。
 */
export function isFillerCue(cue: SubtitleCue): boolean {
  const dur = cue.end - cue.start;
  if (dur <= 0 || dur > FILLER_MAX_SEC) return false;

  let text = String(cue.text || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
  if (!text) return false;

  for (const phrase of FILLER_PHRASES) {
    text = text.split(phrase).join(' ');
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  // CJK 语气词可能连写成 "嗯嗯" / "呃呃"，逐字拆开再判。
  return tokens.every((t) =>
    FILLER_TOKENS.has(t) || Array.from(t).every((ch) => FILLER_TOKENS.has(ch)),
  );
}

/**
 * 依据逐字稿 cues 规划「保留区间」。返回 disabled=true 表示调用方应整段原样输出。
 *
 * @param cues     clip 窗口内、已重定基到 clip 相对时间的字幕 cues
 * @param duration clip 时长（秒）
 */
export function planKeepSegments(cues: SubtitleCue[], duration: number): JumpCutPlan {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (safeDuration <= 0) {
    return { disabled: true, reason: 'invalid_duration', segments: null };
  }
  if (!Array.isArray(cues) || cues.length === 0) {
    // 无字幕（含自动字幕被上游限制）→ 无从判断停顿，整段原样输出。
    return { disabled: true, reason: 'no_transcript', segments: null };
  }

  // 1) 逐条 cue 转成保留区间：纯语气词直接丢弃，其余向两侧扩 PAD。
  const spans: KeepSegment[] = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
    if (isFillerCue(cue)) continue;
    const s = Math.max(0, cue.start - PAD_SEC);
    const e = Math.min(safeDuration, cue.end + PAD_SEC);
    if (e > s) spans.push({ start: s, end: e });
  }
  if (spans.length === 0) {
    return { disabled: true, reason: 'all_filler', segments: null };
  }

  // 2) 按起点排序后合并「间隔过小」的相邻区间。
  spans.sort((a, b) => a.start - b.start);
  const merged: KeepSegment[] = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    const cur = spans[i];
    if (cur.start - last.end < MIN_KEEP_GAP_SEC) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  // 3) 丢弃无意义的碎片区间。
  const segments = merged.filter((s) => s.end - s.start >= MIN_SEGMENT_SEC);
  if (segments.length === 0) {
    return { disabled: true, reason: 'no_valid_segments', segments: null };
  }

  const keptSec = segments.reduce((sum, s) => sum + (s.end - s.start), 0);

  // 4) 安全阀：剪太狠一律不动。
  if (keptSec < MIN_KEPT_SEC) {
    return { disabled: true, reason: 'kept_too_short', segments: null };
  }
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

/**
 * 构建 jump-cut 前置滤镜图：把保留区间拼接成连贯的 v/a 流。
 *
 * 输入时间轴已是 clip 相对时间（cut-clip 用 `-ss <startTime>` 在 `-i` 之前完成输入 seek），
 * 因此这里直接用 clip 相对的 start/end 做 trim。
 *
 * @param segments 保留区间（升序、互不重叠）
 * @returns videoChain / audioChain 为不含首尾分号的链路数组，
 *          vLabel / aLabel 为最终输出标签（`[vjc]` / `[ajc]`）。
 */
export function buildJumpCutGraph(segments: KeepSegment[]): {
  videoChain: string;
  audioChain: string;
  vLabel: string;
  aLabel: string;
} {
  if (!segments || segments.length === 0) {
    throw new Error('buildJumpCutGraph: segments is empty');
  }
  const n = segments.length;
  const fmt = (v: number) => v.toFixed(3);

  if (n === 1) {
    // 单区间无需 concat：trim 一次即可，避免多引入一层拼接。
    // 仍需显式输入/输出标签——filter_complex 里不允许无标签的游离链路。
    const s = segments[0];
    return {
      videoChain: `[0:v]trim=start=${fmt(s.start)}:end=${fmt(s.end)},setpts=PTS-STARTPTS[vjc]`,
      audioChain: `[0:a]atrim=start=${fmt(s.start)}:end=${fmt(s.end)},asetpts=PTS-STARTPTS[ajc]`,
      vLabel: '[vjc]',
      aLabel: '[ajc]',
    };
  }

  const vParts: string[] = [];
  const aParts: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = segments[i];
    vParts.push(`[0:v]trim=start=${fmt(s.start)}:end=${fmt(s.end)},setpts=PTS-STARTPTS[v${i}]`);
    aParts.push(`[0:a]atrim=start=${fmt(s.start)}:end=${fmt(s.end)},asetpts=PTS-STARTPTS[a${i}]`);
  }
  const vIn = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
  const aIn = Array.from({ length: n }, (_, i) => `[a${i}]`).join('');
  vParts.push(`${vIn}concat=n=${n}:v=1:a=0[vjc]`);
  aParts.push(`${aIn}concat=n=${n}:v=0:a=1[ajc]`);

  return {
    videoChain: vParts.join(';'),
    audioChain: aParts.join(';'),
    vLabel: '[vjc]',
    aLabel: '[ajc]',
  };
}

/**
 * 把 cues 的时间轴从「原 clip 时间轴」映射到「剪后时间轴」。
 *
 * 跨越切口（被剪掉的停顿）的 cue 只保留落在保留区间内的部分；完全落在被剪区间的 cue 丢弃。
 * 不做这一步，烧录的字幕会整体错位。
 */
export function remapCuesForSegments(cues: SubtitleCue[], segments: KeepSegment[]): SubtitleCue[] {
  if (!Array.isArray(cues) || cues.length === 0) return [];
  if (!Array.isArray(segments) || segments.length === 0) return cues;

  // 每段保留区间在剪后时间轴上的起点偏移。
  const offsets: number[] = [];
  let acc = 0;
  for (const seg of segments) {
    offsets.push(acc);
    acc += seg.end - seg.start;
  }

  const out: SubtitleCue[] = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const s = Math.max(cue.start, seg.start);
      const e = Math.min(cue.end, seg.end);
      if (e - s <= 0.05) continue; // 与原区间的重叠过短，丢弃
      out.push({
        start: Number((offsets[i] + (s - seg.start)).toFixed(3)),
        end: Number((offsets[i] + (e - seg.start)).toFixed(3)),
        text: cue.text,
      });
    }
  }

  // 复现的片段可能因浮点误差微重叠，按 start 排序并压平单调性（ASS 需要时间递增）。
  out.sort((a, b) => a.start - b.start);
  return out;
}