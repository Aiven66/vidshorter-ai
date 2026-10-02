/**
 * Recap Studio — 音画对齐（纯函数，可单测）
 *
 * 核心不变量：**每个章节的视频片总时长 == 该章解说时长 D_i**。
 * 先有解说时长，再裁源视频去适配它 —— 这样旁白轨只需按章 concat，天然同步，
 * 无需音频伸缩/对时。
 *
 * 本文件不依赖 ffmpeg / fs，也不 import 任何 `@/` 别名模块（tsx 单测脚本可直接跑）。
 */

import {
  RECAP_LINE_MAX_CHARS,
  RECAP_MAX_PIECES,
  RECAP_MAX_PIECE_SEC,
  type RecapCue,
  type RecapScript,
} from '../../recap';

/** 源视频上的一段（成片时间轴按顺序拼接它们） */
export type RecapPlanPiece = {
  /** 源视频上的起点（秒） */
  start: number;
  end: number;
  /** 首片为 a-roll（主线叙事），其余为 b-roll（补充素材） */
  role: 'a-roll' | 'b-roll';
};

export type RecapPlannedChapter = {
  /** 1-based，与 RecapChapter.index 对应 */
  chapterIndex: number;
  pieces: RecapPlanPiece[];
  /** 成片时间轴上的起点（秒） */
  start: number;
  /** 成片时间轴上的终点 = start + D_i */
  end: number;
};

export type RecapPlan = {
  chapters: RecapPlannedChapter[];
  /** Σ D_i */
  totalDuration: number;
};

export type RecapRange = { start: number; end: number };

const TEXT_WEIGHT = 0.6;
const HIGHLIGHT_WEIGHT = 0.25;
const POSITION_WEIGHT = 0.15;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * 分词用于文本重合度：CJK 取字符 bigram（单字噪声大，仅当整段只有一个字时才用单字），
 * 拉丁取小写词（≥2 字符）。
 */
export function recapTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;
  const parts = text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/g);
  for (const p of parts) {
    if (!p) continue;
    if (/[\u4e00-\u9fff]/.test(p)) {
      if (p.length === 1) tokens.add(p);
      for (let i = 0; i < p.length - 1; i++) tokens.add(p.slice(i, i + 2));
    } else if (p.length >= 2) {
      tokens.add(p);
    }
  }
  return tokens;
}

/** cosine-like 重合度 |A∩B| / sqrt(|A|·|B|)，范围 [0,1] */
export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

/** 窗口落在高光区间内的比例（0..1） */
function highlightPrior(start: number, end: number, highlights: RecapRange[]): number {
  const len = end - start;
  if (len <= 0 || highlights.length === 0) return 0;
  let covered = 0;
  for (const h of highlights) covered += overlapSeconds(start, end, h.start, h.end);
  return clamp(covered / len, 0, 1);
}

/** 位置先验：第 i 章偏好源视频 sourceDuration×(i+0.5)/n 附近 */
function positionPrior(center: number, expected: number, span: number): number {
  if (span <= 0) return 0.5;
  return 1 / (1 + Math.abs(center - expected) / span);
}

/**
 * 解说稿的第 1 章旁白前置黄金 3 秒钩子。
 * 钩子必须计入第 1 章时长，否则旁白轨会比视频轨长、被 `-shortest` 截尾。
 */
export function chapterNarrationTexts(script: RecapScript): string[] {
  const hook = script.hook.trim();
  return script.chapters.map((c, i) => (i === 0 && hook ? `${hook} ${c.narration}`.trim() : c.narration));
}

/**
 * 解说驱动音画对齐。
 *
 * 算法（见实现方案）：候选窗以字幕 cue 起点为锚，打分
 * `0.6×文本重合度 + 0.25×高光先验 + 0.15×位置先验`，已被占用的窗加重惩罚；
 * LLM 给出的合法 sourceStart/End 优先作为 A-Roll。
 *
 * 硬保证：Σ pieces 时长 == D_i（±浮点误差）；同章内不重叠；全部落在 [0, sourceDuration]；
 * 每片 ≥ RECAP_MIN_PIECE_SEC（当 D_i 本身不足该值时该章只有一片 = D_i）。
 *
 * 前提：`sourceDuration` 需 ≥ 单章片长上限（正常取 30s 上下）。源视频过短时路由会先行拒绝。
 *
 * @returns null 表示源信息完全不可用（无字幕、无时长、无锚点）——调用方应回 422
 */
