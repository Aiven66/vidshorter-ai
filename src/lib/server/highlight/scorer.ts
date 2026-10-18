/**
 * highlight-v2 · 四维 10 分制评分器
 *
 * 评分链路：
 *   模型 rubric 初评
 *     → 信号证据融合（多族共振才加传播力；单信号不采信）
 *     → 结构分按时长适配 / 切点置信校正
 *     → （可选）严格评审二次盲评，分歧维保守取低
 *     → 加权合成绝对分
 *     → 同批百分位做 ±15% 校准（防批间漂移，但跨视频仍可比）
 *     → 档位 / 理由 / 引用 / 去重
 *
 * 纯函数、零 IO、零第三方依赖。
 */

import {
  ABSOLUTE_WEIGHT,
  BATCH_WEIGHT,
  DEFAULT_CLIP_WINDOW,
  HEAD_HOOK_SECONDS,
  RESONANCE_BONUS_PER_FAMILY,
  RESONANCE_MAX_FAMILIES,
  REVIEW_DISAGREEMENT,
  RUBRIC_DIMENSIONS,
  RUBRIC_WEIGHTS,
  TIER_THRESHOLDS,
  type Cue,
  type DimensionEvidence,
  type RangeSignal,
  type RecommendTier,
  type ReviewVerdict,
  type Rubric,
  type RubricDimension,
  type ScoredCandidate,
  type ScoringEngine,
  type Selection,
} from './types';
import { alignSelection, pickQuote, type AlignOptions, type AlignedSpan } from './align';

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const RUBRIC_ZERO: Rubric = { hook: 0, density: 0, structure: 0, virality: 0 };

/** 容错清洗模型给出的 rubric（缺字段 / 越界 / 非数字都安全回落）。 */
export function sanitizeRubric(input: unknown): Rubric {
  const r = (input && typeof input === 'object' ? input : {}) as Partial<Record<RubricDimension, unknown>>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clampScore(v) : 0);
  return {
    hook: num(r.hook),
    density: num(r.density),
    structure: num(r.structure),
    virality: num(r.virality),
  };
}

/** 时长适配度 0..1：越接近 target 越高，落在 min..max 内为满分带。 */
export function durationFit(
  lenSec: number,
  win: { target: number; min: number; max: number } = DEFAULT_CLIP_WINDOW,
): number {
  if (lenSec >= win.min && lenSec <= win.max) return 1;
  const dev = lenSec < win.min ? win.min - lenSec : lenSec - win.max;
  const scale = Math.max(win.min, win.target); // 偏离多少秒衰减到 0
  return clamp01(1 - dev / scale);
}

function findSignal(signals: RangeSignal[], kind: string): RangeSignal | undefined {
  return signals.find((s) => s.kind === kind);
}

/**
 * 信号证据融合，返回调整后的四维分与每维贡献说明。
 *
 * @param headSignals 成片切点后前 HEAD_HOOK_SECONDS 秒内的聚合信号（调用方按真实时间窗裁剪）
 */
