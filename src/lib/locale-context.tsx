'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Locale, defaultLocale, useTranslation, locales } from './i18n';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

// 验证 locale 是否有效
function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const t = useTranslation(locale);

  useEffect(() => {
    // Check localStorage for saved locale
    try {
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && isValidLocale(savedLocale)) {
        setLocaleState(savedLocale);
      }
    } catch (e) {
      console.warn('Failed to load locale from localStorage:', e);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    if (!isValidLocale(newLocale)) {
      console.warn('Invalid locale:', newLocale);
      return;
    }
    
    setLocaleState(newLocale);
    
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
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
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