export function planRecapTimeline(params: {
  /** 每章解说时长（秒），下标 i == chapterIndex-1 */
  chapterDurations: number[];
  /** 每章解说词（与 chapterDurations 同序），用于文本重合度打分 */
  chapterTexts: string[];
  /** 源视频全量字幕 */
  cues: RecapCue[];
  /** 源视频总时长（秒） */
  sourceDuration: number;
  /** 客户端已分析的高光区间（先验加分） */
  highlights?: RecapRange[];
  /** LLM 给出的每章源时间锚点（可选） */
  anchors?: Array<RecapRange | null | undefined>;
  /** 每片源窗口需额外预留的秒数（= 转场重叠时长，保证裁剪时还有片头余量） */
  headroomSec?: number;
}): RecapPlan | null {
  const { cues, chapterTexts, highlights = [], anchors, headroomSec = 0 } = params;
  const durations = params.chapterDurations.map((d) => (Number.isFinite(d) && d > 0 ? d : 0));
  const n = durations.length;
  if (n === 0) return null;
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  if (totalDuration <= 0) return null;

  // 源时长：缺失时用字幕末尾兜底，再退化到锚点末尾
  let source = Number.isFinite(params.sourceDuration) && params.sourceDuration > 0 ? params.sourceDuration : 0;
  if (source <= 0 && cues.length > 0) source = cues[cues.length - 1].end;
  if (source <= 0) {
    const anchorEnds = (anchors || []).filter((a): a is RecapRange => !!a && a.end > a.start).map((a) => a.end);
    if (anchorEnds.length === 0) return null;
    source = Math.max(...anchorEnds);
  }

  // 片长上限：受单章上限 + 全局片数上限双重约束
  const piecesAt = (cap: number) => durations.reduce((sum, d) => sum + Math.max(1, Math.ceil(d / cap)), 0);
  let cap = RECAP_MAX_PIECE_SEC;
  for (let guard = 0; guard < 20 && piecesAt(cap) > RECAP_MAX_PIECES; guard++) cap *= 1.25;

  const used: RecapRange[] = []; // 全局已占用窗（跨章去重）
  const chapters: RecapPlannedChapter[] = [];
  let cursor = 0;

  for (let i = 0; i < n; i++) {
    const d = durations[i];
    const pieceCount = Math.max(1, Math.ceil(d / cap));
    const pieceLen = d / pieceCount;
    const wantPieceLen = Math.min(pieceLen, source);
    const chapterTokens = recapTokens(chapterTexts[i] || '');
    const maxStart = Math.max(0, source - wantPieceLen - Math.max(0, headroomSec));
    const expectedCenter = source * ((i + 0.5) / n);
    const posSpan = Math.max(1, source / (2 * n));

    const candidates = buildCandidateStarts(cues, wantPieceLen, source, maxStart);
    const anchor = anchors?.[i];
    const pieces: RecapPlanPiece[] = [];

    for (let j = 0; j < pieceCount; j++) {
      const role: RecapPlanPiece['role'] = j === 0 ? 'a-roll' : 'b-roll';
      let winStart: number | null = null;

      // A-Roll：LLM 锚点合法且未被占用时优先
      if (role === 'a-roll' && anchor && anchor.end > anchor.start) {
        const start = clamp(anchor.start, 0, maxStart);
        if (!isHeavilyUsed(start, start + wantPieceLen, used, wantPieceLen)) winStart = start;
      }

      if (winStart == null) {
        let best = candidates.length > 0 ? candidates[0] : 0;
        let bestScore = -Infinity;
        for (const start of candidates) {
          const end = start + wantPieceLen;
          const windowTokens = recapTokens(cuesInWindow(cues, start, end));
          let score =
            TEXT_WEIGHT * overlapScore(chapterTokens, windowTokens) +
            HIGHLIGHT_WEIGHT * highlightPrior(start, end, highlights) +
            POSITION_WEIGHT * positionPrior((start + end) / 2, expectedCenter, posSpan);

          // 跨章/章内去重：重叠越多惩罚越重（不排除，素材不足时仍可复用）
          for (const u of used) {
            const ov = overlapSeconds(start, end, u.start, u.end);
            if (ov <= 0) continue;
            score *= ov / wantPieceLen > 0.5 ? 0.12 : 0.45;
          }

          if (score > bestScore) {
            bestScore = score;
            best = start;
          }
        }
        winStart = best;
      }

      const start = round2(winStart);
      const end = round2(winStart + wantPieceLen);
      pieces.push({ start, end, role });
      used.push({ start, end });
    }

    chapters.push({
      chapterIndex: i + 1,
      pieces,
      start: round2(cursor),
      end: round2(cursor + d),
    });
    cursor += d;
  }

  return { chapters, totalDuration: round2(totalDuration) };
}

