'use strict';

/**
 * P0-1 品牌套件 Brand Kit · 本地资产库（零依赖，JSON + 原子写）
 *
 * 存储：`userData/brand-kit.json`
 *   { version: 1, activeId: 'default', brands: [ Brand ] }
 * 素材：`userData/brand-kit-assets/`（Logo 等，拷贝自用户本地文件，不外传）
 *
 * Brand:
 *   {
 *     id, name,
 *     font,                                  // 系统自带字体优先，不打包/不分发
 *     primaryColor,                          // '#RRGGBB'，空串=不覆盖默认高亮色
 *     subtitle: { size, outline, background, highlight },
 *     intro:    { enabled, text, seconds },  // 片头文案 + 时长
 *     outro:    { enabled, text },           // 片尾 CTA
 *     logo:     { path, position, widthPct, opacity }  // 片头 Logo（非常驻，非水印）
 *   }
 *
 * 设计取舍：只落本机、零上传；normalize 逐字段容错（外部改坏也不抛，回落到默认）。
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_ID = 'default';
const VERSION = 1;

/** macOS 自带字体（不打包、不分发 → 零 License 风险）；UI 展示用，用户也可手填。 */
const SYSTEM_FONTS = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Heiti SC',
  'Songti SC',
  'STHeiti',
  'Kaiti SC',
  'Helvetica Neue',
  'Helvetica',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Menlo',
];

const SUB_SIZE_KEYS = ['small', 'medium', 'large'];
const OUTLINE_KEYS = ['none', 'light', 'bold'];
const BG_KEYS = ['none', 'bar'];
const HL_KEYS = ['yellow', 'cyan', 'pink', 'green', 'orange'];
const POS_KEYS = ['br', 'bl', 'tr', 'tl'];
const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** '#RRGGBB' 归一化；非法返回 fallback（默认空串=不覆盖）。 */
function normalizeHex(v, fallback = '') {
  const m = String(v == null ? '' : v).trim().match(HEX_RE);
  return m ? `#${m[1].toUpperCase()}` : fallback;
}

