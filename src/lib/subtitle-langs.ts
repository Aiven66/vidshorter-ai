/**
 * P0 — 字幕翻译（Starter+ 权益）。纯数据模块：无 node 依赖，可被前端组件
 * 直接 import（服务端与客户端共用）。负责：
 *   - 翻译目标语言白名单（也是前端下拉的选项）
 *   - 目标语言 → YouTube 官方字幕语言代码映射（优先用官方字幕，质量更高）
 *   - normalizeSubtitleLang：白名单归一化（前端不可信）
 *   - isNativeTranscript：判断拉到的字幕是否已是目标语言（无需机器翻译）
 */

export interface SubtitleLangOption {
  /** 接口透传的语言代码（同时是前端 select 的 value） */
  code: string;
  /** 语言母语名称（前后端共用，无需翻译） */
  label: string;
}

export const TRANSLATE_LANGS: SubtitleLangOption[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
];

export const SUBTITLE_LANG_CODES: string[] = TRANSLATE_LANGS.map((l) => l.code);

/**
 * 目标语言 → YouTube 官方字幕语言代码（按优先级排序）。
 * 有官方字幕时直接用官方翻译；没有才回退英文 + 机器翻译。
 */
export const YT_LANG_CODES: Record<string, string[]> = {
  'zh-CN': ['zh-Hans', 'zh-CN', 'zh'],
  'zh-TW': ['zh-Hant', 'zh-TW', 'zh-Hans', 'zh'],
  en: ['en', 'en-US'],
  ja: ['ja'],
  ko: ['ko'],
  es: ['es'],
  fr: ['fr'],
  de: ['de'],
  it: ['it'],
  pt: ['pt'],
  ru: ['ru'],
  ar: ['ar'],
  hi: ['hi'],
};

/** 白名单归一化（前端不可信，非法值返回 null = 不翻译）。 */
export function normalizeSubtitleLang(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return SUBTITLE_LANG_CODES.includes(v) ? v : null;
}

/**
 * 判断拉到的官方字幕语言 usedLang 是否已是目标语言 preferred 的原生字幕
 * （按语言主标签判断：zh-CN/zh-Hans/zh 都视为 zh；en/en-US 视为 en）。
 */
export function isNativeTranscript(usedLang: string, preferred: string): boolean {
  if (!usedLang || !preferred) return false;
  return preferred.split('-')[0].toLowerCase() === usedLang.split('-')[0].toLowerCase();
}
