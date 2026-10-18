/**
 * highlight-v2 · LLM 选段 JSON 协议（云端 / 本地小模型共用）
 *
 * 契约铁律（与 types.ts Selection 注释一致）：
 *   1. 模型输入只看「编号 + 说话人 + 情绪标签 + 文本」，**不提供时间戳**，
 *      从源头避免模型抄时间、猜时间；
 *   2. 模型输出只允许引用 cueIds + rubric + 理由，解析时按白名单重建对象，
 *      任何越权的 start/end/start_time 字段被天然剥离；
 *   3. 时间码由 align.ts 用逐字稿反查，模型引用无效时评分链路直接丢弃候选。
 *
 * 本模块纯函数、零 IO；调用方用 llm.ts 的 openAiChat 发送 messages 后，
 * 把原始文本交回本模块解析。
 */

import { DEFAULT_CLIP_WINDOW } from './types';
import { sanitizeRubric } from './scorer';
import type { Cue, ReviewVerdict, Rubric, Selection } from './types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SelectionPromptOptions {
  locale?: 'zh' | 'en';
  desiredCount?: number;
  min?: number;
  max?: number;
  target?: number;
}

export interface ReviewPromptOptions {
  locale?: 'zh' | 'en';
}

// ── Prompt 构建 ─────────────────────────────────────────────────────────────

const RUBRIC_GUIDE_ZH = `四个评分维度（每项 0 到 10 的数字，可以带一位小数）：
- hook（钩子力）：开头 3 秒能否用提问、冲突、反常识结论或强情绪抓住人；平铺直叙给低分。
- density（信息/情绪密度）：金句、观点、数据、笑点是否密集，有没有废话和水词。
- structure（完播结构）：是不是一个完整意群，时长适合竖屏短视频，不会半句话切断。
- virality（传播力）：话题普适、可被引用转发、观众有评论冲动；纯个人流水账给低分。`;

const RUBRIC_GUIDE_EN = `Four scoring dimensions (0-10 number each, one decimal allowed):
- hook: can the first 3 seconds grab attention with a question, conflict, counterintuitive claim or strong emotion? Low score for flat intros.
- density: density of quotable lines, points, data, laughs; penalize filler.
- structure: one complete thought, vertical-shorts-friendly duration, no half-sentence cuts.
- virality: universal topic, quotable, comment-worthy; low score for personal rambling.`;

function systemPrompt(locale: 'zh' | 'en', mode: 'select' | 'review'): string {
  if (locale === 'en') {
    return mode === 'select'
      ? `You are a senior short-video editor. You pick highlight segments from a numbered transcript for 21-35 second vertical clips.
HARD RULES:
1. Reference sentences ONLY by their bracketed ids (e.g. "c12"). NEVER output timestamps, seconds, start, end, or time fields — they do not exist in your input.
2. Each selection's cueIds must be chronological and form ONE complete thought.
3. Score strictly with the rubric; be willing to give low scores.
4. Reply with ONE JSON object and nothing else. No markdown, no explanation outside JSON.`
      : `You are a strict, skeptical reviewer of highlight picks. You have NOT seen anyone else's scores. Judge independently from the transcript text.
HARD RULES:
1. Reference sentences ONLY by cueIds. NEVER output timestamps.
2. Score strictly; reject clips that do not stand alone as 21-35s vertical shorts.
3. Reply with ONE JSON object and nothing else.`;
  }
  return mode === 'select'
    ? `你是资深短视频剪辑师，从编号逐字稿中挑选适合剪成 21-35 秒竖屏短视频的高光意群。
硬性规则：
1. 只能用方括号编号引用句子（如 "c12"）。严禁输出时间戳、秒数、start、end 等任何时间字段——你的输入里根本没有时间。
2. 每条 cueIds 必须按编号顺序排列，且构成一个完整意群，不能半句话切断。
3. 严格按评分维度打分，敢于给低分，不要讨好。
4. 只输出一个 JSON 对象，不要 markdown 代码块，不要 JSON 以外的任何解释。`
    : `你是严格、挑剔的高光复评评委。你没有看过任何人的初评分，必须只依据逐字稿文本独立判断。
硬性规则：
1. 只能用 cueIds 引用句子，严禁输出时间戳。
2. 严格打分；不能独立成为 21-35 秒竖屏短视频的片段要果断给低分。
3. 只输出一个 JSON 对象，不要 JSON 以外的任何内容。`;
}

