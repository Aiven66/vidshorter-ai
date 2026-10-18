'use strict';

/**
 * YueCut · 直播/视频 → 带货切片候选 分析管线（纯函数，零 IO）
 *
 * 与高光 v2 同一套设计哲学，但评分轴换成直播带货团队可解释的「转化分」：
 *   开场吸引力 hook 30% + 价格清晰度 price 35% + 语义完整度 complete 35%
 *
 * 规则全部来自团队剪切规则库（粤语带货 v1），可解释、可调：
 *  - 商品介绍 → 价格权益 → 下单引导 的完整成交话术优先；
 *  - 必须匹配到商品库 SKU（无商品指向的闲聊剔除，可在规则里关闭）；
 *  - 报价与商品库价格冲突 → 自动转「待定」，绝不自动确认；
 *  - 转写稳定度低于阈值 → 标「待复核」（启发式，不伪装概率）。
 */

const {
  yueToWritten,
  extractPrices,
  hasHookAtStart,
  countHits,
  includesAny,
  transcriptionStability,
  HOOK_TERMS,
  DEMO_TERMS,
  OBJECTION_TERMS,
  TUTORIAL_TERMS,
  PRICE_BURST_TERMS,
  CTA_TERMS,
  FILLER_TERMS,
} = require('./yuecut-cantonese');
const { matchProduct, crossCheck, detectPackSize } = require('./yuecut-products');

const DEFAULT_RULES = {
  version: '1.3',
  profileId: 'yue-commerce',
  name: '粤语带货 · 高转化',
  prefs: {
    minLen: 20,
    maxLen: 60,
    targetLen: 34,
    minScore: 80,
    maxCandidates: 30,
    requireProduct: true,
    flagStabilityBelow: 85,
    preferCta: true,
  },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function normalizeRules(input) {
  const base = JSON.parse(JSON.stringify(DEFAULT_RULES));
  const r = input && typeof input === 'object' ? input : {};
  const p = r.prefs && typeof r.prefs === 'object' ? r.prefs : {};
  const num = (v, d, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, lo, hi) : d;
  };
  return {
    version: String(r.version || base.version),
    profileId: String(r.profileId || base.profileId),
    name: String(r.name || base.name),
    prefs: {
      minLen: num(p.minLen, base.prefs.minLen, 8, 120),
      maxLen: num(p.maxLen, base.prefs.maxLen, 15, 300),
      targetLen: num(p.targetLen, base.prefs.targetLen, 10, 200),
      minScore: num(p.minScore, base.prefs.minScore, 0, 100),
      maxCandidates: num(p.maxCandidates, base.prefs.maxCandidates, 1, 200),
      requireProduct: p.requireProduct !== false,
      flagStabilityBelow: num(p.flagStabilityBelow, base.prefs.flagStabilityBelow, 0, 100),
      preferCta: p.preferCta !== false,
    },
  };
}

function normalizeCues(cues) {
  return (Array.isArray(cues) ? cues : [])
    .filter((c) => c && Number.isFinite(Number(c.start)) && Number.isFinite(Number(c.end)) && String(c.text || '').trim())
    .map((c) => ({ start: Number(c.start), end: Number(c.end), text: String(c.text).trim() }))
    .sort((a, b) => a.start - b.start);
}

/** 区间桶信号峰值（{start,end,value} 结构，来自 local-signals）。 */
function rangePeak(buckets, start, end) {
  let peak = 0;
  for (const b of Array.isArray(buckets) ? buckets : []) {
    if (!b || !Number.isFinite(b.start) || !Number.isFinite(b.end)) continue;
    if (b.end < start || b.start > end) continue;
    const v = Number(b.value);
    if (Number.isFinite(v) && v > peak) peak = v;
  }
  return clamp(peak, 0, 1);
}

function joinText(cues) {
  return cues.map((c) => c.text.replace(/\s+/g, '')).join('');
}

/** 句末标点（含粤语常见句号/问号/感叹）。 */
const SENTENCE_END = /[。！？!?…]"?\s*$/;

/**
 * 构造候选滑窗：每个 cue 起点向右扩，直到 ≥ minLen，产出落在 [min,max] 的窗。
 * 右边界吸附到句末标点所在 cue（不越过 max）。
 */
