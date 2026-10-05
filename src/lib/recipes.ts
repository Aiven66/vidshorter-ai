/**
 * 配方（Recipe）—— 把一套导出设置存成命名配方，一键复跑（P1-6）。
 *
 * 纯数据模块：类型 + 白名单归一化 + 列表 CRUD + 账号级 localStorage 存储。
 * **无 node / React / 服务端依赖**，前端与单测共用同一份口径。
 *
 * 商业定位：Recipe 是留存与转化的双引擎——
 *  - 留存：用户把调好的「风格」存下来，下次换素材一键复跑，回访理由明确；
 *  - 转化：免费档仅可保存 1 条，Starter+ 不限量（配方库本身成为付费台阶）。
 *
 * 存储：localStorage，key = `clipop_recipes:<userId>`，按账号隔离；
 * 配方只描述「怎么导出」，不含媒体来源，因此可在任意视频上复跑。
 */

import type { SubtitleStyle } from '@/lib/server/subtitles';

/** 免费档可保存的配方条数（Starter+ 不限量） */
export const RECIPE_LIMIT_FREE = 1;
/** 配方名长度上限 */
export const MAX_RECIPE_NAME = 40;

export type RecipeQuality = 'sd' | 'hd';
export type RecipeBgmMood = 'calm' | 'energetic' | 'warm';

/** 一条配方所固化的全部导出设置（与 video-processor 的设置项一一对应） */
export interface RecipeConfig {
  quality: RecipeQuality;
  exportVertical: boolean;
  exportSubtitles: boolean;
  exportJumpCut: boolean;
  exportVoiceover: boolean;
  voiceoverVoice: string;
  exportBgm: boolean;
  bgmMood: RecipeBgmMood;
  /** 原声音量百分比 0–100 */
  bgmOrigVol: number;
  exportKaraoke: boolean;
  subStyle: SubtitleStyle;
  /** 字幕翻译目标语言（'' = 原语言不翻译） */
  subLang: string;
  /** 批量导出模板 id（'' = 无模板） */
  exportTemplate: string;
  /** 场景预置 id（'' = 自定义） */
  scenario: string;
  /** 生成条数，0 = 系统推荐 */
  maxClips: number;
  /** 目标短片时长（秒），0 = 不限制 */
  targetDuration: number;
}

export interface Recipe {
  id: string;
  name: string;
  config: RecipeConfig;
  createdAt: number;
  updatedAt: number;
}

const QUALITY: readonly RecipeQuality[] = ['sd', 'hd'];
const BGM_MOOD: readonly RecipeBgmMood[] = ['calm', 'energetic', 'warm'];
const SUB_SIZE: readonly SubtitleStyle['size'][] = ['small', 'medium', 'large'];
const SUB_POSITION: readonly SubtitleStyle['position'][] = ['bottom', 'top'];
const SUB_OUTLINE: readonly SubtitleStyle['outline'][] = ['none', 'light', 'bold'];
const SUB_BACKGROUND: readonly SubtitleStyle['background'][] = ['none', 'box'];
const SUB_HIGHLIGHT: readonly SubtitleStyle['highlight'][] = ['yellow', 'cyan', 'pink', 'green', 'orange'];

export const DEFAULT_RECIPE_CONFIG: RecipeConfig = {
  quality: 'sd',
  exportVertical: false,
  exportSubtitles: true,
  exportJumpCut: false,
  exportVoiceover: false,
  voiceoverVoice: '',
  exportBgm: false,
  bgmMood: 'calm',
  bgmOrigVol: 70,
  exportKaraoke: false,
  subStyle: { size: 'medium', position: 'bottom', outline: 'bold', background: 'box', highlight: 'yellow' },
  subLang: '',
  exportTemplate: '',
  scenario: '',
  maxClips: 0,
  targetDuration: 0,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function asInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 可选短文本：非法回落 ''；合法则去首尾空白并截断（避免超长脏数据落库/localStorage） */
function asText(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function asSubtitleStyle(raw: unknown): SubtitleStyle {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    size: asEnum(s.size, SUB_SIZE, DEFAULT_RECIPE_CONFIG.subStyle.size),
    position: asEnum(s.position, SUB_POSITION, DEFAULT_RECIPE_CONFIG.subStyle.position),
    outline: asEnum(s.outline, SUB_OUTLINE, DEFAULT_RECIPE_CONFIG.subStyle.outline),
    background: asEnum(s.background, SUB_BACKGROUND, DEFAULT_RECIPE_CONFIG.subStyle.background),
    highlight: asEnum(s.highlight, SUB_HIGHLIGHT, DEFAULT_RECIPE_CONFIG.subStyle.highlight),
  };
}

/**
 * 从任意快照中提取一份**合法**的配方配置：逐字段白名单校验，非法值回落默认。
 * 绝不抛错——损坏的 localStorage 数据或旧版本配方都能安全降级。
 */
export function extractRecipeConfig(raw: unknown): RecipeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    quality: asEnum(r.quality, QUALITY, DEFAULT_RECIPE_CONFIG.quality),
    exportVertical: asBool(r.exportVertical, DEFAULT_RECIPE_CONFIG.exportVertical),
    exportSubtitles: asBool(r.exportSubtitles, DEFAULT_RECIPE_CONFIG.exportSubtitles),
    exportJumpCut: asBool(r.exportJumpCut, DEFAULT_RECIPE_CONFIG.exportJumpCut),
    exportVoiceover: asBool(r.exportVoiceover, DEFAULT_RECIPE_CONFIG.exportVoiceover),
    voiceoverVoice: asText(r.voiceoverVoice, 60),
    exportBgm: asBool(r.exportBgm, DEFAULT_RECIPE_CONFIG.exportBgm),
    bgmMood: asEnum(r.bgmMood, BGM_MOOD, DEFAULT_RECIPE_CONFIG.bgmMood),
    bgmOrigVol: asInt(r.bgmOrigVol, DEFAULT_RECIPE_CONFIG.bgmOrigVol, 0, 100),
    exportKaraoke: asBool(r.exportKaraoke, DEFAULT_RECIPE_CONFIG.exportKaraoke),
    subStyle: asSubtitleStyle(r.subStyle),
    subLang: asText(r.subLang, 20),
    exportTemplate: asText(r.exportTemplate, 40),
    scenario: asText(r.scenario, 40),
    maxClips: asInt(r.maxClips, DEFAULT_RECIPE_CONFIG.maxClips, 0, 50),
    targetDuration: asInt(r.targetDuration, DEFAULT_RECIPE_CONFIG.targetDuration, 0, 600),
  };
}

