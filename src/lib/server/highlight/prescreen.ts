/**
 * highlight-v2 · 纯规则初筛档（无任何第三方模型 API 时的兜底引擎）
 *
 * 适用场景：
 *  - Web 云端未配置 LLM Key，且任务未走桌面端；
 *  - 桌面端本地小模型不可用时的最后一档；
 * 保证「零 Key、零下载」也能产出带四维分和理由的候选，只是语义判断粒度
 * 不如 LLM。滑窗 + 信号证据 + NMS 去重，输出与模型档完全相同的 Selection 协议，
 * 下游评分链路无需分支。
 */

import {
  DEFAULT_CLIP_WINDOW,
  type Cue,
  type Rubric,
  type Selection,
  type SignalFamily,
  type SignalKind,
  type SignalPoint,
} from './types';
import { deriveSignalsFromCues, normalizeTrack, signalFamily } from './signals';

export interface PrescreenOptions {
  target?: number;
  min?: number;
  max?: number;
  /** 需要产出的候选条数，默认 6。 */
  count?: number;
  locale?: 'zh' | 'en';
}

interface Window {
  firstIdx: number;
  lastIdx: number;
  start: number;
  end: number;
  score: number;
  rubric: Rubric;
  tags: string[];
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(10, n));
}

/** 把信号点按区间求峰值（用于规则档的滑窗打分）。 */
function peakIn(points: SignalPoint[], start: number, end: number, headOnly = false): number {
  const s = headOnly ? start : start;
  const e = headOnly ? start + 3 : end;
  let peak = 0;
  for (const p of points) {
    if (p.t >= s && p.t <= e) peak = Math.max(peak, p.value);
  }
  return peak;
}

function coverageIn(points: SignalPoint[], start: number, end: number, threshold = 0.62): number {
  const inRange = points.filter((p) => p.t >= start && p.t <= end);
  if (inRange.length === 0) return 0;
  return inRange.filter((p) => p.value >= threshold).length / inRange.length;
}

const SENTENCE_END_RE = /[。！？!?…；;]\s*"?\s*$/;

/**
 * 规则初筛。返回 Selection[]（cueIds 引用，不含时间戳），交由评分器统一处理。
 */
