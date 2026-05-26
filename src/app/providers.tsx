'use client';

import { ReactNode, Component } from 'react';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/lib/auth-context';
import { CreditsProvider } from '@/lib/credits-context';
import { LocaleProvider } from '@/lib/locale-context';
import { PostHogProvider } from '@/lib/posthog-provider';
import { Toaster } from '@/components/ui/sonner';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ProviderErrorBoundary extends Component<
  { children: ReactNode; name: string },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; name: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
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
      <ProviderErrorBoundary name="PostHog">
        <PostHogProvider>
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
        </PostHogProvider>
      </ProviderErrorBoundary>
    </ThemeProvider>
  );
}
