/**
 * highlight-v2 · 信号采集与共振
 *
 * 信号在进入评分层之前必须完成两件事：
 *  1. 全片一致归一（分位数法，避免单个极值把全片压扁）；
 *  2. 按区间聚合（peak / mean / coverage），并统计跨族共振。
 *
 * 纯函数模块：不做音频解码、不跑模型——采集由桌面端 / 渲染管线完成，
 * 这里只消费已经采好的数值，因此 Web、Node 单测、桌面端可共用同一套逻辑。
 */

import {
  SIGNAL_ACTIVE,
  type Cue,
  type RangeSignal,
  type SignalFamily,
  type SignalKind,
  type SignalPoint,
} from './types';

/** kind → 信号族映射。新增信号种类时只需在此登记。 */
export const SIGNAL_META: Record<SignalKind, { family: SignalFamily }> = {
  loudness: { family: 'audio' },
  speechRate: { family: 'audio' },
  pause: { family: 'audio' },
  laughter: { family: 'audio' },
  cutDensity: { family: 'visual' },
  motion: { family: 'visual' },
  expression: { family: 'visual' },
  danmaku: { family: 'audience' },
  gift: { family: 'audience' },
  textHook: { family: 'text' },
};

export function signalFamily(kind: SignalKind): SignalFamily {
  return SIGNAL_META[kind].family;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** 分位数（输入会被排序复制；p 取 0..1）。 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] * (hi - idx) + sortedAsc[hi] * (idx - lo);
}

/**
 * 把一路原始采样鲁棒归一到 0..1：
 *  - 以全片 p5 / p95 为上下界（单个鼓点 / 单条刷屏弹幕不会压扁全片）；
 *  - 常量轨道（p95≈p5）退化为全 0，表示「该信号在本片没有区分度」；
 *  - 调用方也可以直接传入已在 0..1 的值（跳过归一，保持幂等）。
 */
export function normalizeTrack(points: SignalPoint[]): SignalPoint[] {
  if (points.length === 0) return [];
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const low = percentile(values, 0.05);
  const high = percentile(values, 0.95);
  const span = high - low;
  // 常量轨道（无论原始值多大）没有区分度：先于幂等分支归零，
  // 否则全片恒为 0.5 的轨道会被误判成「持续中等活跃」。
  if (span < 1e-6) return points.map((p) => ({ ...p, value: 0 }));
  // 已归一轨道幂等处理：全部落在 [0,1] 则原样返回。
  if (values[0] >= 0 && values[values.length - 1] <= 1) {
    return points.map((p) => ({ ...p, value: clamp01(p.value) }));
  }
  return points.map((p) => ({ ...p, value: clamp01((p.value - low) / span) }));
}

/** 多路信号一起归一，返回按 kind 分组的 Map。 */
export function normalizeAll(points: SignalPoint[]): Map<SignalKind, SignalPoint[]> {
  const byKind = new Map<SignalKind, SignalPoint[]>();
  for (const p of points) {
    const list = byKind.get(p.kind);
    if (list) list.push(p);
    else byKind.set(p.kind, [p]);
  }
  const out = new Map<SignalKind, SignalPoint[]>();
  for (const [kind, list] of byKind) out.set(kind, normalizeTrack(list));
  return out;
}

/** 聚合一路信号在 [start, end] 区间内的证据。空轨道返回 null。 */
export function aggregateRange(
  points: SignalPoint[] | undefined,
  kind: SignalKind,
  start: number,
  end: number,
): RangeSignal | null {
  if (!points || points.length === 0 || end <= start) return null;
  const inRange = points.filter((p) => p.t >= start && p.t <= end);
  if (inRange.length === 0) return null;
  let peak = 0;
  let sum = 0;
  let activeDur = 0;
  // 采样点视为对相邻采样间隔的中点分段，coverage 用时长近似而非点数占比。
  for (let i = 0; i < inRange.length; i += 1) {
    const cur = inRange[i];
    const prev = inRange[i - 1];
    const next = inRange[i + 1];
    const segStart = prev ? (prev.t + cur.t) / 2 : cur.t;
    const segEnd = next ? (cur.t + next.t) / 2 : cur.t;
    const seg = Math.max(0, Math.min(end, segEnd) - Math.max(start, segStart));
    peak = Math.max(peak, cur.value);
    sum += cur.value * seg;
    if (cur.value >= SIGNAL_ACTIVE) activeDur += seg;
  }
  const range = end - start;
  return {
    kind,
    family: signalFamily(kind),
    peak: clamp01(peak),
    mean: clamp01(range > 0 ? sum / range : 0),
    coverage: clamp01(range > 0 ? activeDur / range : 0),
  };
}