/** 归一化配方名：合并空白、截断、去掉首尾；可能返回 ''（由调用方决定是否报错） */
export function normalizeRecipeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.replace(/\s+/g, ' ').trim();
  return s.length > MAX_RECIPE_NAME ? s.slice(0, MAX_RECIPE_NAME) : s;
}

/** 单条配方归一化：id/name 缺失或非法 → null（丢弃而不是造脏数据） */
export function sanitizeRecipe(raw: unknown): Recipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const name = normalizeRecipeName(r.name);
  if (!id || !name) return null;
  const createdAt = asInt(r.createdAt, 0, 0, Number.MAX_SAFE_INTEGER);
  const updatedAt = asInt(r.updatedAt, createdAt, 0, Number.MAX_SAFE_INTEGER);
  return { id, name, config: extractRecipeConfig(r.config), createdAt, updatedAt };
}

/**
 * 解析配方列表（接受 JSON 字符串或原始数组）：
 * 非法输入 → []；逐条归一化；按 id 去重（保留首次出现）；按 updatedAt 降序。
 */
export function parseRecipeList(raw: unknown): Recipe[] {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const item of data) {
    const recipe = sanitizeRecipe(item);
    if (!recipe || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    out.push(recipe);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function serializeRecipeList(list: Recipe[]): string {
  return JSON.stringify(list);
}

/** 生成配方 id：优先 crypto.randomUUID，不可用时回落时间戳 + 随机串 */
export function newRecipeId(): string {
  try {
    const c = typeof crypto !== 'undefined' ? crypto : undefined;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* 忽略：回落 */
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 用当前设置创建一条配方（id/时间可注入，便于测试确定性） */
export function createRecipe(
  name: unknown,
  config: unknown,
  opts?: { id?: string; now?: number },
): Recipe {
  const now = opts?.now ?? Date.now();
  return {
    id: opts?.id ?? newRecipeId(),
    name: normalizeRecipeName(name) || 'Recipe',
    config: extractRecipeConfig(config),
    createdAt: now,
    updatedAt: now,
  };
}

/** 新增或按 id 覆盖，返回新数组（不改原数组）；最新的排最前 */
export function upsertRecipe(list: Recipe[], recipe: Recipe): Recipe[] {
  const rest = list.filter((r) => r.id !== recipe.id);
  return [recipe, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeRecipe(list: Recipe[], id: string): Recipe[] {
  return list.filter((r) => r.id !== id);
}

/** 免费档上限；Starter+/admin 不限量（Infinity） */
export function recipeLimitForPlan(plan: string | null | undefined, isAdmin = false): number {
  if (isAdmin) return Infinity;
  return plan === 'starter' || plan === 'pro' ? Infinity : RECIPE_LIMIT_FREE;
}

export function canAddRecipe(
  plan: string | null | undefined,
  count: number,
  isAdmin = false,
): boolean {
  return Math.max(0, count) < recipeLimitForPlan(plan, isAdmin);
}

// ─────────────────────────────────────────────────────────────────────────────
// 账号级存储（localStorage；SSR / 无账号 → 空，绝不抛错）
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'clipop_recipes:';

export function recipesStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadRecipes(userId: string | null | undefined): Recipe[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    return parseRecipeList(window.localStorage.getItem(recipesStorageKey(userId)));
  } catch {
    return [];
  }
}

/** 写入：返回是否成功（配额/隐私模式失败返回 false，调用方据此提示，不静默丢数据） */
export function saveRecipes(userId: string | null | undefined, list: Recipe[]): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(recipesStorageKey(userId), serializeRecipeList(list));
    return true;
  } catch {
    return false;
  }
}