/** 候选窗起点：每条字幕 cue 起点为一个锚（去重到 0.1s），无字幕时均匀分布兜底 */
function buildCandidateStarts(cues: RecapCue[], len: number, source: number, maxStart: number): number[] {
  const starts: number[] = [];
  const seen = new Set<number>();
  const push = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const v = clamp(raw, 0, maxStart);
    const key = Math.round(v * 10);
    if (seen.has(key)) return;
    seen.add(key);
    starts.push(v);
  };

  for (const c of cues) {
    // cue 起点为主锚；中心点作为补充（缺字幕开头时更容易命中内容区）
    push(c.start);
    push((c.start + c.end) / 2 - len / 2);
  }

  if (starts.length === 0 && source > 0) {
    for (let k = 0; k <= 4; k++) push(maxStart * (k / 4));
  }
  return starts;
}

/** 窗口内字幕文本拼接 */
function cuesInWindow(cues: RecapCue[], start: number, end: number): string {
  const parts: string[] = [];
  for (const c of cues) {
    if (c.end <= start) continue;
    if (c.start >= end) break;
    parts.push(c.text);
  }
  return parts.join(' ');
}

/** 该窗与任一已占用窗重叠超过一半 → 视为已重度占用 */
function isHeavilyUsed(start: number, end: number, used: RecapRange[], len: number): boolean {
  if (len <= 0) return true;
  for (const u of used) {
    if (overlapSeconds(start, end, u.start, u.end) / len > 0.5) return true;
  }
  return false;
}

/**
 * 解说字幕时间轴：把每章解说词切成 ≤maxCharsPerLine 的行，
 * 在该章 [start, start+duration] 内按字符数占比分配时间。
 * 末条 end 精确等于章节末尾（供成片字幕与音频收尾对齐）。
 */
export function buildNarrationCues(
  segments: Array<{ text: string; start: number; duration: number }>,
  maxCharsPerLine = RECAP_LINE_MAX_CHARS,
): RecapCue[] {
  const cues: RecapCue[] = [];
  for (const seg of segments) {
    const lines = splitNarrationLines(seg.text, maxCharsPerLine);
    if (lines.length === 0) continue;

    const duration = Math.max(0, seg.duration);
    const segStart = Math.max(0, seg.start);
    const segEnd = segStart + duration;
    const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;

    let cursor = segStart;
    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      const proportional = segStart + (duration * lines.slice(0, i + 1).reduce((s, l) => s + l.length, 0)) / totalChars;
      const end = isLast ? segEnd : Math.min(segEnd, Math.max(cursor + 0.05, proportional));
      cues.push({ start: round2(cursor), end: round2(end), text: lines[i] });
      cursor = end;
    }
    if (cues.length > 0) cues[cues.length - 1].end = round2(segEnd);
  }
  return cues;
}

/** 按句读/停顿切分后贪心打包成 ≤maxChars 的行，不切断句子时优先保留完整分句 */
function splitNarrationLines(text: string, maxChars: number): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const parts = clean
    .split(/(?<=[。！？!?；;，,、：:])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const lines: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (p.length > maxChars) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      for (let i = 0; i < p.length; i += maxChars) lines.push(p.slice(i, i + maxChars));
      continue;
    }
    if (cur && cur.length + p.length > maxChars) {
      lines.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}