/**
 * 区间内活跃的独立信号族。
 * 「活跃」判定：该族至少一路信号的峰值 ≥ SIGNAL_ACTIVE。
 * 只有响度高（可能是 BGM）不算共振；响度 + 笑声 / 弹幕一起亮才是真爆点。
 */
export function resonanceFamilies(signals: RangeSignal[]): { families: SignalFamily[]; count: number } {
  const active = new Set<SignalFamily>();
  for (const s of signals) {
    if (s.peak >= SIGNAL_ACTIVE) active.add(s.family);
  }
  const families = [...active];
  return { families, count: families.length };
}

// ── 文本信号派生（零外部依赖，Web 规则档也能用）──────────────────────────────

const QUESTION_RE = /[?？]|\b(why|how|what|when|should|could|would|is|are|do|does|did)\b/i;
const NUMBER_RE = /\d/;
const EMPHASIS_WORDS = [
  'important', 'secret', 'best', 'worst', 'amazing', 'crazy', 'must', 'never', 'mistake',
  'actually', 'truth', 'shocking', 'surprising',
  '关键', '重点', '一定', '必须', '震惊', '竟然', '居然', '真相', '秘密', '秘诀', '绝招',
  '最好', '最差', '千万别', '没想到', '干货', '方法', '技巧',
];
const EMOTION_EMOJI_OR_TAG = /(笑|哭|怒|惊|泪|爽|燃|绝|哈哈哈|🔥|😂|😱|😲)/;

/**
 * 从 cues 派生 textHook 信号点（每个 cue 一个，值取该 cue 的钩子强度 0..1）。
 * 同时把 ASR 情绪标签（如 LAUGHTER/HAPPY）派生为对应信号点，方便无音频
 * 采集能力的 Web 链路也能参与部分共振。
 */
export function deriveSignalsFromCues(cues: Cue[]): SignalPoint[] {
  const out: SignalPoint[] = [];
  for (const cue of cues) {
    const mid = (cue.start + cue.end) / 2;
    const text = cue.text || '';
    let strength = 0;
    if (QUESTION_RE.test(text)) strength += 0.45;
    if (NUMBER_RE.test(text)) strength += 0.25;
    if (EMPHASIS_WORDS.some((w) => text.toLowerCase().includes(w.toLowerCase()))) strength += 0.35;
    if (EMOTION_EMOJI_OR_TAG.test(text)) strength += 0.3;
    if (strength > 0) {
      out.push({ t: mid, kind: 'textHook', value: Math.min(1, strength) });
    }
    const tag = (cue.emotion || '').toUpperCase();
    if (/LAUGHTER|HAPPY|SMILE|笑/.test(tag)) {
      out.push({ t: mid, kind: 'laughter', value: 0.8 });
    }
  }
  return out;
}

/**
 * 全片信号构建的便捷入口：采集侧原始信号 + cues 派生信号，统一归一。
 */
export function buildSignalIndex(rawSignals: SignalPoint[], cues: Cue[]): Map<SignalKind, SignalPoint[]> {
  return normalizeAll([...rawSignals, ...deriveSignalsFromCues(cues)]);
}

/** 汇总一个区间内所有可用信号的证据（按 kind 去重，保留峰值最强的一路）。 */
export function collectRangeSignals(
  index: Map<SignalKind, SignalPoint[]>,
  start: number,
  end: number,
): RangeSignal[] {
  const out: RangeSignal[] = [];
  for (const [kind, points] of index) {
    const agg = aggregateRange(points, kind, start, end);
    if (agg) out.push(agg);
  }
  return out.sort((a, b) => b.peak - a.peak);
}
