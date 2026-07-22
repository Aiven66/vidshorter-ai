'use client';

/**
 * @clipop/payments - Credits Provider
 *
 * React Context that exposes per-user credit balance, deduction, addition,
 * and daily reset logic. Reads credits/subscription/transaction rows from
 * Supabase via the service role client (bypasses RLS).
 *
 * Demo mode (when Supabase is not configured or user id starts with 'demo-')
 * falls back to localStorage, keyed per user.
 *
 * Admin users always return Math.max(balance, config.adminCredits) and
 * deductCredits is a no-op returning true.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  useAppConfig,
  getAdminClient,
  isSupabaseConfigured,
  type AppConfig,
  type AppUser,
} from '@clipop/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreditsContextValue {
  balance: number;
  plan: string | null;
  loading: boolean;
  refresh: () => Promise<number>;
  deductCredits: (amount: number, type?: string, description?: string) => Promise<boolean>;
  addCredits: (amount: number, type?: string, description?: string) => Promise<boolean>;
}

export interface CreditsProviderProps {
  children: ReactNode;
  /** Auth context integration: pass current user + access token. */
  user: AppUser | null;
  accessToken?: string | null;
  /** Role check: defaults to user.role === 'admin'. */
  isAdmin?: (user: AppUser) => boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const CreditsContext = createContext<CreditsContextValue | undefined>(undefined);

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error('useCredits must be used within <CreditsProvider>.');
  }
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function demoKey(userId: string): string {
  return `app_demo_credits_${userId}`;
}

function demoResetKey(): string {
  return 'app_demo_credits_reset';
}

function readDemoCredits(userId: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(demoKey(userId));
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function writeDemoCredits(userId: string, balance: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(demoKey(userId), String(balance));
  } catch {
    // ignore quota errors
  }
}

function readDemoResetTime(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(demoResetKey());
}

function writeDemoResetTime(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(demoResetKey(), new Date().toISOString());
  } catch {
    // ignore
  }
}

function shouldResetUtc(lastResetAt: string | Date): boolean {
  const last = lastResetAt instanceof Date ? lastResetAt : new Date(lastResetAt);
  const now = new Date();
  return (
    now.getUTCFullYear() !== last.getUTCFullYear() ||
    now.getUTCMonth() !== last.getUTCMonth() ||
    now.getUTCDate() !== last.getUTCDate()
  );
}

function utcMidnightIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
}

function getPlanDailyCredits(config: AppConfig, planId: string | null | undefined): number {
  if (!planId) return config.dailyFreeCredits;
  const plan = config.plans.find((p) => p.id === planId);
  return plan ? plan.dailyCredits : config.dailyFreeCredits;
}