/** 把逐字稿渲染成编号行：刻意不含时间，只保留 id / 说话人 / 情绪 / 文本。 */
export function renderCueList(cues: Cue[]): string {
  return cues
    .map((c) => {
      const meta: string[] = [];
      if (c.speaker !== undefined) meta.push(`spk${c.speaker}`);
      if (c.emotion) meta.push(c.emotion);
      return `[${c.id}]${meta.length ? ` (${meta.join(', ')})` : ''} ${c.text}`;
    })
    .join('\n');
}

export function buildSelectionMessages(cues: Cue[], opts: SelectionPromptOptions = {}): ChatMessage[] {
  const locale = opts.locale ?? 'zh';
  const count = Math.max(1, Math.min(12, opts.desiredCount ?? 6));
  const min = opts.min ?? DEFAULT_CLIP_WINDOW.min;
  const max = opts.max ?? DEFAULT_CLIP_WINDOW.max;
  const zh = locale === 'zh';
  const user = `${zh ? '任务：从下面逐字稿挑出' : 'Task: pick '}${zh ? `${count} 个` : `${count}`}${zh ? '最值得剪成短视频的高光片段' : ' best highlight segments'}（${zh ? `成片时长 ${min}-${max} 秒` : `${min}-${max}s clips`}）。
${zh ? RUBRIC_GUIDE_ZH : RUBRIC_GUIDE_EN}

${zh ? '输出格式（字段名固定，cueIds 用编号，tags 最多 4 个）：' : 'Output format (fixed field names; cueIds are transcript ids; up to 4 tags):'}
{"selections":[{"cueIds":["c3","c4"],"rubric":{"hook":8.5,"density":8,"structure":7.5,"virality":7},"hookLine":"${zh ? '一句可上片头的悬念文案' : 'a hook caption line'}","reason":"${zh ? '一句话推荐理由' : 'one-sentence reason'}","tags":["${zh ? '金句' : 'quote'}"]}]}

${zh ? '逐字稿：' : 'Transcript:'}
${renderCueList(cues)}`;
  return [
    { role: 'system', content: systemPrompt(locale, 'select') },
    { role: 'user', content: user },
  ];
}

/**
 * 盲评消息：给复评模型看候选覆盖的原文，但**不给初评分 / 初评理由**，防止锚定。
 */
export function buildReviewMessages(cues: Cue[], selections: Selection[], opts: ReviewPromptOptions = {}): ChatMessage[] {
  const locale = opts.locale ?? 'zh';
  const zh = locale === 'zh';
  const cueById = new Map(cues.map((c) => [c.id, c]));
  const picks = selections
    .map((s, i) => {
      const lines = s.cueIds
        .map((id) => {
          const cue = cueById.get(id);
          return cue ? `[${cue.id}] ${cue.text}` : `[${id}] ?`;
        })
        .join('\n');
      return `#${i + 1}\n${lines}`;
    })
    .join('\n\n');
  const user = `${zh ? '对以下候选逐段独立复评（' : 'Independently review each candidate ('}${zh ? RUBRIC_GUIDE_ZH : RUBRIC_GUIDE_EN}

${zh ? '输出格式：' : 'Output format:'}
{"reviews":[{"cueIds":["c3","c4"],"rubric":{"hook":7,"density":7,"structure":7,"virality":6},"comment":"${zh ? '一句话复评意见' : 'one-sentence verdict'}"}]}

${zh ? '候选片段（只给文本，没有任何既有评分）：' : 'Candidates (text only; no prior scores given):'}
${picks}`;
  return [
    { role: 'system', content: systemPrompt(locale, 'review') },
    { role: 'user', content: user },
  ];
}

// ── 响应解析与容错 ──────────────────────────────────────────────────────────

export interface ParseWarnings {
  warnings: string[];
}
export interface ParsedSelections extends ParseWarnings {
  selections: Selection[];
}
export interface ParsedReviews extends ParseWarnings {
  reviews: ReviewVerdict[];
}

