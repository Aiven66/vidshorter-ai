/**
 * highlight-v2 · 信号协议与数据结构
 *
 * 设计原则（见 .trae/documents/v2-高光核心攻坚-产品调研与需求清单.md P0-2）：
 *  1. LLM / 本地小模型只负责「挑哪些句子」并引用句子 ID，**禁止输出时间码**——
 *     时间戳一律由逐字稿（cues）反查对齐，从机制上消除模型幻觉时间。
 *  2. 分数是 10 分制绝对质量分（四维 rubric），同批排名只做 ±15% 的校准，
 *     因此跨视频、跨批次分数可比；不再是旧 spreadScores 的纯位次分。
 *  3. 所有音频 / 画面 / 观众信号归一到 0..1，多信号族共振才给传播力加分，
 *     单一信号（例如只有响度高，可能只是 BGM）不采信。
 *
 * 本文件为纯类型 + 纯常量，无任何 IO / 第三方依赖，可被 Web 管线与桌面端复用。
 */

// ── 转写层 ──────────────────────────────────────────────────────────────────

/** 词级时间戳（可选；有词级时间戳时切点可以做到不切词）。 */
export interface TimedWord {
  /** 词开始秒。 */
  t: number;
  /** 词持续秒。 */
  dur?: number;
  text: string;
}

/**
 * 逐字稿句子 / cue。
 * id 是 LLM 选段协议里唯一允许被模型引用的句柄（如 "c12"）。
 */
export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
  /** 说话人标签（说话人分离可用时，如 0 / 1）。 */
  speaker?: number;
  /** 词级时间戳（可用时）。 */
  words?: TimedWord[];
  /** SenseVoice 等 ASR 给出的情绪 / 音频事件标签，如 HAPPY / LAUGHTER。 */
  emotion?: string;
}

// ── 信号层（全部归一 0..1）───────────────────────────────────────────────────

/** 信号族：互相独立的证据来源，跨族共振才可信。 */
export type SignalFamily =
  | 'audio' // 响度、语速、停顿、笑声/情绪（ASR 事件）
  | 'visual' // 镜头切换密度、运动峰值、表情峰值
  | 'audience' // 弹幕密度、礼物/SC/点赞互动
  | 'text'; // 文本启发式（提问、数字、强调词）——由 cues 派生，无需外部采集

export type SignalKind =
  | 'loudness'
  | 'speechRate'
  | 'pause'
  | 'laughter'
  | 'cutDensity'
  | 'motion'
  | 'expression'
  | 'danmaku'
  | 'gift'
  | 'textHook';

/** 逐秒（或任意时间点）采样的信号值，value 必须已归一到 0..1。 */
export interface SignalPoint {
  /** 时间点（秒）。 */
  t: number;
  kind: SignalKind;
  /** 0..1，采集侧负责归一（见 signals.ts 的 normalizeTrack）。 */
  value: number;
}

export interface SignalTrackMeta {
  kind: SignalKind;
  family: SignalFamily;
}

/** 区间内聚合后的信号证据。 */
export interface RangeSignal {
  kind: SignalKind;
  family: SignalFamily;
  /** 区间内峰值 0..1。 */
  peak: number;
  /** 区间内均值 0..1。 */
  mean: number;
  /** 信号活跃时长占区间比例 0..1（value ≥ activeThreshold）。 */
  coverage: number;
}

// ── 选段协议（模型层 → 评分层）──────────────────────────────────────────────

/** 四维 rubric，每一维 0..10，由模型或规则引擎给出。 */
export interface Rubric {
  /** 钩子力：开头 3 秒是否有提问 / 冲突 / 反常识 / 高能画面。 */
  hook: number;
  /** 信息/情绪密度：金句、观点、数据、笑点点位密度。 */
  density: number;
  /** 完播结构：完整意群、时长适配、无断句断词。 */
  structure: number;
  /** 传播力：话题相关、可引用、画面可看、观众热度。 */
  virality: number;
}

export type RubricDimension = keyof Rubric;

export const RUBRIC_DIMENSIONS: RubricDimension[] = ['hook', 'density', 'structure', 'virality'];

/**
 * 模型（云端 LLM / 本地 Qwen / 规则引擎）对一个候选的选段输出。
 *
 * 硬约束：**不允许出现 start/end/时间戳 字段**。模型只给 cueIds 与评分理由，
 * 时间由 align.ts 反查，防止模型编造不存在的时间码。
 */
