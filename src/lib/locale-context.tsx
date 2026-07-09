'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Locale, defaultLocale, useTranslation, locales, loadLocaleTranslations } from './i18n/index';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  loading: boolean;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function LocaleProvider({ children, initialLocale, initialTranslations }: { children: ReactNode; initialLocale?: Locale; initialTranslations?: Record<string, string> }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || defaultLocale);
  const [loadedTranslations, setLoadedTranslations] = useState<Record<string, string> | undefined>(initialTranslations);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef<string | null>(null);

  const t = useTranslation(locale, loadedTranslations);

  const loadTranslations = useCallback(async (targetLocale: Locale) => {
    if (loadingRef.current === targetLocale) return;
    loadingRef.current = targetLocale;
    setLoading(true);
    try {
      const translations = await loadLocaleTranslations(targetLocale);
      setLoadedTranslations(translations);
    } catch (e) {
      console.warn('Failed to load translations for locale:', targetLocale, e);
    } finally {
      setLoading(false);
      loadingRef.current = null;
    }
  }, []);

  useEffect(() => {
    // If initialTranslations were provided from SSR, translations are already loaded.
    if (initialTranslations) return;
    try {
      // Read locale from cookie first (shared with server-side rendering),
      // fall back to localStorage for backward compatibility.
      const cookieMatch = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
      const savedLocale = (cookieMatch?.[1] || localStorage.getItem('locale')) as Locale;
      if (savedLocale && isValidLocale(savedLocale)) {
        setLocaleState(savedLocale);
        if (savedLocale !== defaultLocale) {
          loadTranslations(savedLocale);
        }
      }
    } catch (e) {
      console.warn('Failed to load locale from storage:', e);
    }
  }, [loadTranslations, initialTranslations]);

  const setLocale = (newLocale: Locale) => {
    if (!isValidLocale(newLocale)) {
      console.warn('Invalid locale:', newLocale);
      return;
    }

    setLocaleState(newLocale);

    if (newLocale === defaultLocale) {
      setLoadedTranslations(undefined);
    } else {
      loadTranslations(newLocale);
    }

    try {
      localStorage.setItem('locale', newLocale);
      // Also write to cookie so server-side rendering can read it
      document.cookie = `locale=${newLocale}; path=/; max-age=31536000; samesite=lax`;
      if (document && document.documentElement) {
        document.documentElement.lang = newLocale;
      }
    } catch (e) {
      console.warn('Failed to save locale:', e);
    }
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