/** 计算截断 JSON 片段尚未闭合的括号（忽略字符串字面量内部），栈顶 = 最近未闭合。 */
function unclosedStack(text: string): string[] {
  const stack: string[] = [];
  let inStr = false;
  let escaped = false;
  for (const ch of text) {
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack;
}

/** 剥离 markdown 代码围栏、截取首个 JSON 对象、去尾随逗号；失败再做截尾修复。 */
function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('no-json-object');
  // 正常输出：截到最后一个 '}'；疑似 max_tokens 截断（结尾不是 '}'）时保留全长残片，
  // 交给下方括号栈修复，不能直接把残片切掉。
  const tail = text.search(/}\s*$/);
  const end = tail === -1 ? text.length - 1 : text.lastIndexOf('}');
  if (end <= start) throw new Error('no-json-object');
  text = text.slice(start, end + 1);

  const tryParse = (t: string): unknown => JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
  try {
    return tryParse(text);
  } catch {
    // 输出被 max_tokens 截断时，回退到上一个 '{' 边界，按括号栈顺序补全。
    for (let cut = text.lastIndexOf('{'); cut > 0; cut = text.lastIndexOf('{', cut - 1)) {
      const candidate = text.slice(0, cut);
      const closer = unclosedStack(candidate).reverse().join('');
      try {
        const parsed = tryParse(candidate + closer);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        // 半截键值仍非法，继续向前切。
      }
    }
    throw new Error('unparseable-json');
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function cleanString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanCueIds(v: unknown, known: Set<string> | undefined, warnings: string[]): string[] {
  if (!Array.isArray(v)) return [];
  const ids: string[] = [];
  for (const item of v) {
    const id = String(item ?? '').trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
    if (known && !known.has(id)) warnings.push(`unknown-cue:${id}`);
  }
  return ids;
}

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => cleanString(t, 20)).filter(Boolean).slice(0, 6);
}

function asRubric(v: unknown): Rubric {
  return sanitizeRubric(v);
}

/**
 * 解析选段响应。knownIds 非空时，引用不存在 cueId 只告警不剔除
 *（align 层负责最终裁决，保留部分有效引用的候选）。
 */
export function parseSelectionResponse(raw: string, knownIds?: string[]): ParsedSelections {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    return { selections: [], warnings: [`json-parse-failed:${(e as Error).message}`] };
  }
  const root = asRecord(parsed);
  const list = Array.isArray(root.selections) ? root.selections : [];
  if (list.length === 0) warnings.push('empty-selections');
  const known = knownIds ? new Set(knownIds) : undefined;

  const selections: Selection[] = [];
  list.forEach((item, i) => {
    const rec = asRecord(item);
    const cueIds = cleanCueIds(rec.cueIds, known, warnings);
    if (cueIds.length === 0) {
      warnings.push(`selection#${i}-dropped-no-cueids`);
      return;
    }
    // 白名单重建：模型即使越权返回 start/end 也不会进入对象。
    const selection: Selection = {
      cueIds,
      rubric: asRubric(rec.rubric),
      reason: cleanString(rec.reason, 200),
    };
    const hookLine = cleanString(rec.hookLine, 80);
    if (hookLine) selection.hookLine = hookLine;
    const tags = cleanTags(rec.tags);
    if (tags.length) selection.tags = tags;
    selections.push(selection);
  });
  return { selections, warnings };
}

/** 解析盲评响应，按 cueIds 与候选匹配。 */
export function parseReviewResponse(raw: string, knownIds?: string[]): ParsedReviews {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    return { reviews: [], warnings: [`json-parse-failed:${(e as Error).message}`] };
  }
  const root = asRecord(parsed);
  const list = Array.isArray(root.reviews) ? root.reviews : [];
  if (list.length === 0) warnings.push('empty-reviews');
  const known = knownIds ? new Set(knownIds) : undefined;

  const reviews: ReviewVerdict[] = [];
  list.forEach((item, i) => {
    const rec = asRecord(item);
    const cueIds = cleanCueIds(rec.cueIds, known, warnings);
    if (cueIds.length === 0) {
      warnings.push(`review#${i}-dropped-no-cueids`);
      return;
    }
    const review: ReviewVerdict = { cueIds, rubric: asRubric(rec.rubric) };
    const comment = cleanString(rec.comment, 200);
    if (comment) review.comment = comment;
    reviews.push(review);
  });
  return { reviews, warnings };
}
