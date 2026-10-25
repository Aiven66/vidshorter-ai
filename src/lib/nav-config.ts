/**
 * 前台左侧菜单栏配置（管理后台可改）——client / server 共用，零依赖。
 *
 * 仅描述「顺序 + 显隐 + NEW 徽标」，不 import next / react / supabase，保证可在任意环境使用。
 * 存储位置与读取逻辑见 `src/lib/server/site-config.ts`（私有桶 clipop-config）。
 */

export type NavKey =
  | 'home'
  | 'clips'
  | 'tiktokRemix'
  | 'inviteFriends'
  | 'shorts'
  | 'notes'
  | 'tokpure'
  | 'blog'
  | 'pricing'
  | 'about'
  | 'download'
  | 'news'
  | 'article'
  | 'digitalHumanLive'
  | 'aiTools'
  | 'podcast'
  | 'localEngine'
  | 'aiDubbing'
  | 'aiVideo';

export interface NavConfig {
  /** 菜单展示顺序（可含被隐藏的 key，隐藏仅在渲染时过滤） */
  order: NavKey[];
  /** 需要隐藏的入口 */
  hidden: NavKey[];
  /**
   * 需要在入口右侧展示「NEW」徽标的入口（管理后台可配置）。
   * 缺省（存储里没有该字段）时回落 DEFAULT_NAV_CONFIG.badges，保证老配置升级后
   * 老菜单的 NEW 标识不丢；显式存了空数组则代表「一个都不显示」。
   */
  badges: NavKey[];
}

/** 管理后台展示用名称；中文沿用 app-shell 的 fallback 文案。 */
export const NAV_LABELS: Record<NavKey, { zh: string; en: string }> = {
  home: { zh: '首页', en: 'Home' },
  aiVideo: { zh: 'AI 成片', en: 'AI Video' },
  clips: { zh: '高光剪辑', en: 'Video Clips' },
  tiktokRemix: { zh: 'TikTok 二创', en: 'TikTok Remix' },
  inviteFriends: { zh: '邀请好友', en: 'Invite Friends' },
  shorts: { zh: 'Shorts 成片', en: 'Shorts' },
  notes: { zh: '高光笔记', en: 'Video Notes' },
  tokpure: { zh: 'AI 批量剪辑', en: 'AI Batch Editor' },
  digitalHumanLive: { zh: '数字人带货短视频', en: 'Live Digital Human' },
  news: { zh: '资讯视频', en: 'News Video' },
  article: { zh: '文章转视频', en: 'Article to Video' },
  podcast: { zh: 'AI播客', en: 'AI Podcast' },
  aiTools: { zh: 'AI 工具箱', en: 'AI Tools' },
  localEngine: { zh: '本地引擎', en: 'Local Engine' },
  aiDubbing: { zh: 'AI多语转换', en: 'AI Dubbing' },
  blog: { zh: '博客', en: 'Blog' },
  pricing: { zh: '定价', en: 'Pricing' },
  download: { zh: '下载客户端', en: 'Download App' },
  about: { zh: '关于我们', en: 'About Us' },
};

/** 所有合法 NavKey（用于白名单校验）。 */
const ALL_NAV_KEYS = Object.keys(NAV_LABELS) as NavKey[];
const NAV_KEY_SET = new Set<string>(ALL_NAV_KEYS);

/**
 * 默认配置：
 *  - `clips`（高光剪辑）紧跟 `home` 正下方；
 *  - `aiVideo`（AI 成片，耗算力）默认隐藏，且不排进 order；
 *  - `badges` 为历史上写在 app-shell 里的硬编码 NEW 入口，逐条搬到配置里，
 *    并新增 `tokpure`（TokPure 上线后需要 NEW 标识曝光）。
 */
