'use client';

import { ReactNode, Component } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth-context';
import { CreditsProvider } from '@/lib/credits-context';
import { LocaleProvider } from '@/lib/locale-context';
import dynamic from 'next/dynamic';

const Toaster = dynamic(
  () => import('@/components/ui/sonner').then(m => ({ default: m.Toaster })),
  { ssr: false }
);

interface ErrorBoundaryState {
  hasError: boolean;
}

class ProviderErrorBoundary extends Component<
  { children: ReactNode; name: string },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn(`ProviderErrorBoundary [${this.props.name}] caught:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <>{this.props.children}</>;
    }
    return this.props.children;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ProviderErrorBoundary name="Locale">
        <LocaleProvider>
          <ProviderErrorBoundary name="Auth">
            <AuthProvider>
              <ProviderErrorBoundary name="Credits">
                <CreditsProvider>
                  {children}
                  <Toaster />
                </CreditsProvider>
              </ProviderErrorBoundary>
            </AuthProvider>
          </ProviderErrorBoundary>
        </LocaleProvider>
      </ProviderErrorBoundary>
    </ThemeProvider>
  );
}
