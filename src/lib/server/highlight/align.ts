/**
 * highlight-v2 · 句子 ID → 时间戳边界对齐
 *
 * 模型只输出 cueIds，所有时间戳在这里反查得到。这样：
 *  - 模型不可能幻觉出不存在的时间码；
 *  - 切点天然落在 cue（以及可选的词）边界上，不会切到半个词；
 *  - 可选的镜头边界吸附与人声尾音守卫进一步保证「画面不跳、尾音不吞」。
 *
 * 纯函数、零 IO。
 */

import { DEFAULT_CLIP_WINDOW, type Cue, type TimedWord } from './types';

/** 可选的物理边界输入（由采集侧提供；全部缺失时仍可按 cue 边界工作）。 */
export interface AlignOptions {
  /** TransNetV2 等检测到的镜头边界时间点（秒）。 */
  shotBoundaries?: number[];
  /** VAD 人声区间（秒）；切点会被拉回到人声之内，保护尾音。 */
  voiceSegments?: Array<{ start: number; end: number }>;
  /** 成片时长窗口。 */
  window?: { target: number; min: number; max: number };
  /** 镜头吸附半径（秒），默认 0.6。 */
  snapRadius?: number;
  /** 人声守卫余量（秒），默认 0.08。 */
  voicePad?: number;
}

export interface AlignedSpan {
  start: number;
  end: number;
  /** 实际覆盖到的 cues（可能因意群扩展 / 时长补齐而多于模型引用）。 */
  cues: Cue[];
  /** 模型引用但无法解析的 cue id（调用方应记录并降级处理）。 */
  missingCueIds: string[];
  /** 切点置信 0..1。 */
  boundaryConfidence: number;
  /** 各类守卫是否生效（便于回执与调试）。 */
  guards: {
    sentence: boolean;
    shot: boolean;
    voice: boolean;
    durationAdjusted: boolean;
  };
}

const SENTENCE_END_RE = /[。！？!?…；;]\s*"?\s*$/;

/** 建立 cue id → 数组下标。 */
function indexCues(cues: Cue[]): Map<string, number> {
  const map = new Map<string, number>();
  cues.forEach((c, i) => map.set(c.id, i));
  return map;
}