function buildWindows(cues, prefs) {
  const windows = [];
  for (let i = 0; i < cues.length; i += 1) {
    let j = i;
    let endJ = i;
    while (j < cues.length) {
      const len = cues[j].end - cues[i].start;
      if (len >= prefs.minLen) { endJ = j; break; }
      j += 1;
    }
    if (j >= cues.length) break;
    // 在不超过 max 的前提下向右吸附句末边界
    let k = endJ;
    while (k + 1 < cues.length && cues[k + 1].end - cues[i].start <= prefs.maxLen) {
      k += 1;
      if (SENTENCE_END.test(cues[k].text)) { endJ = k; break; }
    }
    // 若吸附后仍短于 min（最后一窗），丢弃
    const len = cues[endJ].end - cues[i].start;
    if (len >= prefs.minLen && len <= prefs.maxLen + 2) windows.push({ i, j: endJ });
    // 步长：按 minLen/3 的时间跨度推进起点，避免近重复窗爆炸
    let next = i + 1;
    while (next < cues.length && cues[next].start - cues[i].start < prefs.minLen / 3) next += 1;
    i = next - 1;
  }
  return windows;
}

function tagWindow(text) {
  const tags = [];
  if (includesAny(text, PRICE_BURST_TERMS) && extractPrices(text).length) tags.push('price');
  if (includesAny(text, OBJECTION_TERMS)) tags.push('objection');
  if (includesAny(text, DEMO_TERMS)) tags.push('demo');
  if (includesAny(text, TUTORIAL_TERMS)) tags.push('tutorial');
  // 主标签优先级：价格爆点 > 顾虑解答 > 效果演示 > 使用教学
  const order = ['price', 'objection', 'demo', 'tutorial'];
  const primary = order.find((t) => tags.includes(t)) || 'talk';
  return { primary, tags };
}

