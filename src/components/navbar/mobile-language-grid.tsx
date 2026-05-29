'use client';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { locales, localeNames } from '@/lib/i18n';

export function MobileLanguageGrid() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
      {locales.map((loc) => (
        <Button
          key={loc}
          variant={locale === loc ? 'default' : 'outline'}
          size="sm"
          className="text-xs px-2"
          onClick={() => setLocale(loc)}
        >
          {localeNames[loc].native}
        </Button>
      ))}
    </div>
  );
}