function fuseSignals(
  base: Rubric,
  signals: RangeSignal[],
  headSignals: RangeSignal[],
  resonanceCount: number,
  span: AlignedSpan,
  win: { target: number; min: number; max: number },
  locale: 'zh' | 'en',
): { rubric: Rubric; contributions: Record<RubricDimension, string[]> } {
  const rubric: Rubric = { ...base };
  const c: Record<RubricDimension, string[]> = { hook: [], density: [], structure: [], virality: [] };
  const len = span.end - span.start;

  // ── hook：只看真正的开头 N 秒内文本钩子 / 响度 / 表情 / 画面峰值 ──
  const headPeak = headSignals
    .filter((s) => s.family === 'audio' || s.family === 'visual' || s.kind === 'textHook')
    .reduce((m, s) => Math.max(m, s.peak), 0);
  if (headPeak >= 0.62) {
    rubric.hook = clampScore(rubric.hook + 0.4);
    c.hook.push(
      locale === 'zh'
        ? `开头 ${HEAD_HOOK_SECONDS} 秒出现信号峰值（${(headPeak * 100) | 0}%）`
        : `Signal peak in first ${HEAD_HOOK_SECONDS}s (${(headPeak * 100) | 0}%)`,
    );
  }

  // ── density：文本钩子覆盖 + 笑声事件 ──
  const textHook = findSignal(signals, 'textHook');
  if (textHook && textHook.coverage >= 0.25) {
    rubric.density = clampScore(rubric.density + 0.3);
    c.density.push(locale === 'zh' ? '区间内钩子句覆盖充足' : 'High hook-sentence coverage');
  }
  const laughter = findSignal(signals, 'laughter');
  if (laughter && laughter.peak >= 0.62) {
    rubric.density = clampScore(rubric.density + 0.3);
    c.density.push(locale === 'zh' ? '含笑声 / 情绪高点' : 'Contains laughter / emotional peak');
  }

  // ── structure：时长适配占 30%，切点置信做 ±0.5 微调 ──
  const fit = durationFit(len, win);
  const before = rubric.structure;
  rubric.structure = clampScore(rubric.structure * 0.7 + fit * 10 * 0.3);
  rubric.structure = clampScore(rubric.structure + (span.boundaryConfidence - 0.65) * 0.8);
  if (Math.abs(rubric.structure - before) >= 0.15) {
    c.structure.push(
      locale === 'zh'
        ? `时长 ${Math.round(len)}s 适配度 ${(fit * 100) | 0}%，切点置信 ${(span.boundaryConfidence * 100) | 0}%`
        : `Duration ${Math.round(len)}s fit ${(fit * 100) | 0}%, cut confidence ${(span.boundaryConfidence * 100) | 0}%`,
    );
  }

  // ── virality：跨族共振才加分（核心防伪机制）──
  if (resonanceCount >= 2) {
    const bonus = Math.min(RESONANCE_MAX_FAMILIES, resonanceCount - 1) * RESONANCE_BONUS_PER_FAMILY;
    rubric.virality = clampScore(rubric.virality + bonus);
    c.virality.push(
      locale === 'zh'
        ? `${resonanceCount} 路独立信号族同时走高（共振 +${round1(bonus)}）`
        : `${resonanceCount} independent signal families resonate (+${round1(bonus)})`,
    );
  } else if (resonanceCount === 1) {
    c.virality.push(locale === 'zh' ? '仅单路信号活跃，可能是 BGM/噪声，不予共振加分' : 'Single signal only (possibly BGM/noise), no resonance bonus');
  }
  const gift = findSignal(signals, 'gift');
  if (gift && gift.peak >= 0.62) {
    rubric.virality = clampScore(rubric.virality + 0.3);
    c.virality.push(locale === 'zh' ? '含付费互动（礼物/SC），观众投票证据力强' : 'Paired interaction (gift/SC) — strong audience vote');
  }
  const danmaku = findSignal(signals, 'danmaku');
  if (danmaku && danmaku.peak >= 0.62) {
    c.virality.push(locale === 'zh' ? '弹幕密度峰值，观众实时高能段' : 'Danmaku density peak — live audience spike');
  }

  return { rubric, contributions: c };
}

/**
 * 复评门：逐维比对初评与盲评。
 * 分歧 > REVIEW_DISAGREEMENT 的维度保守取低并记录；总分级分歧由调用方标记。
 */
function mergeReview(
  fused: Rubric,
  review: Rubric,
  contributions: Record<RubricDimension, string[]>,
  locale: 'zh' | 'en',
): { rubric: Rubric; flagged: boolean; disagreements: RubricDimension[] } {
  const out: Rubric = { ...fused };
  const disagreements: RubricDimension[] = [];
  for (const dim of RUBRIC_DIMENSIONS) {
    const a = fused[dim];
    const b = review[dim];
    if (Math.abs(a - b) > REVIEW_DISAGREEMENT) {
      disagreements.push(dim);
      out[dim] = Math.min(a, b);
      contributions[dim].push(
        locale === 'zh'
          ? `复评分歧（初评 ${round1(a)} / 复评 ${round1(b)}），保守取低`
          : `Review disagreement (${round1(a)} / ${round1(b)}), conservative lower bound`,
      );
    } else {
      // 一致时取两者均值，噪声更小。
      out[dim] = (a + b) / 2;
    }
  }
  return { rubric: out, flagged: disagreements.length > 0, disagreements };
}

