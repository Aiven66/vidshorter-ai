'use client';

/**
 * @clipop/core - Configuration injection
 *
 * All packages read config from this context. No process.env access in
 * package code, so the host app controls all environment-specific values.
 *
 * NOTE: This file is .tsx because AppConfigProvider returns JSX.
 */

import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { PlanConfig, PaymentChannelConfig, Locale } from './types';

/** Admin gate configuration — admin recognition rules. */
export interface AdminGateConfig {
  /** Emails always treated as admin (whitelist). */
  adminEmails: string[];
  /** Optional static API key for server-side admin verification. */
  adminApiKey?: string;
  /** Path to redirect to when admin check fails. */
  loginPath: string;
}

/** Desktop auth configuration. */
export interface DesktopAuthConfig {
  /** Deep-link scheme, e.g. 'myapp'. */
  scheme?: string;
  /** Whether desktop bridge is enabled. */
  enabled: boolean;
  /** Origin allowlist for local callback server (defaults to localhost). */
  callbackOrigins?: string[];
}

/** Complete runtime configuration for all packages. */
export interface AppConfig {
  /** App display name. */
  appName: string;
  /** Public app URL (e.g. https://myapp.com). */
  appUrl: string;

  // ── Supabase ──────────────────────────────────────────────
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Service role key (server-only, bypasses RLS). */
  supabaseServiceRoleKey?: string;

  // ── Auth ──────────────────────────────────────────────────
  /** OAuth redirect base path. Default '/auth/callback'. */
  authCallbackPath?: string;
  /** Google OAuth scopes. Default 'email profile'. */
  googleOAuthScopes?: string;
  /** Demo admin credentials when Supabase is not configured. */
  demoAdmins?: Array<{ email: string; password: string; name: string }>;

  // ── Admin ─────────────────────────────────────────────────
  admin: AdminGateConfig;

  // ── Desktop ───────────────────────────────────────────────
  desktop: DesktopAuthConfig;

  // ── Payments ─────────────────────────────────────────────
  /** Available subscription plans. */
  plans: PlanConfig[];
  /** Configured payment channels. */
  paymentChannels: PaymentChannelConfig[];
  /** Daily free credits granted to anonymous/free users. */
  dailyFreeCredits: number;
  /** Credits granted to admin users (effectively unlimited). */
  adminCredits: number;

  // ── Blog ──────────────────────────────────────────────────
  /** Storage bucket name for blog images. Default 'blog-images'. */
  blogImageBucket?: string;
  /** Translation target locales (ISO codes). Empty = no auto-translate. */
  blogTranslationLocales?: Locale[];
  /** Default blog category for new posts. */
  blogDefaultCategory?: string;

  // ── Analytics ────────────────────────────────────────────
  /** Funnel definitions for behavior analytics. */
  funnels?: Array<{ id: string; name: string; steps: Array<{ event: string; step: number }> }>;
  /** API path that accepts tracked events. Default '/api/events/track'. */
  analyticsEndpoint?: string;
  /** Session timeout in ms. Default 30 minutes. */
  analyticsSessionTtl?: number;

  // ── Feedback ──────────────────────────────────────────────
  /** External feedback URL (e.g. Tally form). When set, the feedback button opens this URL. */
  feedbackExternalUrl?: string;
  /** API path for in-app feedback submission. Default '/api/feedback'. */
  feedbackEndpoint?: string;

  // ── UI ────────────────────────────────────────────────────
  /** Default locale when user preference is unknown. Default 'en'. */
  defaultLocale?: Locale;
  /** Supported locales (ISO codes). */
  supportedLocales?: Locale[];
}

const AppConfigContext = createContext<AppConfig | null>(null);

/** Default config with safe fallbacks. Apps should override explicitly. */
function buildDefault(): AppConfig {
  return {
    appName: 'MyApp',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    authCallbackPath: '/auth/callback',
    googleOAuthScopes: 'email profile',
    admin: { adminEmails: [], loginPath: '/login' },
    desktop: { enabled: false },
    plans: [
      { id: 'free', name: 'Free', priceIntl: 0, priceCny: 0, dailyCredits: 100, features: [] },
      { id: 'starter', name: 'Starter', priceIntl: 9.9, priceCny: 49, dailyCredits: 500, badge: 'Popular', features: [] },
      { id: 'pro', name: 'Pro', priceIntl: 19.9, priceCny: 99, dailyCredits: 1_000_000, unlimitedCredits: true, features: [] },
    ],
    paymentChannels: [],
    dailyFreeCredits: 100,
    adminCredits: 10_000,
    blogImageBucket: 'blog-images',
    blogTranslationLocales: [],
    blogDefaultCategory: 'General',
    analyticsEndpoint: '/api/events/track',
    analyticsSessionTtl: 30 * 60 * 1000,
    feedbackEndpoint: '/api/feedback',
    defaultLocale: 'en',
    supportedLocales: ['en'],
  };
}

export interface AppConfigProviderProps {
  value: Partial<AppConfig>;
  children: ReactNode;
}

/** Top-level config provider. Merge partial config with safe defaults. */
export function AppConfigProvider({ value, children }: AppConfigProviderProps) {
  const merged = useMemo<AppConfig>(() => ({ ...buildDefault(), ...value }), [value]);
  return <AppConfigContext.Provider value={merged}>{children}</AppConfigContext.Provider>;
}

/** Read app config. Throws if used outside AppConfigProvider. */
export function useAppConfig(): AppConfig {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    throw new Error('useAppConfig must be used inside <AppConfigProvider>.');
  }
  return ctx;
}

/** Convenience helper: is an email an admin according to config whitelist? */
export function isAdminEmail(email: string | null | undefined, config: AppConfig): boolean {
  if (!email) return false;
  return config.admin.adminEmails.some((e) => e.toLowerCase() === email.toLowerCase());
}

/** Convenience helper: find a plan config by id. */
export function getPlanConfig(planId: string, config: AppConfig): PlanConfig | undefined {
  return config.plans.find((p) => p.id === planId);
}