export function ruleBasedPreScreen(
  cues: Cue[],
  rawSignals: SignalPoint[] = [],
  opts: PrescreenOptions = {},
): Selection[] {
  const win = {
    target: opts.target ?? DEFAULT_CLIP_WINDOW.target,
    min: opts.min ?? DEFAULT_CLIP_WINDOW.min,
    max: opts.max ?? DEFAULT_CLIP_WINDOW.max,
  };
  const desired = Math.max(1, opts.count ?? 6);
  const locale = opts.locale ?? 'zh';
  if (cues.length === 0) return [];

  // 信号统一按 kind 分路并归一（含 cues 派生信号）。
  const allSignals = [...rawSignals, ...deriveSignalsFromCues(cues)];
  const byKind = new Map<SignalKind, SignalPoint[]>();
  for (const p of allSignals) {
    const list = byKind.get(p.kind);
    if (list) list.push(p);
    else byKind.set(p.kind, [p]);
  }
  for (const [kind, list] of byKind) byKind.set(kind, normalizeTrack(list));

  // ── 滑窗：每个 cue 起点扩展到接近 target 时长 ──
  const windows: Window[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    let j = i;
    while (j < cues.length - 1 && cues[j].end - cues[i].start < win.min) j += 1;
    // 若扩展到下一句能更接近 target 且不超过 max，则继续。
    while (j < cues.length - 1) {
      const withNext = cues[j + 1].end - cues[i].start;
      const cur = cues[j].end - cues[i].start;
      if (withNext <= win.max && Math.abs(withNext - win.target) <= Math.abs(cur - win.target)) j += 1;
      else break;
    }
    const start = cues[i].start;
    const end = cues[j].end;
    const len = end - start;
    if (len < 8) continue;

    const text = cues.slice(i, j + 1).map((c) => c.text || '').join(' ');
    const tags: string[] = [];

    // hook：前 3 秒文本/音频/视觉峰值
    const textHead = peakIn(byKind.get('textHook') ?? [], start, end, true);
    const loudHead = peakIn(byKind.get('loudness') ?? [], start, end, true);
    const exprHead = peakIn(byKind.get('expression') ?? [], start, end, true);
    let hook = 3.5 + textHead * 4 + Math.max(loudHead, exprHead) * 2;
    if (textHead >= 0.62) tags.push(locale === 'zh' ? '钩子开场' : 'Hook opening');

    // density：钩子句覆盖 + 笑声 + 数字/提问
    const textCoverage = coverageIn(byKind.get('textHook') ?? [], start, end);
    const laughter = peakIn(byKind.get('laughter') ?? [], start, end);
    let density = 3.2 + textCoverage * 4 + laughter * 2;
    if (/\d/.test(text)) { density += 0.6; tags.push(locale === 'zh' ? '数据/步骤' : 'Data / steps'); }
    if (/[?？]/.test(text)) { density += 0.5; tags.push(locale === 'zh' ? '提问悬念' : 'Question'); }
    if (laughter >= 0.62) tags.push(locale === 'zh' ? '笑点' : 'Laughter');

    // structure：时长适配 + 句意完整
    const fit = len >= win.min && len <= win.max ? 1 : Math.max(0, 1 - Math.abs(len - win.target) / win.target);
    const completeHead = i === 0 || SENTENCE_END_RE.test(cues[i - 1]?.text || '');
    const completeTail = SENTENCE_END_RE.test(cues[j]?.text || '');
    let structure = 3 + fit * 5 + (completeHead ? 1 : 0) + (completeTail ? 1 : 0);

    // virality：跨族共振 + 观众硬信号
    const activeFamilies = new Set<SignalFamily>();
    for (const [kind, points] of byKind) {
      if (peakIn(points, start, end) >= 0.62) activeFamilies.add(signalFamily(kind));
    }
    let virality = 3 + Math.max(0, activeFamilies.size - 1) * 1.6;
    if (activeFamilies.has('audience')) {
      virality += 0.8;
      tags.push(locale === 'zh' ? '观众高能' : 'Audience spike');
    }
    if (activeFamilies.size >= 2) tags.push(locale === 'zh' ? '多信号共振' : 'Multi-signal resonance');

    const rubric: Rubric = {
      hook: clampScore(round1(hook)),
      density: clampScore(round1(density)),
      structure: clampScore(round1(structure)),
      virality: clampScore(round1(virality)),
    };
    const score = rubric.hook * 0.3 + rubric.density * 0.25 + rubric.structure * 0.2 + rubric.virality * 0.25;
    windows.push({ firstIdx: i, lastIdx: j, start, end, score, rubric, tags });
  }

  // ── NMS：贪心取最高分，抑制重叠 ≥50% 的窗 ──
  const ranked = windows.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked: Window[] = [];
  for (const w of ranked) {
    const conflict = picked.some((p) => {
      const overlap = Math.max(0, Math.min(p.end, w.end) - Math.max(p.start, w.start));
      return overlap / Math.min(p.end - p.start, w.end - w.start) >= 0.5;
    });
    if (!conflict) picked.push(w);
    if (picked.length >= desired) break;
  }
  // 无信号视频（如纯音乐/美食）也必须均匀给出候选：按时间均匀补点。
  if (picked.length < Math.min(desired, 4) && cues.length > 0) {
    const need = Math.min(desired, 4) - picked.length;
    for (let k = 1; k <= need; k += 1) {
      const idx = Math.floor((k * cues.length) / (need + 1));
      const w = windows.find((x) => x.firstIdx === idx) ?? windows[Math.min(idx, windows.length - 1)];
      if (w && !picked.includes(w)) picked.push(w);
    }
  }

  return picked
    .sort((a, b) => a.start - b.start)
    .map((w) => ({
      cueIds: cues.slice(w.firstIdx, w.lastIdx + 1).map((c) => c.id),
      rubric: w.rubric,
      reason:
        locale === 'zh'
          ? '规则引擎按文本钩子、信号共振与完播节奏综合选出'
          : 'Selected by the rule engine via text hooks, signal resonance and completion rhythm',
      tags: w.tags,
    }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