function weightedTotal(r: Rubric): number {
  return RUBRIC_DIMENSIONS.reduce((sum, d) => sum + r[d] * RUBRIC_WEIGHTS[d], 0);
}

function tierFor(score: number): RecommendTier {
  if (score >= TIER_THRESHOLDS.strong) return 'strong';
  if (score >= TIER_THRESHOLDS.recommend) return 'recommend';
  if (score >= TIER_THRESHOLDS.caution) return 'caution';
  return 'reject';
}

/** 生成用户可见的一句话理由：模型理由优先，否则按最强维度本地生成，并附原话证据。 */
function buildReason(
  modelReason: string | undefined,
  final: Rubric,
  quote: string | undefined,
  flagged: boolean,
  locale: 'zh' | 'en',
): string {
  const leads: Record<RubricDimension, { zh: string; en: string }> = {
    hook: { zh: '开场钩子强，能在前 3 秒抓住注意力', en: 'Strong opening hook that grabs attention in 3s' },
    density: { zh: '金句与信息点密集，情绪节奏到位', en: 'Dense quotable moments with emotional rhythm' },
    structure: { zh: '意群完整、节奏适配短视频完播', en: 'Complete thought with short-video completion rhythm' },
    virality: { zh: '话题性与观众共鸣信号强，具备传播潜力', en: 'Strong topical resonance and virality signals' },
  };
  const top = [...RUBRIC_DIMENSIONS].sort((a, b) => final[b] - final[a])[0];
  const lead = modelReason?.trim() || leads[top][locale];
  const tail = flagged
    ? locale === 'zh'
      ? '（复评有分歧，建议人工复核）'
      : ' (review disagreement — manual check advised)'
    : '';
  const evidence = quote ? (locale === 'zh' ? `：「${quote}」` : `: "${quote}"`) : '';
  return `${lead}${evidence}${tail}`;
}

/** 重叠去重：较短候选 ≥60% 时长落入较长候选时合并，保留高分者。 */
export function mergeOverlaps(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.rawScore - a.rawScore || a.start - b.start);
  const kept: ScoredCandidate[] = [];
  for (const cand of sorted) {
    const owner = kept.find((k) => {
      const overlap = Math.max(0, Math.min(k.end, cand.end) - Math.max(k.start, cand.start));
      const shorter = Math.min(k.end - k.start, cand.end - cand.start);
      return shorter > 0 && overlap / shorter >= 0.6;
    });
    if (!owner) {
      kept.push(cand);
    } else {
      // 合并标签与引用证据，分数维持高分者不变。
      owner.tags = [...new Set([...owner.tags, ...cand.tags])];
      if (!owner.quote && cand.quote) owner.quote = cand.quote;
    }
  }
  return kept;
}

export interface ScoreInput {
  selection: Selection;
  review?: ReviewVerdict;
  engine: ScoringEngine;
}

export interface ScoreOptions extends AlignOptions {
  locale?: 'zh' | 'en';
  window?: { target: number; min: number; max: number };
}

/**
 * 对一批选段完成全流程评分（不含同批校准前的分数是稳定绝对分）。
 * 返回按分数降序、已去重的候选；调用方可再按 start 排序用于渲染队列。
 */
