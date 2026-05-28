'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Locale, defaultLocale, useTranslation, locales, loadLocaleTranslations } from './i18n';

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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [loadedTranslations, setLoadedTranslations] = useState<Record<string, string> | undefined>(undefined);
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
    try {
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && isValidLocale(savedLocale)) {
        setLocaleState(savedLocale);
        if (savedLocale !== defaultLocale) {
          loadTranslations(savedLocale);
        }
      }
    } catch (e) {
      console.warn('Failed to load locale from localStorage:', e);
    }
  }, [loadTranslations]);

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