export interface Selection {
  /** 引用的句子 id，必须按时间顺序、连续或属于同一意群。 */
  cueIds: string[];
  /** 模型给出的四维初评 0..10。 */
  rubric: Rubric;
  /** 一句话推荐理由（用户可见）。 */
  reason: string;
  /** 可烧上片头的悬念句 / 开场钩子文案。 */
  hookLine?: string;
  /** 模型自标的情绪 / 内容标签，如 金句 / 冲突 / 干货 / 笑点。 */
  tags?: string[];
}

/** 严格评审员的二次盲评（可选；缺失时不做复评门）。 */
export interface ReviewVerdict {
  cueIds: string[];
  rubric: Rubric;
  /** 评审一句话意见。 */
  comment?: string;
}

// ── 评分结果层 ──────────────────────────────────────────────────────────────

/** 推荐档位（面向用户展示）。 */
export type RecommendTier = 'strong' | 'recommend' | 'caution' | 'reject';

/** 单维的证据解释（前端 hover 可看分数构成）。 */
export interface DimensionEvidence {
  dimension: RubricDimension;
  /** 最终维度分 0..10。 */
  score: number;
  /** 模型初评（未做信号融合前）。 */
  modelScore?: number;
  /** 复评分（有复评时）。 */
  reviewScore?: number;
  /** 该维加/扣分的信号证据，人类可读。 */
  contributions: string[];
}

export interface ScoredCandidate {
  /** 稳定 id（同一 cues+selection 输入下幂等）。 */
  id: string;
  cueIds: string[];
  /** 由逐字稿反查得到的时间戳（秒）——全链路唯一可信时间来源。 */
  start: number;
  end: number;
  /** 切点置信 0..1：词边界/镜头吸附/人声守卫的综合结果。 */
  boundaryConfidence: number;
  /** 最终 10 分制总分（整数，1..10，跨视频可比）。 */
  score: number;
  /** 未取整的总分（排重与评估用）。 */
  rawScore: number;
  /** 同批百分位 0..1（调试 / 评估用）。 */
  percentile: number;
  tier: RecommendTier;
  /** 四维带证据明细。 */
  dimensions: Record<RubricDimension, DimensionEvidence>;
  reason: string;
  hookLine?: string;
  tags: string[];
  /** 区间内实际命中的信号证据。 */
  signals: RangeSignal[];
  /** 多信号族共振数（≥2 才给传播力加成）。 */
  resonanceFamilies: number;
  /** 复评分歧过大被保守降权。 */
  reviewFlagged: boolean;
  /** 引用的原话证据（从 cue 文本提取，非模型编造）。 */
  quote?: string;
  /** 引擎档：cloud-llm / local-llm / rule。 */
  engine: ScoringEngine;
}

export type ScoringEngine = 'cloud-llm' | 'local-llm' | 'rule';

// ── 配置 ────────────────────────────────────────────────────────────────────

/** rubric 四维合成总分的权重（和为 1）。 */
export const RUBRIC_WEIGHTS: Rubric = {
  hook: 0.3,
  density: 0.25,
  structure: 0.2,
  virality: 0.25,
};

/** 绝对 rubric 分与同批校准的混合比例：绝对质量占主导，保证跨视频可比。 */
export const ABSOLUTE_WEIGHT = 0.85;
export const BATCH_WEIGHT = 0.15;

/** 复评：单维分差超过该值视为分歧，保守取低并标记。 */
export const REVIEW_DISAGREEMENT = 2;

/** 档位阈值（最终整数分）。 */
export const TIER_THRESHOLDS: Record<Exclude<RecommendTier, 'reject'>, number> = {
  strong: 9,
  recommend: 7,
  caution: 6,
};

/** 成片时长目标（秒），与现有 21~35s Shorts 规格一致。 */
export const DEFAULT_CLIP_WINDOW = {
  target: 28,
  min: 21,
  max: 35,
} as const;

/** 信号被视为「活跃」的阈值。 */
export const SIGNAL_ACTIVE = 0.62;

/** 钩子判定窗口：只统计成片切点之后前 N 秒的信号峰值。 */
export const HEAD_HOOK_SECONDS = 3;

/** 传播力共振加成：每多一个独立信号族（封顶 3 族）的加分。 */
export const RESONANCE_BONUS_PER_FAMILY = 0.7;
export const RESONANCE_MAX_FAMILIES = 3;
