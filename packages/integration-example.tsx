/**
 * Integration example: shows how a host Next.js app wires up all packages.
 *
 * This file is NOT meant to be imported directly — copy the relevant
 * snippets into your app's own providers.tsx / layout.tsx / pages.
 */

import React from 'react';
import { AppConfigProvider } from './core/config';
import { AuthProvider, useAuth } from './auth/auth-provider';
import { AdminGate } from './auth/admin-gate';
import { LoginForm } from './auth/login-form';
import { RegisterForm } from './auth/register-form';
import { OAuthCallback } from './auth/oauth-callback';
import { CreditsProvider, useCredits } from './payments/credits-provider';
import { PricingPage } from './payments/pricing-page';
import { PaymentModal } from './payments/payment-modal';
import { AdminDashboard } from './admin/admin-dashboard';
import { StatsPage } from './admin/stats-page';
import { UsersPage } from './admin/users-page';
import { PaymentsPage } from './admin/payments-page';
import { EventsPage } from './admin/events-page';
import { BlogListPage } from './blog/blog-list-page';
import { BlogDetailPage } from './blog/blog-detail-page';
import { AdminBlogManager } from './blog/admin-blog-manager';
import { FeedbackWidget } from './feedback/feedback-widget';
import { AdminFeedbackManager } from './feedback/admin-feedback-manager';
import { trackEvent, setAnalyticsUser, defineFunnel } from './analytics/sdk';

// ───────────────────────────────────────────────────────────────────────
// 1. Root Providers — wrap your entire app in this
// ───────────────────────────────────────────────────────────────────────

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigProvider
      value={{
        appName: 'MyApp',
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        // ⚠️ service role key is SERVER-ONLY — never expose to the browser bundle
        // supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

        admin: {
          adminEmails: ['admin@myapp.com'],
          adminApiKey: process.env.ADMIN_API_KEY,
          loginPath: '/login',
        },
        desktop: { enabled: true, scheme: 'myapp' },

        plans: [
          {
            id: 'free',
            name: 'Free',
            priceIntl: 0,
            priceCny: 0,
            dailyCredits: 100,
            features: ['100 credits/day', 'Basic features'],
          },
          {
            id: 'pro',
            name: 'Pro',
            priceIntl: 19.9,
            priceCny: 99,
            dailyCredits: 1_000_000,
            unlimitedCredits: true,
            badge: 'Most Popular',
            features: ['Unlimited credits', 'Priority support', 'All features'],
          },
        ],

        paymentChannels: [
          { provider: 'paypal', enabled: true, config: { clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '' } },
          { provider: 'creem', enabled: true, config: {} },
        ],

        funnels: [
          {
            id: 'video_generation',
            name: 'Video Generation',
            steps: [
              { event: 'page_view_home', step: 1 },
              { event: 'click_analyze', step: 2 },
              { event: 'analyze_success', step: 3 },
              { event: 'clip_download', step: 4 },
            ],
          },
          {
            id: 'subscription',
            name: 'Subscription',
            steps: [
              { event: 'page_view_pricing', step: 1 },
              { event: 'click_subscribe', step: 2 },
              { event: 'subscribe_success', step: 3 },
            ],
          },
        ],

        feedbackExternalUrl: 'https://tally.so/r/your-form-id',
        blogTranslationLocales: ['zh', 'zh-Hant', 'ja', 'ko', 'de', 'fr'],
        defaultLocale: 'en',
        supportedLocales: ['en', 'zh', 'zh-Hant', 'ja'],
      }}
    >
      <AuthProvider>
        <CreditsProvider>{children}</CreditsProvider>
      </AuthProvider>
    </AppConfigProvider>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 2. Login / Register / OAuth callback pages
// ───────────────────────────────────────────────────────────────────────

export function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoginForm redirectTo="/dashboard" showRegisterLink />
    </div>
  );
}

export function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <RegisterForm redirectTo="/" showTerms />
    </div>
  );
}

export function OAuthCallbackPage() {
  return <OAuthCallback redirectTo="/dashboard" desktopRedirectPath="/desktop/callback" />;
}

// ───────────────────────────────────────────────────────────────────────
// 3. Pricing page with payment modal
// ───────────────────────────────────────────────────────────────────────

export function PricingRoute() {
  return <PricingPage />;
}

// ───────────────────────────────────────────────────────────────────────
// 4. Blog pages
// ───────────────────────────────────────────────────────────────────────

export function BlogListRoute() {
  return <BlogListPage />;
}

export function BlogDetailRoute({ id }: { id: string }) {
  return <BlogDetailPage id={id} />;
}

// ───────────────────────────────────────────────────────────────────────
// 5. Admin dashboard — composes multiple pages, including blog & feedback
// ───────────────────────────────────────────────────────────────────────

export function AdminRoute() {
  const { accessToken } = useAuth();

  return (
    <AdminGate>
      <AdminDashboard
        token={accessToken || ''}
        locale="en"
        extraNavItems={[
          // Inject blog manager and feedback manager into the admin sidebar
          {
            id: 'blog',
            label: { zh: '博客', en: 'Blog' },
            component: <AdminBlogManager token={accessToken || ''} locale="en" />,
          },
          {
            id: 'feedback',
            label: { zh: '反馈', en: 'Feedback' },
            component: <AdminFeedbackManager token={accessToken || ''} locale="en" />,
          },
        ]}
      />
    </AdminGate>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 6. User-facing feedback widget (in navbar or footer)
// ───────────────────────────────────────────────────────────────────────

export function NavbarFeedback() {
  const { accessToken } = useAuth();
  return <FeedbackWidget token={accessToken || undefined} buttonVariant="icon" />;
}

// ───────────────────────────────────────────────────────────────────────
// 7. Behavior tracking — call at app boot and key funnel steps
// ───────────────────────────────────────────────────────────────────────

import { VIDEO_FUNNEL, SUBSCRIBE_FUNNEL } from './analytics/funnel-config';

export function initAnalytics(user: { id: string; email: string; name?: string }) {
  setAnalyticsUser(user);
}

// On home page mount:
export function trackHomePageView() {
  trackEvent(VIDEO_FUNNEL.PAGE_VIEW_HOME);
}

// On analyze button click:
export function trackAnalyzeClick() {
  trackEvent(VIDEO_FUNNEL.CLICK_ANALYZE);
}

// On successful analysis:
export function trackAnalyzeSuccess() {
  trackEvent(VIDEO_FUNNEL.ANALYZE_SUCCESS);
}

// On clip download:
export function trackClipDownload() {
  trackEvent(VIDEO_FUNNEL.CLIP_DOWNLOAD);
}

// On pricing page view:
export function trackPricingView() {
  trackEvent(SUBSCRIBE_FUNNEL.PAGE_VIEW_PRICING);
}

// On subscribe button click:
export function trackSubscribeClick() {
  trackEvent(SUBSCRIBE_FUNNEL.CLICK_SUBSCRIBE);
}