/** 逐字段容错归一化一个品牌。 */
function normalizeBrand(input, fallbackId) {
  const r = input && typeof input === 'object' ? input : {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const sub = r.subtitle && typeof r.subtitle === 'object' ? r.subtitle : {};
  const intro = r.intro && typeof r.intro === 'object' ? r.intro : {};
  const outro = r.outro && typeof r.outro === 'object' ? r.outro : {};
  const logo = r.logo && typeof r.logo === 'object' ? r.logo : {};

  return {
    id: str(r.id, 60) || fallbackId || `brand_${Date.now().toString(36)}`,
    name: str(r.name, 40) || '我的品牌',
    font: str(r.font, 60) || 'PingFang SC',
    primaryColor: normalizeHex(r.primaryColor, ''),
    subtitle: {
      size: SUB_SIZE_KEYS.includes(sub.size) ? sub.size : 'medium',
      outline: OUTLINE_KEYS.includes(sub.outline) ? sub.outline : 'bold',
      background: BG_KEYS.includes(sub.background) ? sub.background : 'bar',
      highlight: HL_KEYS.includes(sub.highlight) ? sub.highlight : 'yellow',
    },
    intro: {
      enabled: intro.enabled !== false,
      text: str(intro.text, 60),
      seconds: clampNum(intro.seconds, 1, 8, 3),
    },
    outro: {
      enabled: outro.enabled !== false,
      text: str(outro.text, 60),
    },
    logo: {
      path: str(logo.path, 400),
      position: POS_KEYS.includes(logo.position) ? logo.position : 'br',
      widthPct: clampNum(logo.widthPct, 4, 40, 14),
      opacity: clampNum(logo.opacity, 0.1, 1, 1),
    },
  };
}

function defaultBrand() {
  return normalizeBrand({ id: DEFAULT_ID, name: '我的品牌' }, DEFAULT_ID);
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/**
 * 品牌套件 store。
 * @param {{filePath:string, assetsDir:string}} opts
 */
function createBrandKitStore({ filePath, assetsDir }) {
  if (!filePath) throw new Error('brand-kit: filePath is required');
  const assets = assetsDir || path.join(path.dirname(filePath), 'brand-kit-assets');

  function readStore() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.brands)) {
        const brands = parsed.brands.map((b, i) => normalizeBrand(b, b && b.id ? b.id : `brand_${i}`));
        const activeId = brands.some((b) => b.id === parsed.activeId) ? parsed.activeId : (brands[0] ? brands[0].id : '');
        return { version: VERSION, activeId, brands };
      }
    } catch {}
    return { version: VERSION, activeId: '', brands: [] };
  }

  async function writeStore(store) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(2).toString('hex')}`;
    await fsp.writeFile(tmp, JSON.stringify({ version: VERSION, activeId: store.activeId, brands: store.brands }, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
  }

  /** 列表 + 当前激活品牌 + 可选字体。空库时返回一套默认品牌（不落盘，仅用于 UI 展示）。 */
  async function list() {
    const store = readStore();
    if (store.brands.length === 0) {
      const d = defaultBrand();
      return { brands: [d], activeId: d.id, fonts: SYSTEM_FONTS, empty: true };
    }
    return { brands: store.brands, activeId: store.activeId || store.brands[0].id, fonts: SYSTEM_FONTS, empty: false };
  }

  async function getActive() {
    const store = readStore();
    if (store.brands.length === 0) return defaultBrand();
    return store.brands.find((b) => b.id === store.activeId) || store.brands[0];
  }

  async function getById(id) {
    if (!id) return getActive();
    const store = readStore();
    return store.brands.find((b) => b.id === id) || null;
  }

  /** 幂等覆盖同 id；首套自动设为激活。 */
  async function save(input) {
    const store = readStore();
    const normalized = normalizeBrand(input, input && input.id);
    const idx = store.brands.findIndex((b) => b.id === normalized.id);
    if (idx >= 0) store.brands[idx] = normalized;
    else store.brands.push(normalized);
    if (!store.activeId) store.activeId = normalized.id;
    await writeStore(store);
    return { ok: true, brand: normalized };
  }

  async function remove(id) {
    const store = readStore();
    const next = store.brands.filter((b) => b.id !== id);
    // 不删到一套都不剩：保留最后一根稻草（品牌资产=切换成本，不允许自毁）
    if (next.length === 0) next.push(defaultBrand());
    store.brands = next;
    if (!store.brands.some((b) => b.id === store.activeId)) store.activeId = store.brands[0].id;
    await writeStore(store);
    return { ok: true, activeId: store.activeId, brands: store.brands };
  }

  async function setActive(id) {
    const store = readStore();
    if (!store.brands.some((b) => b.id === id)) return { ok: false };
    store.activeId = id;
    await writeStore(store);
    return { ok: true, activeId: id };
  }

  /**
   * 把用户选中的 Logo 拷贝进本地素材目录（不外传）。返回落库用的绝对路径。
   * 校验扩展名 + 文件存在 + 体积上限，失败抛结构化错误。
   */
  async function importLogo(srcPath) {
    const src = String(srcPath || '').trim();
    if (!src || !fs.existsSync(src)) {
      const e = new Error('Logo 文件不存在');
      e.code = 'LOGO_MISSING';
      throw e;
    }
    if (!IMAGE_EXT_RE.test(path.extname(src))) {
      const e = new Error('仅支持 PNG / JPG / WEBP / GIF / BMP');
      e.code = 'LOGO_BAD_FORMAT';
      throw e;
    }
    const st = await fsp.stat(src);
    if (st.size > 10 * 1024 * 1024) {
      const e = new Error('Logo 体积需小于 10MB');
      e.code = 'LOGO_TOO_LARGE';
      throw e;
    }
    await fsp.mkdir(assets, { recursive: true });
    const ext = path.extname(src).toLowerCase();
    const name = `logo_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}${ext}`;
    const dest = path.join(assets, name);
    await fsp.copyFile(src, dest);
    return { ok: true, path: dest };
  }

  return {
    filePath,
    assetsDir: assets,
    list,
    getActive,
    getById,
    save,
    remove,
    setActive,
    importLogo,
  };
}

module.exports = {
  createBrandKitStore,
  normalizeBrand,
  normalizeHex,
  defaultBrand,
  SYSTEM_FONTS,
  DEFAULT_ID,
};
