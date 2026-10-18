/**
 * highlight-v2 · 评分编排入口
 *
 * 统一三档引擎的输出：
 *   cloud-llm / local-llm：模型给 selections（只含 cueIds + rubric + 理由）
 *   rule：无 selections 时用纯规则滑窗初筛（prescreen.ts）
 *
 * 信号在本层完成「全片归一 → 区间聚合 → 跨族共振」，评分器只消费证据。
 * 纯函数、零 IO，可在 Node 单测 / Next 服务端 / 桌面端共用。
 */

import { type AlignOptions } from './align';
import { buildSignalIndex, collectRangeSignals, resonanceFamilies } from './signals';
import { scoreCandidates, type ScoreInput } from './scorer';
import { ruleBasedPreScreen } from './prescreen';
import {
  DEFAULT_CLIP_WINDOW,
  type Cue,
  type ReviewVerdict,
  type ScoredCandidate,
  type ScoringEngine,
  type Selection,
  type SignalPoint,
} from './types';

export interface PipelineOptions extends AlignOptions {
  /** 全片原始信号（未归一也可，管道内部做分位数归一）。 */
  signals?: SignalPoint[];
  /** 模型选段结果；为空时自动走规则档。 */
  selections?: Selection[];
  /** 与 selections 同序（或按 cueIds 匹配）的复评结果。 */
  reviews?: ReviewVerdict[];
  /** 显式指定引擎档；不传时按 selections 有无推断。 */
  engine?: ScoringEngine;
  desiredCount?: number;
  locale?: 'zh' | 'en';
  target?: number;
  min?: number;
  max?: number;
}

export interface PipelineResult {
  candidates: ScoredCandidate[];
  engine: ScoringEngine;
  /** 处理过程中的非阻断警告（模型引用缺失、规则档兜底等）。 */
  warnings: string[];
}

/**
 * 高光评分主入口。
 *
 * @param cues 逐字稿（必须带稳定 id）
 * @returns 候选按分数降序排列；下游渲染队列需要时间序时自行 sort by start。
 */
export function runHighlightPipeline(cues: Cue[], opts: PipelineOptions = {}): PipelineResult {
  const warnings: string[] = [];
  const win = {
    target: opts.target ?? DEFAULT_CLIP_WINDOW.target,
    min: opts.min ?? DEFAULT_CLIP_WINDOW.min,
    max: opts.max ?? DEFAULT_CLIP_WINDOW.max,
  };
  const desired = Math.max(1, Math.min(12, opts.desiredCount ?? 6));
  const locale = opts.locale ?? 'zh';

  if (cues.length === 0) {
    return { candidates: [], engine: 'rule', warnings: ['empty-cues'] };
  }

  const index = buildSignalIndex(opts.signals ?? [], cues);

  // 确定引擎档与选段输入。
  let engine: ScoringEngine = opts.engine ?? (opts.selections && opts.selections.length > 0 ? 'cloud-llm' : 'rule');
  let scoreInputs: ScoreInput[];

  if (opts.selections && opts.selections.length > 0) {
    const reviewByKey = new Map<string, ReviewVerdict>();
    for (const r of opts.reviews ?? []) reviewByKey.set(r.cueIds.join('|'), r);
    scoreInputs = opts.selections.map((selection) => {
      const review = reviewByKey.get(selection.cueIds.join('|'));
      return { selection, review, engine };
    });
  } else {
    engine = 'rule';
    const ruleSelections = ruleBasedPreScreen(cues, opts.signals ?? [], {
      target: win.target, min: win.min, max: win.max, count: desired, locale,
    });
    scoreInputs = ruleSelections.map((selection) => ({ selection, engine: 'rule' as const }));
    if (ruleSelections.length === 0) warnings.push('rule-prescreen-empty');
    else warnings.push('engine-fallback-rule');
  }

  const candidates = scoreCandidates(
    cues,
    scoreInputs,
    (start, end) => collectRangeSignals(index, start, end),
    (rangeSignals) => resonanceFamilies(rangeSignals).count,
    {
      shotBoundaries: opts.shotBoundaries,
      voiceSegments: opts.voiceSegments,
      snapRadius: opts.snapRadius,
      voicePad: opts.voicePad,
      window: win,
      locale,
    },
  );

  // 引用缺失统计（评分器已丢弃完全无效候选，这里仅告警）。
  const missing = candidates.filter((c) => c.signals.length === 0).length;
  if (missing > 0) warnings.push(`${missing} candidates without in-range signals`);

  return {
    // 返回全部去重后候选（分数降序）；条数采样由下游按 desiredClipCount 处理，
    // 与现有 video-job 的全片均匀采样策略保持同一处决策。
    candidates,
    engine,
    warnings,
  };
}