function isDemoUser(user: AppUser): boolean {
  return user.id.startsWith('demo-') || user.id.startsWith('google-demo-');
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function CreditsProvider({ children, user, accessToken, isAdmin }: CreditsProviderProps) {
  const config = useAppConfig();
  const [balance, setBalance] = useState(0);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const adminCheck = useCallback(
    (u: AppUser | null) => {
      if (!u) return false;
      if (isAdmin) return isAdmin(u);
      return u.role === 'admin';
    },
    [isAdmin],
  );

  const isDemoMode = useCallback(
    (u: AppUser) => {
      return !isSupabaseConfigured(config) || isDemoUser(u);
    },
    [config],
  );

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setPlan(null);
      setLoading(false);
      return;
    }

    const admin = adminCheck(user);
    const demoMode = isDemoMode(user);

    if (demoMode) {
      const existing = readDemoCredits(user.id, config.dailyFreeCredits);
      if (admin) {
        const adminBalance = Math.max(existing, config.adminCredits);
        setBalance(adminBalance);
        writeDemoCredits(user.id, adminBalance);
        setPlan('admin');
      } else {
        // Daily reset for non-admin demo users
        const lastReset = readDemoResetTime();
        const shouldReset = !lastReset || shouldResetUtc(lastReset);
        if (shouldReset) {
          setBalance(config.dailyFreeCredits);
          writeDemoCredits(user.id, config.dailyFreeCredits);
          writeDemoResetTime();
        } else {
          setBalance(existing);
        }
        setPlan('free');
      }
      setLoading(false);
      return;
    }

    try {
      const client = getAdminClient(config);

      // Read current subscription
      const { data: subRow } = await client
        .from('subscriptions')
        .select('plan_type,status')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentPlan = subRow?.status === 'active' ? subRow.plan_type : null;
      setPlan(currentPlan);

      const dailyCredits = admin
        ? config.adminCredits
        : getPlanDailyCredits(config, currentPlan);

      // Read credits row
      const { data: creditsRow, error } = await client
        .from('credits')
        .select('id,user_id,balance,last_reset_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[credits] fetch error:', error.message);
        setBalance(admin ? config.adminCredits : readDemoCredits(user.id, dailyCredits));
        setLoading(false);
        return;
      }

      const resetAt = utcMidnightIso(new Date());

      if (!creditsRow) {
        // Create credits row for new user
        const { data: newRow, error: insertError } = await client
          .from('credits')
          .insert({
            user_id: user.id,
            balance: dailyCredits,
            last_reset_at: resetAt,
          })
          .select()
          .single();

        if (insertError) {
          console.warn('[credits] insert failed:', insertError.message);
          setBalance(dailyCredits);
        } else if (newRow) {
          setBalance(newRow.balance);
          try {
            await client.from('credit_transactions').insert({
              user_id: user.id,
              amount: dailyCredits,
              type: 'daily_reset',
              description: 'Daily credits reset (new user)',
            });
          } catch {
            // ignore transaction log failures
          }
        }
      } else if (admin) {
        const adminBalance = Math.max(creditsRow.balance ?? 0, config.adminCredits);
        if (adminBalance !== creditsRow.balance) {
          await client
            .from('credits')
            .update({ balance: adminBalance })
            .eq('id', creditsRow.id);
        }
        setBalance(adminBalance);
      } else if (shouldResetUtc(creditsRow.last_reset_at)) {
        // Cross-day reset
        const { data: updatedRow, error: updateError } = await client
          .from('credits')
          .update({ balance: dailyCredits, last_reset_at: resetAt })
          .eq('id', creditsRow.id)
          .select()
          .single();

        if (updateError || !updatedRow) {
          setBalance(creditsRow.balance);
        } else {
          setBalance(updatedRow.balance);
          try {
            await client.from('credit_transactions').insert({
              user_id: user.id,
              amount: dailyCredits,
              type: 'daily_reset',
              description: 'Daily credits reset',
            });
          } catch {
            // ignore
          }
        }
      } else {
        setBalance(creditsRow.balance);
      }
    } catch (err) {
      console.warn('[credits] fetch failed, using demo mode:', err);
      setBalance(readDemoCredits(user.id, config.dailyFreeCredits));
    } finally {
      setLoading(false);
    }
  }, [user, adminCheck, isDemoMode, config]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits, accessToken]);

  const refresh = useCallback(async (): Promise<number> => {
    if (!user) return balance;
    await fetchCredits();
    return balance;
  }, [user, balance, fetchCredits]);

  const deductCredits = useCallback(
    async (
      amount: number,
      type: string = 'consume',
      description: string = 'Credit deduction',
    ): Promise<boolean> => {
      if (!user) return false;
      if (adminCheck(user)) return true;
      if (balance < amount) return false;

      if (isDemoMode(user)) {
        const next = balance - amount;
        setBalance(next);
        writeDemoCredits(user.id, next);
        return true;
      }

      try {
        const client = getAdminClient(config);
        const next = balance - amount;
        const { error } = await client
          .from('credits')
          .update({ balance: next })
          .eq('user_id', user.id);

        if (error) {
          console.warn('[credits] deduct failed, applying locally:', error.message);
          setBalance(next);
          writeDemoCredits(user.id, next);
          return true;
        }

        setBalance(next);
        try {
          await client.from('credit_transactions').insert({
            user_id: user.id,
            amount: -amount,
            type,
            description,
          });
        } catch {
          // ignore log errors
        }
        return true;
      } catch (err) {
        console.warn('[credits] deduct error, applying locally:', err);
        const next = balance - amount;
        setBalance(next);
        writeDemoCredits(user.id, next);
        return true;
      }
    },
    [user, balance, adminCheck, isDemoMode, config],
  );

  const addCredits = useCallback(
    async (
      amount: number,
      type: string = 'purchase',
      description: string = 'Credit addition',
    ): Promise<boolean> => {
      if (!user) return false;

      if (isDemoMode(user)) {
        const next = balance + amount;
        setBalance(next);
        writeDemoCredits(user.id, next);
        return true;
      }

      try {
        const client = getAdminClient(config);
        const next = balance + amount;
        const { error } = await client
          .from('credits')
          .update({ balance: next })
          .eq('user_id', user.id);

        if (error) {
          console.warn('[credits] add failed:', error.message);
          return false;
        }

        setBalance(next);
        try {
          await client.from('credit_transactions').insert({
            user_id: user.id,
            amount,
            type,
            description,
          });
        } catch {
          // ignore log errors
        }
        return true;
      } catch (err) {
        console.warn('[credits] add error:', err);
        return false;
      }
    },
    [user, balance, isDemoMode, config],
  );

  return (
    <CreditsContext.Provider
      value={{ balance, plan, loading, refresh, deductCredits, addCredits }}
    >
      {children}
    </CreditsContext.Provider>
  );
}

/** Convenience helper: lookup plan daily credits from config. */
export function getDailyCreditsForPlan(config: AppConfig, planId: string | null | undefined): number {
  return getPlanDailyCredits(config, planId);
}
