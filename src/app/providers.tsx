'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth-context';
import { CreditsProvider } from '@/lib/credits-context';
import { LocaleProvider } from '@/lib/locale-context';
import { PostHogProvider } from '@/lib/posthog-provider';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PostHogProvider>
        <LocaleProvider>
          <AuthProvider>
            <CreditsProvider>
              {children}
              <Toaster />
            </CreditsProvider>
          </AuthProvider>
        </LocaleProvider>
      </PostHogProvider>
    </ThemeProvider>
  );
}
