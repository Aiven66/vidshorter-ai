import { commonTranslations } from './common';

export type Locale =
  | 'en'
  | 'zh'
  | 'zh-Hant'
  | 'ja'
  | 'ko'
  | 'de'
  | 'fr'
  | 'it'
  | 'es'
  | 'pt'
  | 'hi'
  | 'ar'
  | 'bn'
  | 'id'
  | 'ms'
  | 'th'
  | 'he'
  | 'ru'
  | 'ur'
  | 'tr'
  | 'vi'
  | 'fa'
  | 'mr'
  | 'ta'
  | 'pl'
  | 'te'
  | 'ne'
  | 'da'
  | 'fi'
  | 'nl'
  | 'no'
  | 'sv';

export const locales: Locale[] = [
  'en', 'zh', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'it', 'es', 'pt',
  'hi', 'ar', 'bn', 'id', 'ms', 'th', 'he', 'ru', 'ur', 'tr',
  'vi', 'fa', 'mr', 'ta', 'pl', 'te', 'ne', 'da', 'fi', 'nl', 'no', 'sv'
];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  zh: { native: '简体中文', english: 'Chinese (Simplified)' },
  'zh-Hant': { native: '繁體中文', english: 'Chinese (Traditional)' },
  ja: { native: '日本語', english: 'Japanese' },
  ko: { native: '한국어', english: 'Korean' },
  de: { native: 'Deutsch', english: 'German' },
  fr: { native: 'Français', english: 'French' },
  it: { native: 'Italiano', english: 'Italian' },
  es: { native: 'Español', english: 'Spanish' },
  pt: { native: 'Português', english: 'Portuguese' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ar: { native: 'العربية', english: 'Arabic' },
  bn: { native: 'বাংলা', english: 'Bengali' },
  id: { native: 'Bahasa Indonesia', english: 'Indonesian' },
  ms: { native: 'Bahasa Melayu', english: 'Malay' },
  th: { native: 'ภาษาไทย', english: 'Thai' },
  he: { native: 'עברית', english: 'Hebrew' },
  ru: { native: 'Русский', english: 'Russian' },
  ur: { native: 'اردو', english: 'Urdu' },
  tr: { native: 'Türkçe', english: 'Turkish' },
  vi: { native: 'Tiếng Việt', english: 'Vietnamese' },
  fa: { native: 'فارسی', english: 'Persian' },
  mr: { native: 'मराठी', english: 'Marathi' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
  pl: { native: 'Polski', english: 'Polish' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  ne: { native: 'नेपाली', english: 'Nepali' },
  da: { native: 'Dansk', english: 'Danish' },
  fi: { native: 'Suomi', english: 'Finnish' },
  nl: { native: 'Nederlands', english: 'Dutch' },
  no: { native: 'Norsk', english: 'Norwegian' },
  sv: { native: 'Svenska', english: 'Swedish' },
};

export function flattenTranslations(obj: any, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value, newKey));
    } else {
      result[newKey] = value as string;
    }
  }
  return result;
}

const enTranslations = flattenTranslations(commonTranslations);

const localeLoaders: Record<Locale, () => Promise<{ default: any }>> = {
  en: () => import('./locales/en').then(m => ({ default: m.default })),
  zh: () => import('./locales/zh').then(m => ({ default: m.default })),
  'zh-Hant': () => import('./locales/zh-Hant').then(m => ({ default: m.default })),
  ja: () => import('./locales/ja').then(m => ({ default: m.default })),
  ko: () => import('./locales/ko').then(m => ({ default: m.default })),
  de: () => import('./locales/de').then(m => ({ default: m.default })),
  fr: () => import('./locales/fr').then(m => ({ default: m.default })),
  it: () => import('./locales/it').then(m => ({ default: m.default })),
  es: () => import('./locales/es').then(m => ({ default: m.default })),
  pt: () => import('./locales/pt').then(m => ({ default: m.default })),
  hi: () => import('./locales/hi').then(m => ({ default: m.default })),
  ar: () => import('./locales/ar').then(m => ({ default: m.default })),
  bn: () => import('./locales/bn').then(m => ({ default: m.default })),
  id: () => import('./locales/id').then(m => ({ default: m.default })),
  ms: () => import('./locales/ms').then(m => ({ default: m.default })),
  th: () => import('./locales/th').then(m => ({ default: m.default })),
  he: () => import('./locales/he').then(m => ({ default: m.default })),
  ru: () => import('./locales/ru').then(m => ({ default: m.default })),
  ur: () => import('./locales/ur').then(m => ({ default: m.default })),
  tr: () => import('./locales/tr').then(m => ({ default: m.default })),
  vi: () => import('./locales/vi').then(m => ({ default: m.default })),
  fa: () => import('./locales/fa').then(m => ({ default: m.default })),
  mr: () => import('./locales/mr').then(m => ({ default: m.default })),
  ta: () => import('./locales/ta').then(m => ({ default: m.default })),
  pl: () => import('./locales/pl').then(m => ({ default: m.default })),
  te: () => import('./locales/te').then(m => ({ default: m.default })),
  ne: () => import('./locales/ne').then(m => ({ default: m.default })),
  da: () => import('./locales/da').then(m => ({ default: m.default })),
  fi: () => import('./locales/fi').then(m => ({ default: m.default })),
  nl: () => import('./locales/nl').then(m => ({ default: m.default })),
  no: () => import('./locales/no').then(m => ({ default: m.default })),
  sv: () => import('./locales/sv').then(m => ({ default: m.default })),
};

const translationsCache: Partial<Record<Locale, Record<string, string>>> = {
  en: enTranslations,
};

export async function loadLocaleTranslations(locale: Locale): Promise<Record<string, string>> {
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  if (locale === defaultLocale) {
    translationsCache[locale] = enTranslations;
    return enTranslations;
  }

  const loader = localeLoaders[locale];
  if (!loader) {
    translationsCache[locale] = enTranslations;
    return enTranslations;
  }

  const module = await loader();
  const flattened = flattenTranslations(module.default);
  translationsCache[locale] = flattened;
  return flattened;
}

export function useTranslation(locale: Locale, loadedTranslations?: Record<string, string>) {
  const translations = loadedTranslations || enTranslations;
  return function t(key: string): string {
    return translations[key] || enTranslations[key] || key;
  };
}

export { commonTranslations };