export const DEFAULT_NAV_CONFIG: NavConfig = {
  order: [
    'home',
    'clips',
    'tiktokRemix',
    'aiDubbing',
    'localEngine',
    'inviteFriends',
    'shorts',
    'notes',
    'tokpure',
    'digitalHumanLive',
    'podcast',
    'aiTools',
    'blog',
    'pricing',
    'download',
    'about',
  ],
  hidden: ['aiVideo'],
  badges: [
    'aiDubbing',
    'aiVideo',
    'shorts',
    'tiktokRemix',
    'notes',
    'tokpure',
    'digitalHumanLive',
    'podcast',
    'aiTools',
  ],
};

function cloneDefault(): NavConfig {
  return {
    order: [...DEFAULT_NAV_CONFIG.order],
    hidden: [...DEFAULT_NAV_CONFIG.hidden],
    badges: [...DEFAULT_NAV_CONFIG.badges],
  };
}

/**
 * 容错解析任意输入为合法 NavConfig：
 *  - order 只保留合法 NavKey 并去重，再补齐 DEFAULT 中缺失的 key（保证新菜单上线后仍会显示）；
 *  - hidden 走白名单过滤并去重；
 *  - badges 走白名单过滤并去重；字段完全缺失 → 回落默认（老配置升级不丢 NEW 标识），
 *    显式传 [] → 尊重「全不显示」；
 *  - 非法输入返回 DEFAULT_NAV_CONFIG 的副本。
 */
export function normalizeNavConfig(raw: unknown): NavConfig {
  if (!raw || typeof raw !== 'object') return cloneDefault();
  const obj = raw as Record<string, unknown>;

  const orderRaw = Array.isArray(obj.order) ? obj.order : [];
  const hiddenRaw = Array.isArray(obj.hidden) ? obj.hidden : [];
  const badgesRaw = Array.isArray(obj.badges) ? obj.badges : DEFAULT_NAV_CONFIG.badges;

  const order: NavKey[] = [];
  const seen = new Set<string>();
  for (const k of orderRaw) {
    if (typeof k === 'string' && NAV_KEY_SET.has(k) && !seen.has(k)) {
      seen.add(k);
      order.push(k as NavKey);
    }
  }
  // 补齐默认 order 里缺失的 key，避免新菜单上线后被吞掉。
  // 插入位置 = 默认顺序中它后面最近一个「已存在」的 key 之前，这样新上线的菜单会落在
  // 设计好的位置（例如 TokPure 紧跟高光笔记），而不是一律沉到菜单末尾；
  // 走到末尾仍找不到锚点则追加（不会因为管理员把某个 key 挪到前面而把新 key 拽到菜单顶部）。
  const defaults = DEFAULT_NAV_CONFIG.order;
  for (const k of defaults) {
    if (seen.has(k)) continue;
    seen.add(k);
    let insertAt = -1;
    for (let i = defaults.indexOf(k) + 1; i < defaults.length; i += 1) {
      const idx = order.indexOf(defaults[i]);
      if (idx >= 0) {
        insertAt = idx;
        break;
      }
    }
    if (insertAt < 0) order.push(k);
    else order.splice(insertAt, 0, k);
  }

  const hidden: NavKey[] = [];
  const hiddenSeen = new Set<string>();
  for (const k of hiddenRaw) {
    if (typeof k === 'string' && NAV_KEY_SET.has(k) && !hiddenSeen.has(k)) {
      hiddenSeen.add(k);
      hidden.push(k as NavKey);
    }
  }

  const badges: NavKey[] = [];
  const badgeSeen = new Set<string>();
  for (const k of badgesRaw) {
    if (typeof k === 'string' && NAV_KEY_SET.has(k) && !badgeSeen.has(k)) {
      badgeSeen.add(k);
      badges.push(k as NavKey);
    }
  }

  return { order, hidden, badges };
}

/** 全部 NavKey（顺序：默认 order 优先，其余按定义顺序补齐）。用于后台完整列表。 */
export function allNavKeys(): NavKey[] {
  const out: NavKey[] = [];
  const seen = new Set<string>();
  for (const k of DEFAULT_NAV_CONFIG.order) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of ALL_NAV_KEYS) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
