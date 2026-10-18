/**
 * P0-4 首片 5 分钟 Aha 引擎（纯逻辑层）。
 *
 * 目标：新用户上传 1 条视频 → 5 分钟内拿到一条**可直接发布的竖屏成片**
 * （默认高光预设 + 自动竖屏重构 + 逐词字幕 + 品牌套件默认样式 + 一键导出）。
 *
 * 设计取舍：
 *  1. 本模块只放**可单测的纯函数**：不碰 ffmpeg / ASR / 文件系统，
 *     编排（转写 → 打分 → 渲染）在 main.js 的 `local-aha:first-clip` 中完成。
 *  2. **零设置**：默认预设写死为竖屏 + 大字幕 + 粗剪 + 片头钩子；调用方无需传样式。
 *  3. **fail-open**：没有 ASR 也要能出片（退化为「开头 N 秒」，不报错、不空转），
 *     但会在结果里回带 `noTranscript` 供 UI 提示。
 *  4. **5 分钟预算可观测**：回带分阶段耗时与是否超预算，便于埋点与告警。
 */

/** 首片出片预算（秒）：命中「48h 内出片」aha moment 的硬指标。 */
const FIRST_CLIP_BUDGET_SEC = 300;

/** 首片默认预设：竖屏、大字幕、卡拉OK高亮、粗剪开、片头钩子开。零设置即可出片。 */
const DEFAULT_FIRST_CLIP_STYLE = Object.freeze({
  size: 'large',
  outline: 'bold',
  background: 'bar',
  highlight: 'yellow',
  jumpCut: true,
  hook: true,
  hookFirstSeconds: 3,
});

/** 首片目标/边界时长（秒）：太短信息不足，太长不适合竖屏首发。 */
const FIRST_CLIP_TARGET_SEC = 40;
const FIRST_CLIP_MIN_SEC = 12;
const FIRST_CLIP_MAX_SEC = 75;

/** 无转写时的兜底取片偏移（秒）：跳过极早期的片头/静场。 */
const FALLBACK_OFFSET_SEC = 2;

const CTA_TEXT = { zh: '关注我看更多', en: 'Follow for more' };

/** 语言检测：locale 以 zh 开头即视为中文（覆盖 zh / zh-Hant / zh-CN）。 */
function isZhLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('zh');
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function round3(v) {
  return Number((Number(v) || 0).toFixed(3));
}

/** 规范化一条高光 clip（来自 local-highlight-scorer）：非法返回 null。 */
function normalizeClip(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const start = Number(raw.start);
  const end = Number(raw.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    start: Math.max(0, start),
    end: Math.max(0, end),
    title: String(raw.title || '').trim(),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    reason: Array.isArray(raw.reason) ? raw.reason : [],
    asrCues: Array.isArray(raw.asrCues) ? raw.asrCues : [],
    words: Array.isArray(raw.words) ? raw.words : [],
  };
}

