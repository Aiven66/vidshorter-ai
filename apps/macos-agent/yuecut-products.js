'use strict';

/**
 * YueCut · 本地商品库与「话术 ↔ 商品 ↔ 价格」交叉核验
 *
 * 纯函数 + 一个 JSON 文件 store（路径由调用方注入，便于 node 单测）。
 * 不依赖任何网络 / 模型 API。
 *
 * 商品 Product：
 *   { id, sku, name, spec, price, unit, aliases:[], active }
 * 价格冲突是「待定」的硬规则来源：话术报价与商品库不一致时绝不自动确认。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { extractPrices } = require('./yuecut-cantonese');

/** 价格一致容忍（元）：口语报价与商品库价差 ≤ 该值视为一致。 */
const PRICE_TOLERANCE = 1.5;

function normalizeProduct(input, fallbackId) {
  const r = input && typeof input === 'object' ? input : {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };
  const aliases = Array.isArray(r.aliases)
    ? [...new Set(r.aliases.map((a) => str(a, 40)).filter(Boolean))]
    : [];
  return {
    id: str(r.id, 60) || fallbackId || `p_${Date.now().toString(36)}`,
    sku: str(r.sku, 40),
    name: str(r.name, 60),
    spec: str(r.spec, 60),
    price: num(r.price),
    unit: str(r.unit, 8) || '件',
    aliases,
    active: r.active !== false,
  };
}

/** 从名称/规格自动补别名：去掉量份后缀的核心词（双萃精华 / 补水面膜）。 */
function autoAliases(p) {
  const base = [p.name, p.spec].filter(Boolean);
  const cores = [];
  for (const b of base) {
    const core = b
      .replace(/\d+(?:\.\d+)?\s*(?:ml|mL|ML|g|G|片|片裝|片装|支|瓶|盒|組|组|套|袋|樽|條|条)/g, '')
      .replace(/[\s×x*]/g, '')
      .trim();
    if (core && core.length >= 2) cores.push(core);
    // 品类词
    const cat = b.match(/(精華|精华|面膜|面霜|乳液|爽膚水|爽肤水|防曬|防晒|口紅|口红|洗髮|洗发|沐浴露|精油|香水|粉底|氣墊|气垫)/);
    if (cat) cores.push(cat[1]);
  }
  return [...new Set(cores)];
}

/**
 * 在文本中匹配商品：命中名称 / 别名 / SKU 的字数打分，取最高分。
 * @returns {{product:object, score:number, hits:string[]} | null}
 */
function matchProduct(text, products) {
  const s = String(text || '');
  let best = null;
  for (const p of products || []) {
    if (!p || p.active === false) continue;
    const terms = [...new Set([p.name, p.spec, p.sku, ...(p.aliases || [])].filter(Boolean))];
    const hits = [];
    let score = 0;
    for (const term of terms) {
      if (!term || term.length < 2) continue;
      if (s.includes(term)) {
        hits.push(term);
        // 长词权重高（完整商品名 > 品类词）
        score += term.length >= 4 ? 3 : 2;
      }
    }
    // SKU 精确命中额外加权
    if (p.sku && s.includes(p.sku)) score += 4;
    if (score > 0 && (!best || score > best.score)) best = { product: p, score, hits };
  }
  return best;
}

/**
 * 价格交叉核验。
 * @param {string} text 片段话术
 * @param {object|null} product 匹配到的商品
 * @param {object} [opts]
 * @returns {{
 *   prices: Array, match: object|null, status:'matched'|'conflict'|'unmatched'|'none',
 *   unitAmount:number|null, expectedUnit:number|null, reason:string
 * }}
 */