/** 标题：取首条钩子句做本地模板裁剪（无模型，不编造未说过的话）。 */
function buildTitle(cuesIn, text) {
  const first = cuesIn[0] ? cuesIn[0].text.replace(/^[「『"']|[」』"']$/g, '') : text;
  const t = String(first).replace(/[。！？!?…，,、；;：:]+$/, '');
  // 按语义截 10-22 字，优先在逗号处断
  if (t.length <= 22) return t;
  const head = t.slice(0, 22);
  const cut = head.lastIndexOf('，');
  return (cut >= 10 ? head.slice(0, cut) : head) + '…';
}

function scoreWindow({ text, headText, cuesIn, signals, prefs, len, productHit, check }) {
  // ── 开场吸引力（0-100）──
  let hook = 0;
  if (hasHookAtStart(headText, 28)) hook += 42;
  hook += Math.min(20, countHits(headText, HOOK_TERMS) * 12);
  if (includesAny(headText, PRICE_BURST_TERMS) && extractPrices(headText).length) hook += 18;
  const loudHead = signals ? rangePeak(signals.loudness, cuesIn[0].start, cuesIn[0].start + 3) : 0;
  if (signals) hook += Math.round(loudHead * 20); // 有信号才加，无信号不扣分
  hook = clamp(hook, 0, 100);

  // ── 价格清晰度（0-100）──
  let price = 0;
  if (check.prices.length) price += 28;
  if (productHit) price += 30;
  if (check.status === 'matched') price += 42;
  if (check.status === 'conflict') price = Math.min(price, 38); // 报价冲突压分（并转待定）
  if (check.status === 'unmatched') price = Math.min(price, 45);
  price = clamp(price, 0, 100);

  // ── 语义完整度（0-100）──
  let complete = 0;
  const cta = countHits(text, CTA_TERMS);
  if (cta >= 1) complete += 28;
  if (cta >= 2) complete += 8;
  // 成交结构：商品 + 价格 + CTA 同段
  if (productHit && check.prices.length && cta >= 1) complete += 22;
  // 首尾句意完整
  if (SENTENCE_END.test(cuesIn[cuesIn.length - 1].text)) complete += 14;
  // 时长适配：越接近 targetLen 越高
  const dev = Math.abs(len - prefs.targetLen);
  complete += Math.round(clamp(1 - dev / prefs.targetLen, 0, 1) * 14);
  // 卖点词密度（每 10 字 ≥1 个带货词）
  const sellHits = countHits(text, [...PRICE_BURST_TERMS, ...DEMO_TERMS, ...TUTORIAL_TERMS]);
  const density = (sellHits * 10) / Math.max(10, text.length / 10);
  complete += Math.round(clamp(density, 0, 1) * 14);
  // 水词惩罚
  if (includesAny(text, FILLER_TERMS)) complete -= 10;
  complete = clamp(complete, 0, 100);

  const total = Math.round(hook * 0.3 + price * 0.35 + complete * 0.35);
  return {
    score: clamp(total, 0, 100),
    dimensions: { hook, price, complete },
  };
}

/**
 * 主入口：分析一条素材。
 * @returns {{candidates: Array, usedFallback: boolean, meta: object}}
 */
function analyzeMaterial(input = {}) {
  const rules = normalizeRules(input.rules);
  const prefs = rules.prefs;
  const cues = normalizeCues(input.cues);
  const products = Array.isArray(input.products) ? input.products : [];
  const signals = input.signals && typeof input.signals === 'object' ? input.signals : null;
  const duration = Number.isFinite(Number(input.duration)) && Number(input.duration) > 0
    ? Number(input.duration)
    : (cues.length ? cues[cues.length - 1].end : 0);

  if (!cues.length) {
    return { candidates: [], usedFallback: true, meta: { cueCount: 0, duration, rules: rules.version } };
  }

  const windows = buildWindows(cues, prefs);
  const scored = [];

  for (const w of windows) {
    const cuesIn = cues.slice(w.i, w.j + 1);
    const text = joinText(cuesIn);
    const start = cuesIn[0].start;
    const end = cuesIn[cuesIn.length - 1].end;
    const len = end - start;
    const headText = joinText(cuesIn.slice(0, 2));

    const productHit = matchProduct(text, products);
    const check = crossCheck(text, productHit ? productHit.product : null);
    if (prefs.requireProduct && !productHit) continue; // 无商品指向的闲聊/重复话术
    if (prefs.preferCta && !countHits(text, CTA_TERMS) && check.status !== 'matched') {
      // 既无下单引导又无完整价格话术 → 不是成交切片
      continue;
    }

    const { score, dimensions } = scoreWindow({
      text, headText, cuesIn, signals, prefs, len,
      productHit: productHit || null, check,
    });
    if (score < prefs.minScore) continue;

    const { primary, tags } = tagWindow(text);
    const pack = detectPackSize(text);
    // 转写稳定度：取窗内最低 cue 稳定度
    let stability = 100;
    for (const c of cuesIn) {
      stability = Math.min(stability, transcriptionStability(c.text, c.end - c.start));
    }
    const needReview = stability < prefs.flagStabilityBelow;
    const priceConflict = check.status === 'conflict';

    scored.push({
      start: round3(start),
      end: round3(end),
      duration: round3(len),
      score,
      dimensions,
      tag: primary,
      tags,
      title: buildTitle(cuesIn, text),
      quote: cuesIn
        .map((c) => c.text)
        .find((t2) => extractPrices(t2).length || includesAny(t2, HOOK_TERMS)) || cuesIn[0].text,
      transcriptYue: cuesIn.map((c) => c.text).join(''),
      transcriptZh: yueToWritten(text),
      product: productHit ? {
        id: productHit.product.id,
        sku: productHit.product.sku,
        name: productHit.product.name,
        spec: productHit.product.spec,
        price: productHit.product.price,
        unit: productHit.product.unit,
        matchHits: productHit.hits,
      } : null,
      prices: check.prices.map((p) => ({ amount: p.amount, raw: p.raw })),
      priceStatus: check.status,
      priceNote: check.reason,
      packSize: pack,
      stability,
      needReview,
      flags: [
        ...(priceConflict ? ['price-conflict'] : []),
        ...(needReview ? ['low-stability'] : []),
      ],
      status: priceConflict ? 'deferred' : 'pending',
      cues: cuesIn.map((c) => ({ start: round3(c.start), end: round3(c.end), text: c.text })),
    });
  }

  // 去重：与高分候选重叠超过较短窗 50% 则丢弃
  scored.sort((a, b) => b.score - a.score || b.duration - a.duration);
  const kept = [];
  for (const cand of scored) {
    const overlap = (other) => {
      const ov = Math.max(0, Math.min(cand.end, other.end) - Math.max(cand.start, other.start));
      const shorter = Math.min(cand.duration, other.duration);
      return shorter > 0 && ov / shorter >= 0.5;
    };
    if (kept.some(overlap)) continue;
    kept.push(cand);
  }

  const candidates = kept.slice(0, prefs.maxCandidates).map((c, i) => ({
    id: `cand_${String(i + 1).padStart(3, '0')}`,
    rank: i + 1,
    ...c,
  }));

  return {
    candidates,
    usedFallback: false,
    meta: {
      cueCount: cues.length,
      duration: round3(duration),
      windowCount: windows.length,
      rules: rules.version,
      matchedCount: candidates.filter((c) => c.product).length,
      conflictCount: candidates.filter((c) => c.priceStatus === 'conflict').length,
    },
  };
}

module.exports = {
  DEFAULT_RULES,
  normalizeRules,
  normalizeCues,
  buildWindows,
  rangePeak,
  tagWindow,
  buildTitle,
  scoreWindow,
  analyzeMaterial,
};