/** 从候选覆盖的 cues 中提取一句最适合作为「原话证据」的引用。 */
export function pickQuote(spanCues: Cue[]): string | undefined {
  const joined = spanCues.map((c) => (c.text || '').trim()).filter(Boolean).join(' ');
  if (!joined) return undefined;
  const clauses = joined
    .split(/(?<=[。！？!?…；;])|\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  const pool = clauses.length > 0 ? clauses : [joined];
  const scored = pool.map((c) => {
    let s = 0;
    if (c.length >= 12 && c.length <= 60) s += 2;
    if (/[?？]/.test(c)) s += 1;
    if (/\d/.test(c)) s += 0.5;
    if (/(secret|must|never|actually|关键|一定|必须|竟然|秘诀|真相|千万)/i.test(c)) s += 1;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s || a.c.length - b.c.length);
  const best = scored[0]?.c;
  return best ? (best.length > 70 ? `${best.slice(0, 70).trim()}…` : best) : undefined;
}

/**
 * 向前后扩展到完整意群：
 *  - 起点向前吃到「上一个 cue 以句末标点结束」之后；
 *  - 终点向后吃到「当前段最后一个 cue 自身以句末标点结束」。
 * 扩展受成片 max 时长约束，超出则停止，避免为了句意吞掉整段视频。
 */
function expandToSentence(
  cues: Cue[],
  firstIdx: number,
  lastIdx: number,
  maxSec: number,
): { first: number; last: number; hitStart: boolean; hitEnd: boolean } {
  let first = firstIdx;
  let last = lastIdx;
  let hitStart = false;
  let hitEnd = false;

  // 向前：当前首 cue 不是句意开头（即上一 cue 句末没有标点）时继续吞。
  while (first > 0) {
    const prev = cues[first - 1];
    if (!prev || SENTENCE_END_RE.test(prev.text || '')) {
      hitStart = true;
      break;
    }
    const candidateStart = prev.start;
    if (cues[last].end - candidateStart > maxSec) break;
    first -= 1;
  }
  if (first === 0) hitStart = firstIdx === 0;

  // 向后：末 cue 未以句末标点结束则继续吞。
  while (last < cues.length - 1) {
    const cur = cues[last];
    if (cur && SENTENCE_END_RE.test(cur.text || '')) {
      hitEnd = true;
      break;
    }
    const next = cues[last + 1];
    if (!next) break;
    if (next.end - cues[first].start > maxSec) break;
    last += 1;
  }
  if (SENTENCE_END_RE.test(cues[last]?.text || '')) hitEnd = true;

  return { first, last, hitStart, hitEnd };
}

/** 在半径内寻找最近的镜头边界；没有则返回原值。 */
function snapShot(t: number, boundaries: number[] | undefined, radius: number, forbidPast?: number): number {
  if (!boundaries || boundaries.length === 0) return t;
  let best = t;
  let bestDist = radius;
  for (const b of boundaries) {
    const d = Math.abs(b - t);
    if (d <= bestDist && (forbidPast === undefined || Math.abs(b - forbidPast) > 0.05)) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/** 尾音守卫：切点若落在某个人声区间外，向内吸附到最近的人声边缘。 */
function guardVoice(
  t: number,
  edge: 'start' | 'end',
  segments: Array<{ start: number; end: number }> | undefined,
  pad: number,
): { t: number; guarded: boolean } {
  if (!segments || segments.length === 0) return { t, guarded: false };
  for (const seg of segments) {
    if (t >= seg.start && t <= seg.end) return { t, guarded: true };
  }
  // 落在区间外：找最近边缘（start 边吸附到 seg.start+pad，end 边吸附到 seg.end-pad）。
  let nearest: { t: number; d: number } | null = null;
  for (const seg of segments) {
    const target = edge === 'start' ? seg.start + pad : seg.end - pad;
    const d = Math.abs(target - t);
    if (!nearest || d < nearest.d) nearest = { t: target, d };
  }
  if (nearest && nearest.d < 0.5) return { t: Math.max(0, nearest.t), guarded: true };
  return { t, guarded: false };
}

/**
 * 把一个选择（cueIds）对齐为可剪辑的时间区间。
 *
 * @returns 永远返回一个 span；模型引用全部无效时返回 null（调用方应丢弃该候选）。
 */
export function alignSelection(cues: Cue[], cueIds: string[], opts: AlignOptions = {}): AlignedSpan | null {
  const win = opts.window ?? { target: DEFAULT_CLIP_WINDOW.target, min: DEFAULT_CLIP_WINDOW.min, max: DEFAULT_CLIP_WINDOW.max };
  const snapRadius = opts.snapRadius ?? 0.6;
  const voicePad = opts.voicePad ?? 0.08;
  const index = indexCues(cues);

  const resolvedIdx: number[] = [];
  const missingCueIds: string[] = [];
  for (const id of cueIds) {
    const i = index.get(id);
    if (i === undefined) missingCueIds.push(id);
    else resolvedIdx.push(i);
  }
  if (resolvedIdx.length === 0) return null;

  const ordered = [...new Set(resolvedIdx)].sort((a, b) => a - b);
  let first = ordered[0];
  let last = ordered[ordered.length - 1];
  let durationAdjusted = false;

  // 1) 意群扩展（受 max 约束）。
  const sentence = expandToSentence(cues, first, last, win.max + 6);
  first = sentence.first;
  last = sentence.last;

  // 2) 不足 min：交替向两端补 cue，优先向后。
  let guard = 0;
  while (cues[last].end - cues[first].start < win.min && guard < 512) {
    const canBack = last < cues.length - 1;
    const canFront = first > 0;
    if (!canBack && !canFront) break;
    if (canBack && (guard % 2 === 0 || !canFront)) last += 1;
    else first -= 1;
    durationAdjusted = true;
    guard += 1;
  }

  // 3) 超过 max：从两端按更短端剔除。
  if (cues[last].end - cues[first].start > win.max) {
    let prevFirst = -1;
    let prevLast = -1;
    while ((prevFirst !== first || prevLast !== last) && cues[last].end - cues[first].start > win.max && last - first >= 1) {
      prevFirst = first;
      prevLast = last;
      const headDur = cues[first].end - cues[first].start;
      const tailDur = cues[last].end - cues[last].start;
      if (tailDur < headDur) last -= 1;
      else first += 1;
    }
    durationAdjusted = true;
  }

  let start = cues[first].start;
  let end = cues[last].end;

  // 4) 词边界微调（若有词级时间戳，切点已经天然在 cue 边缘，无需额外处理；
  //    此处仅把精度对齐到词边缘，防止 cue 端点与实际语音起止偏差）。
  const firstWords = cues[first].words;
  const lastWords = cues[last].words;
  if (firstWords && firstWords.length > 0) {
    const w = firstWords[0] as TimedWord;
    if (Number.isFinite(w.t)) start = Math.max(0, w.t);
  }
  if (lastWords && lastWords.length > 0) {
    const w = lastWords[lastWords.length - 1] as TimedWord;
    const wordEnd = Number.isFinite(w.dur) ? w.t + (w.dur ?? 0) : w.t;
    if (Number.isFinite(wordEnd)) end = Math.max(start + 1, wordEnd);
  }

  // 5) 人声尾音守卫（先做，向内收缩）。
  const voiceStart = guardVoice(start, 'start', opts.voiceSegments, voicePad);
  const voiceEnd = guardVoice(end, 'end', opts.voiceSegments, voicePad);
  start = voiceStart.t;
  end = voiceEnd.t;

  // 6) 镜头边界吸附（后做，只在不越过人声守卫结果 ±半径、且不反转区间时生效）。
  let shotHit = false;
  const snappedStart = snapShot(start, opts.shotBoundaries, snapRadius);
  const snappedEnd = snapShot(end, opts.shotBoundaries, snapRadius, snappedStart);
  if (snappedEnd - snappedStart >= win.min - 2 && snappedEnd - snappedStart <= win.max + 2) {
    if (Math.abs(snappedStart - start) > 1e-3 || Math.abs(snappedEnd - end) > 1e-3) shotHit = true;
    start = snappedStart;
    end = snappedEnd;
  }

  // 最终保护：区间合法且落在时长窗口附近。
  if (!(end - start >= 5)) return null;
  start = Math.max(0, start);
  end = Math.min(Number.POSITIVE_INFINITY, end);

  // 置信度：cue/词对齐基线 0.4，三项守卫各贡献。
  let confidence = 0.4;
  if (sentence.hitStart && sentence.hitEnd) confidence += 0.25;
  else if (sentence.hitStart || sentence.hitEnd) confidence += 0.12;
  if (shotHit) confidence += 0.2;
  if (voiceStart.guarded && voiceEnd.guarded) confidence += 0.15;
  else if (voiceStart.guarded || voiceEnd.guarded) confidence += 0.08;
  if (durationAdjusted) confidence -= 0.05;
  confidence = Math.max(0.3, Math.min(1, confidence));

  return {
    start: round3(start),
    end: round3(end),
    cues: cues.slice(first, last + 1),
    missingCueIds,
    boundaryConfidence: round3(confidence),
    guards: {
      sentence: sentence.hitStart && sentence.hitEnd,
      shot: shotHit,
      voice: voiceStart.guarded || voiceEnd.guarded,
      durationAdjusted,
    },
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