function crossCheck(text, product, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : PRICE_TOLERANCE;
  const prices = extractPrices(text);
  if (!product) {
    return {
      prices, match: null, expectedUnit: null, unitAmount: null,
      status: prices.length ? 'unmatched' : 'none',
      reason: prices.length ? '話術有報價但未匹配到商品' : '',
    };
  }

  // 从话术里识别「N 件装 / 两支 / 一套」的份数。
  const pack = detectPackSize(text);
  const expectedUnit = product.price > 0 && pack > 1 ? Math.round((product.price / pack) * 100) / 100 : product.price;

  if (!prices.length) {
    return {
      prices, match: product, expectedUnit, unitAmount: null,
      status: 'none', reason: '商品已提及但話術未報價',
    };
  }

  // 话术里最低报价视为「到手价」（更高的通常是原价/专柜价口播）。
  const amounts = prices.map((p) => p.amount);
  const offer = Math.min(...amounts);
  const totalOk = Math.abs(offer - product.price) <= tolerance && product.price > 0;
  const unitOk = pack > 1 && expectedUnit > 0 && Math.abs(offer - expectedUnit) <= tolerance;

  if (totalOk || unitOk) {
    return {
      prices, match: product, expectedUnit,
      unitAmount: unitOk && !totalOk ? offer : null,
      status: 'matched', reason: '',
    };
  }

  return {
    prices, match: product, expectedUnit, unitAmount: null,
    status: 'conflict',
    reason: product.price > 0
      ? `話術報價 ${amounts.join('/')} 與商品庫 ¥${product.price}${pack > 1 ? `（${pack} 件裝折單 ¥${expectedUnit}）` : ''} 不一致`
      : '商品庫未維護價格，無法核驗',
  };
}

/** 识别份数：兩支裝 / 三支 / 一套 / 2瓶 / ×2。 */
function detectPackSize(text) {
  const s = String(text || '');
  const cnNum = { 兩: 2, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  let m;
  if ((m = s.match(/(\d+)\s*(?:支|瓶|盒|片|件|條|条|袋|樽|個|个|套)/))) return Math.min(20, Number(m[1]));
  if ((m = s.match(/×\s*(\d+)/))) return Math.min(20, Number(m[1]));
  if ((m = s.match(/([兩两三三四五六七八九十])\s*(?:支|瓶|盒|片|件|條|条|袋|樽|個|个)/))) return cnNum[m[1]] || 1;
  if (/一套|一套裝|套裝|套装/.test(s)) return 1;
  return 1;
}

// ── JSON 文件 store ─────────────────────────────────────────────────────────

function createProductStore({ filePath, seed = [] }) {
  if (!filePath) throw new Error('yuecut-products: filePath is required');

  function readAll() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && Array.isArray(parsed.products)) {
        return parsed.products.map((p, i) => normalizeProduct(p, p.id || `p_${i}`));
      }
    } catch {}
    return [];
  }

  async function ensureSeed() {
    let list = readAll();
    if (list.length === 0 && Array.isArray(seed) && seed.length) {
      list = seed.map((p, i) => normalizeProduct(p, p.id || `seed_${i + 1}`));
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify({ version: 1, products: list }, null, 2), 'utf8');
    }
    return list;
  }

  async function save(product) {
    const list = readAll();
    const normalized = normalizeProduct(product);
    const idx = list.findIndex((p) => p.id === normalized.id);
    if (idx >= 0) list[idx] = normalized;
    else list.push(normalized);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify({ version: 1, products: list }, null, 2), 'utf8');
    return normalized;
  }

  async function remove(id) {
    const list = readAll().filter((p) => p.id !== id);
    await fsp.writeFile(filePath, JSON.stringify({ version: 1, products: list }, null, 2), 'utf8');
    return { ok: true };
  }

  return {
    filePath,
    list: readAll,
    ensureSeed,
    save,
    remove,
  };
}

/** 首次使用的示例商品（可删除），让界面在自有商品录入前可体验完整核验链路。 */
const SEED_PRODUCTS = [
  {
    id: 'seed_jh032', sku: 'JH-032', name: '双萃精华', spec: '30ml × 2',
    price: 129, unit: '组',
    aliases: ['雙萃精華', '双萃精华', '精華', '两支裝', '兩支裝', '兩支', '双萃'],
  },
  {
    id: 'seed_mm020', sku: 'MM-020', name: '玻尿酸补水面膜', spec: '20 片',
    price: 59.9, unit: '盒',
    aliases: ['玻尿酸補水面膜', '补水面膜', '補水面膜', '面膜', '玻尿酸'],
  },
  {
    id: 'seed_mr050', sku: 'MR-050', name: '神经酰胺修护面霜', spec: '50g',
    price: 89, unit: '瓶',
    aliases: ['神經酰胺修護面霜', '神经酰胺修护面霜', '修護面霜', '修护面霜', '面霜', '神經酰胺', '神经酰胺'],
  },
];

module.exports = {
  PRICE_TOLERANCE,
  normalizeProduct,
  autoAliases,
  matchProduct,
  crossCheck,
  detectPackSize,
  createProductStore,
  SEED_PRODUCTS,
};
