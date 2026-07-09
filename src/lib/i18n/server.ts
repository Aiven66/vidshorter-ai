import { cookies } from 'next/headers';
import { Locale, defaultLocale, locales, loadLocaleTranslations, useTranslation } from './index';

export async function getServerTranslation() {
  const cookieStore = await cookies();
  const raw = cookieStore.get('locale')?.value;
  const locale: Locale = raw && locales.includes(raw as Locale) ? (raw as Locale) : defaultLocale;
  const translations = await loadLocaleTranslations(locale);
  const t = useTranslation(locale, translations);
  return { locale, t, translations };
}
