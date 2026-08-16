/**
 * 视频场景主题系统
 *
 * Canvas 2D 无法读取 CSS 变量，导出视频的颜色必须由 JS 显式提供。
 * 每个主题定义一组完整配色，场景 draw/render 函数通过 props.theme 接收，
 * 缺省时回退到 indigo（与平台 tailwind primary 同步），保证向后兼容。
 */

export interface SceneTheme {
  id: string;
  /** 主色（强调条 / 徽章 / 进度条） */
  primary: string;
  /** 深主色（渐变深端 / CTA 背景） */
  primaryDark: string;
  /** 浅主色（渐变浅端 / 价格高亮） */
  primaryLight: string;
  /** 场景深色背景 */
  bgDark: string;
  /** 卡片背景 */
  bgCard: string;
  /** 次要文字灰 */
  textMuted: string;
  /** 正文浅灰 */
  textBody: string;
}

export const SCENE_THEMES: Record<string, SceneTheme> = {
  /** 数码科技 — 靛蓝（默认，与平台 primary 同步） */
  tech: {
    id: 'tech',
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: '#818cf8',
    bgDark: '#0f1020',
    bgCard: '#1a1b2e',
    textMuted: '#9ca3af',
    textBody: '#cbd5e1',
  },
  /** 时尚服饰 — 玫红 */
  fashion: {
    id: 'fashion',
    primary: '#f43f5e',
    primaryDark: '#be123c',
    primaryLight: '#fb7185',
    bgDark: '#1c0d13',
    bgCard: '#2a141d',
    textMuted: '#c4a3ad',
    textBody: '#ead5db',
  },
  /** 美妆个护 — 粉紫 */
  beauty: {
    id: 'beauty',
    primary: '#ec4899',
    primaryDark: '#be185d',
    primaryLight: '#f472b6',
    bgDark: '#1a0e1b',
    bgCard: '#291528',
    textMuted: '#c2a3bd',
    textBody: '#e9d3e4',
  },
  /** 美食生鲜 — 活力橙 */
  food: {
    id: 'food',
    primary: '#f97316',
    primaryDark: '#c2410c',
    primaryLight: '#fdba74',
    bgDark: '#1b1207',
    bgCard: '#2a1c0d',
    textMuted: '#c8b09a',
    textBody: '#ecdcab',
  },
  /** 家居生活 — 自然绿 */
  home: {
    id: 'home',
    primary: '#10b981',
    primaryDark: '#047857',
    primaryLight: '#6ee7b7',
    bgDark: '#0b1511',
    bgCard: '#152119',
    textMuted: '#9db8ab',
    textBody: '#cfe5d9',
  },
};

export type SceneThemeId = keyof typeof SCENE_THEMES;

export const DEFAULT_SCENE_THEME: SceneTheme = SCENE_THEMES.tech;

/** 解析主题：props 传空或未知 id 时回退默认主题 */
export function resolveSceneTheme(theme?: Partial<SceneTheme> | string): SceneTheme {
  if (!theme) return DEFAULT_SCENE_THEME;
  if (typeof theme === 'string') {
    return SCENE_THEMES[theme] ?? DEFAULT_SCENE_THEME;
  }
  return { ...DEFAULT_SCENE_THEME, ...theme };
}
