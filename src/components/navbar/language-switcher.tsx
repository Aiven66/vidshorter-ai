'use client';

import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe, Check } from 'lucide-react';
import { locales, localeNames } from '@/lib/i18n/index';
import { useRouter } from 'next/navigation';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => {
              setLocale(loc);
              // Refresh server components so they re-render with the new locale cookie
              router.refresh();
            }}
            className="flex items-center justify-between gap-4"
          >
            <span>{localeNames[loc].native}</span>
            {locale === loc && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