export function scoreCandidates(
  cues: Cue[],
  inputs: ScoreInput[],
  rangeSignalsBySpan: (start: number, end: number) => RangeSignal[],
  resonanceBySpan: (signals: RangeSignal[]) => number,
  opts: ScoreOptions = {},
): ScoredCandidate[] {
  const locale = opts.locale ?? 'zh';
  const win = opts.window ?? { target: DEFAULT_CLIP_WINDOW.target, min: DEFAULT_CLIP_WINDOW.min, max: DEFAULT_CLIP_WINDOW.max };

  const prelim: Array<ScoredCandidate> = [];

  for (const input of inputs) {
    const sel = input.selection;
    if (!sel || !Array.isArray(sel.cueIds) || sel.cueIds.length === 0) continue;

    const span = alignSelection(cues, sel.cueIds, { ...opts, window: win });
    if (!span) continue; // 模型引用全部无效 → 丢弃，绝不伪造时间

    const signals = rangeSignalsBySpan(span.start, span.end);
    // hook 加分必须基于真实的开头窗口，不能用全区间峰值冒充。
    const headSignals = rangeSignalsBySpan(span.start, Math.min(span.end, span.start + HEAD_HOOK_SECONDS));
    const resonanceCount = resonanceBySpan(signals);
    const modelRubric = sanitizeRubric(sel.rubric);

    const dimensions: Record<RubricDimension, DimensionEvidence> = {
      hook: { dimension: 'hook', score: 0, modelScore: round1(modelRubric.hook), contributions: [] },
      density: { dimension: 'density', score: 0, modelScore: round1(modelRubric.density), contributions: [] },
      structure: { dimension: 'structure', score: 0, modelScore: round1(modelRubric.structure), contributions: [] },
      virality: { dimension: 'virality', score: 0, modelScore: round1(modelRubric.virality), contributions: [] },
    };

    const fused = fuseSignals(modelRubric, signals, headSignals, resonanceCount, span, win, locale);
    for (const d of RUBRIC_DIMENSIONS) dimensions[d].contributions = fused.contributions[d];

    let finalRubric = fused.rubric;
    let reviewFlagged = false;
    if (input.review) {
      const reviewRubric = sanitizeRubric(input.review.rubric);
      for (const d of RUBRIC_DIMENSIONS) dimensions[d].reviewScore = round1(reviewRubric[d]);
      const merged = mergeReview(
        finalRubric,
        reviewRubric,
        {
          hook: dimensions.hook.contributions, density: dimensions.density.contributions,
          structure: dimensions.structure.contributions, virality: dimensions.virality.contributions,
        },
        locale,
      );
      finalRubric = merged.rubric;
      reviewFlagged = merged.flagged;
    }

    for (const d of RUBRIC_DIMENSIONS) dimensions[d].score = round1(finalRubric[d]);

    const rawScore = round1(weightedTotal(finalRubric));
    const quote = pickQuote(span.cues);

    prelim.push({
      id: `hl_${span.cues[0]?.id ?? 'x'}_${span.cues[span.cues.length - 1]?.id ?? 'x'}`,
      cueIds: span.cues.map((c) => c.id),
      start: span.start,
      end: span.end,
      boundaryConfidence: span.boundaryConfidence,
      score: 0, // 同批校准后填入
      rawScore,
      percentile: 0,
      tier: 'caution',
      dimensions,
      reason: '',
      hookLine: sel.hookLine?.slice(0, 80),
      tags: Array.isArray(sel.tags) ? [...new Set(sel.tags.slice(0, 6))] : [],
      signals,
      resonanceFamilies: resonanceCount,
      reviewFlagged,
      quote,
      engine: input.engine,
    });
  }

  // 同批百分位校准：绝对分为主（85%），批内位置仅做 15% 微调。
  const byRaw = [...prelim].sort((a, b) => a.rawScore - b.rawScore);
  const n = byRaw.length;
  byRaw.forEach((cand, i) => {
    cand.percentile = n <= 1 ? 0.5 : i / (n - 1);
    const batchScore = 1 + cand.percentile * 9;
    const blended = cand.rawScore * ABSOLUTE_WEIGHT + batchScore * BATCH_WEIGHT;
    cand.rawScore = round1(blended);
    cand.score = Math.max(1, Math.min(10, Math.round(blended)));
    cand.tier = tierFor(cand.score);
  });

  // 理由需要最终 rubric 分（dimensions 已保留），用模型 reason + quote 拼装。
  for (const cand of prelim) {
    const finalRubric: Rubric = {
      hook: cand.dimensions.hook.score,
      density: cand.dimensions.density.score,
      structure: cand.dimensions.structure.score,
      virality: cand.dimensions.virality.score,
    };
    const source = inputs.find((x) => x.selection.cueIds.some((id) => cand.cueIds.includes(id)));
    cand.reason = buildReason(source?.selection.reason, finalRubric, cand.quote, cand.reviewFlagged, locale);
  }

  return mergeOverlaps(prelim).sort((a, b) => b.score - a.score || b.rawScore - a.rawScore || a.start - b.start);
}