function normalizeTimeItems(list) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || typeof it !== 'object') continue;
    const start = Number(it.start);
    const end = Number(it.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const text = String(it.text == null ? '' : it.text);
    if (!text.trim()) continue;
    out.push({ start, end, text });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * 绝对时间轴 → 片段相对时间轴（渲染管线要求 clip 相对时间）。
 * 只保留落在 [clip.start, clip.end] 的交集，并按 clip.start 平移；
 * 越界的部分裁剪到窗口内。返回 `{cues, words}`，失败一律返回空数组。
 */
function relativizeCues(cues, words, clip) {
  const s = Number(clip && clip.start);
  const e = Number(clip && clip.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { cues: [], words: [] };
  const map = (list) => {
    const out = [];
    for (const it of normalizeTimeItems(list)) {
      const start = Math.max(it.start, s);
      const end = Math.min(it.end, e);
      if (end - start <= 0.05) continue;
      out.push({ start: round3(start - s), end: round3(end - s), text: it.text });
    }
    return out;
  };
  return { cues: map(cues), words: map(words) };
}

/**
 * 选首片：从打分器输出的高光列表里挑「最值得首发」的一条。
 * 排序依据：分数越高越优先；同分取更接近目标时长的（信息量足且不拖沓）。
 * @returns {object|null} 规范化后的 clip
 */
function pickFirstClip(clips) {
  const list = (Array.isArray(clips) ? clips : []).map(normalizeClip).filter(Boolean);
  if (list.length === 0) return null;
  const distance = (c) => Math.abs((c.end - c.start) - FIRST_CLIP_TARGET_SEC);
  list.sort((a, b) => (b.score - a.score) || (distance(a) - distance(b)) || (a.start - b.start));
  return list[0];
}

/** 把窗口收拢到首片边界内：不移动起点（保高光命中），只收尾/补尾。 */
function boundWindow(clip, sourceDuration) {
  const s = Math.max(0, clip.start);
  const dur = Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : 0;
  const maxEnd = dur > 0 ? dur : s + FIRST_CLIP_MAX_SEC;
  let e = Math.min(clip.end, maxEnd);
  if (e - s > FIRST_CLIP_MAX_SEC) e = s + FIRST_CLIP_MAX_SEC;
  if (e - s < FIRST_CLIP_MIN_SEC) e = clamp(s + FIRST_CLIP_MIN_SEC, s + 1, maxEnd);
  return { start: round3(s), end: round3(e) };
}

/**
 * 把「分数最高的高光」规范成一条可直接发布的渲染 spec。
 *
 * @param {object} opts
 * @param {Array}  opts.clips          打分器输出的高光列表
 * @param {number} opts.sourceDuration 源视频总时长（秒）
 * @param {string} [opts.locale]       语言（决定 CTA 文案）
 * @param {string} [opts.aspect]       '9:16' | '1:1' | '16:9'
 * @param {string} [opts.plan]         'free' | 'starter' | 'pro'
 * @param {string} [opts.quality]      ASR 档位，仅回带供 UI 展示
 * @param {boolean} [opts.usedFallback] 打分器是否回落到均匀取点
 * @returns {object} spec（ok=false 时带 code）
 */
function buildFirstClipSpec({
  clips,
  sourceDuration,
  locale,
  aspect = '9:16',
  plan = 'starter',
  quality = '',
  usedFallback = false,
} = {}) {
  const dur = Number(sourceDuration);
  const safeDur = Number.isFinite(dur) && dur > 0 ? dur : 0;
  const ctaText = isZhLocale(locale) ? CTA_TEXT.zh : CTA_TEXT.en;

  let picked = pickFirstClip(clips);
  let noTranscript = false;

  if (!picked) {
    // fail-open：没有转写/高光也要出片，退化为「开头一段可发布素材」。
    if (safeDur < 1) {
      return {
        ok: false,
        code: 'AHA_NO_WINDOW',
        message: '该视频时长过短，无法生成首片。',
      };
    }
    const start = Math.min(FALLBACK_OFFSET_SEC, Math.max(0, safeDur - 1));
    picked = {
      start,
      end: Math.min(safeDur, start + FIRST_CLIP_TARGET_SEC),
      title: '',
      score: 0,
      reason: [],
      asrCues: [],
      words: [],
    };
    noTranscript = true;
  }

  const clip = boundWindow(picked, safeDur);
  if (!(clip.end - clip.start >= 1)) {
    return { ok: false, code: 'AHA_NO_WINDOW', message: '无法从该视频定位首片片段。' };
  }
  const { cues, words } = relativizeCues(picked.asrCues, picked.words, clip);

  return {
    ok: true,
    clip,
    cues,
    words,
    title: picked.title || '',
    ctaText,
    style: { ...DEFAULT_FIRST_CLIP_STYLE },
    aspect: ['9:16', '1:1', '16:9'].includes(aspect) ? aspect : '9:16',
    plan,
    quality,
    score: picked.score,
    reason: picked.reason,
    noTranscript,
    usedFallback: usedFallback === true,
    candidateCount: (Array.isArray(clips) ? clips : []).length,
  };
}

/**
 * 计时报告：把各阶段耗时汇总，判断是否落在 5 分钟预算内。
 * @param {Record<string,number>} stageMs 各阶段耗时（毫秒）
 * @param {number} [budgetSec]
 */
function buildTimingReport(stageMs, budgetSec = FIRST_CLIP_BUDGET_SEC) {
  const stages = {};
  let total = 0;
  for (const [k, v] of Object.entries(stageMs && typeof stageMs === 'object' ? stageMs : {})) {
    const ms = Number(v);
    if (!Number.isFinite(ms) || ms < 0) continue;
    stages[k] = Math.round(ms);
    total += ms;
  }
  const budget = Number.isFinite(Number(budgetSec)) && Number(budgetSec) > 0
    ? Number(budgetSec)
    : FIRST_CLIP_BUDGET_SEC;
  const totalSec = Number((total / 1000).toFixed(1));
  return {
    stageMs: stages,
    totalMs: Math.round(total),
    totalSec,
    budgetSec: budget,
    withinBudget: totalSec <= budget,
  };
}

module.exports = {
  FIRST_CLIP_BUDGET_SEC,
  FIRST_CLIP_TARGET_SEC,
  FIRST_CLIP_MIN_SEC,
  FIRST_CLIP_MAX_SEC,
  DEFAULT_FIRST_CLIP_STYLE,
  relativizeCues,
  pickFirstClip,
  buildFirstClipSpec,
  buildTimingReport,
};
