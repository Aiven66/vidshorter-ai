'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { isAdminUser } from './admin-gate';
import {
  FREE_DAILY_CREDITS,
  hasQuotaCrossed,
  isLegacyPaidRow,
  planQuota,
  quotaResetDescription,
  quotaTransactionType,
  resetBoundary,
  type Quota,
} from './plan-credits';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url === '' || anonKey === '') return false;
  return true;
}

let _supabaseMod: typeof import('@/storage/database/supabase-client') | null = null;
let _loadPromise: Promise<typeof import('@/storage/database/supabase-client')> | null = null;

async function loadSupabaseMod() {
  if (_supabaseMod) return _supabaseMod;
  if (_loadPromise) return _loadPromise;
  _loadPromise = import('@/storage/database/supabase-client').then(mod => {
    _supabaseMod = mod;
    return mod;
  });
  return _loadPromise;
}

async function getSupabaseClient(token?: string) {
  const mod = await loadSupabaseMod();
  return mod.getSupabaseClient(token);
}

interface CreditsContextType {
  balance: number;
  loading: boolean;
  /** Current plan_type: 'free' | 'starter' | 'pro'. 'free' when not paid. */
  plan: string;
  refreshCredits: () => Promise<number>;
  deductCredits: (amount: number) => Promise<boolean>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

// Demo mode credits storage – keyed per user
const DEMO_CREDITS_KEY = 'clipop_demo_credits';
const DEMO_CREDITS_RESET_KEY = 'clipop_demo_credits_reset';

// 额度真源统一在 @/lib/plan-credits（与服务端同一份）：
// 免费档 60/日（= 1 次生成，CREDIT_COST 60）；Starter 6,000/月；Pro 20,000/月。
const DAILY_FREE_CREDITS = FREE_DAILY_CREDITS;
const ADMIN_CREDITS = 10_000;

/** 某 plan 当前的额度与周期（存量旧付费订阅仍走旧日额度）。 */
function quotaFor(planType: string | null | undefined, legacyPaid: boolean): Quota {
  return planQuota(planType, { legacyPaid });
}

/** subscriptions 行中判断存量旧付费订阅所需的周期边界字段。 */
function periodEndOf(sub: unknown): string | null {
  return (sub as { current_period_end?: string | null } | null)?.current_period_end ?? null;
}

function getDemoCreditsKey(userId?: string): string {
  return userId ? `clipop_demo_credits_${userId}` : DEMO_CREDITS_KEY;
}

function getDemoCredits(userId?: string): number {
  if (typeof window === 'undefined') return DAILY_FREE_CREDITS;
  const stored = localStorage.getItem(getDemoCreditsKey(userId));
  if (stored) return parseInt(stored, 10);
  // Legacy shared key migration
  const legacy = localStorage.getItem(DEMO_CREDITS_KEY);
  return legacy ? parseInt(legacy, 10) : DAILY_FREE_CREDITS;
}

function saveDemoCredits(balance: number, userId?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getDemoCreditsKey(userId), balance.toString());
}

function shouldResetDemoCredits(): boolean {
  if (typeof window === 'undefined') return false;
  const lastReset = localStorage.getItem(DEMO_CREDITS_RESET_KEY);
  if (!lastReset) return true;
  
  const resetDate = new Date(lastReset);
  const now = new Date();
  
  return (
    now.getUTCFullYear() !== resetDate.getUTCFullYear()
    || now.getUTCMonth() !== resetDate.getUTCMonth()
    || now.getUTCDate() !== resetDate.getUTCDate()
  );
}

function setDemoResetTime() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_CREDITS_RESET_KEY, new Date().toISOString());
}

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('free');

  // 额度/刷新边界不再本地复刻：直接用 @/lib/plan-credits 的 planQuota / resetBoundary / hasQuotaCrossed，
  // 保证 UI 与库、Web 与桌面端完全一致。

  useEffect(() => {
    if (user) {
      // Admin always gets 10000 credits
      const isAdmin = isAdminUser(user);
      const defaultCredits = isAdmin ? ADMIN_CREDITS : DAILY_FREE_CREDITS;
      const useDemoMode = !isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-');

      if (useDemoMode) {
        const existingBalance = getDemoCredits(user.id);
        // Admin: set to 10000 if they don't already have more (or first login)
        if (isAdmin) {
          const adminBalance = Math.max(existingBalance, ADMIN_CREDITS);
          // Initialize admin credits if this is first time or they have less than 10000
          if (!localStorage.getItem(getDemoCreditsKey(user.id))) {
            setBalance(ADMIN_CREDITS);
            saveDemoCredits(ADMIN_CREDITS, user.id);
          } else {
            setBalance(adminBalance);
            if (adminBalance !== existingBalance) saveDemoCredits(adminBalance, user.id);
          }
        } else if (shouldResetDemoCredits()) {
          setBalance(defaultCredits);
          saveDemoCredits(defaultCredits, user.id);
          setDemoResetTime();
        } else {
          setBalance(existingBalance);
        }
        setLoading(false);
        return;
      }

      fetchCredits();
    } else {
      setBalance(0);
      setLoading(false);
    }
  }, [user, accessToken]);

  async function fetchCredits() {
    // Check configuration directly
    if (!isSupabaseConfigured()) {
      const isAdmin = isAdminUser(user);
      const defaultCredits = isAdmin ? ADMIN_CREDITS : DAILY_FREE_CREDITS;
      if (isAdmin || !shouldResetDemoCredits()) {
        setBalance(getDemoCredits(user?.id));
      } else {
        setBalance(defaultCredits);
        saveDemoCredits(defaultCredits, user?.id);
        setDemoResetTime();
      }
      setPlan('free');
      setLoading(false);
      return;
    }
    
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      if (!accessToken) {
        setBalance(getDemoCredits(user.id));
        setPlan('free');
        setLoading(false);
        return;
      }

      const client = await getSupabaseClient(accessToken);
      const { data: sub } = await client
        .from('subscriptions')
        .select('plan_type, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();
      setPlan(sub?.plan_type || 'free');
      const quota = quotaFor(sub?.plan_type, isLegacyPaidRow(sub?.plan_type, periodEndOf(sub)));
      const dailyCredits = isAdminUser(user) ? ADMIN_CREDITS : quota.amount;

      const { data, error } = await client
        .from('credits')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        // Network error - fall back to demo mode
        console.warn('Credits fetch failed, using demo mode');
        setBalance(getDemoCredits(user?.id));
        setLoading(false);
        return;
      }
      
      if (data) {
        if (!isAdminUser(user) && hasQuotaCrossed(quota.period, data.last_reset_at)) {
          await refreshCredits();
        } else {
          setBalance(isAdminUser(user) ? Math.max(data.balance, ADMIN_CREDITS) : data.balance);
        }
      } else {
        // Create credits record for new user
        const { data: newCredits, error: insertError } = await client
          .from('credits')
          .insert({
            user_id: user.id,
            balance: dailyCredits,
          })
          .select()
          .single();
        
        if (insertError) {
          console.warn('Credits creation failed, using demo mode');
          setBalance(dailyCredits);
        } else if (newCredits) {
          setBalance(newCredits.balance);
        }
      }
    } catch (error) {
      // Network error - fall back to demo mode silently
      console.warn('Credits fetch error, using demo mode');
      setBalance(getDemoCredits());
    } finally {
      setLoading(false);
    }
  }

  async function refreshCredits() {
    if (!user) return;

    // Demo mode
    if (!isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-')) {
      const isAdmin = isAdminUser(user);
      const resetAmount = isAdmin ? ADMIN_CREDITS : DAILY_FREE_CREDITS;
      setBalance(resetAmount);
      saveDemoCredits(resetAmount, user.id);
      setDemoResetTime();
      setPlan('free');
      return resetAmount;
    }

    try {
      if (!accessToken) return balance;
      const client = await getSupabaseClient(accessToken);

      if (isAdminUser(user)) {
        const adminBalance = Math.max(balance, ADMIN_CREDITS);
        setBalance(adminBalance);
        setPlan('pro');
        return adminBalance;
      }

      const { data: sub } = await client
        .from('subscriptions')
        .select('plan_type, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();
      setPlan(sub?.plan_type || 'free');
      const plan = sub?.plan_type ?? null;
      const quota = quotaFor(plan, isLegacyPaidRow(plan, periodEndOf(sub)));
      const dailyCredits = quota.amount;

      // 先查询当前 credits 行（避免每次都重置）
      const { data: existingRow, error: queryError } = await client
        .from('credits')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (queryError) {
        console.warn('Credits query error:', queryError.message);
        // 查询失败（可能是 RLS 限制或多行）：回退到计划额度显示，让服务端处理
        setBalance(dailyCredits);
        return dailyCredits;
      }

      // 仅在跨过当前计费周期边界时重置（免费档按日 / 付费档按月），避免每次点击 Generate 都重置
      const shouldReset = !existingRow || hasQuotaCrossed(quota.period, existingRow.last_reset_at);
      const resetAt = resetBoundary(quota.period, new Date());

      if (!existingRow) {
        // 新用户：尝试插入（若 RLS 阻止也无妨，服务端会用 service role 处理）
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
          console.warn('Credits insert blocked (likely RLS), using local value:', insertError.message);
          setBalance(dailyCredits);
          return dailyCredits;
        }
        if (newRow) {
          setBalance(newRow.balance);
          try {
            await client.from('credit_transactions').insert({
              user_id: user.id,
              amount: dailyCredits,
              type: quotaTransactionType(quota.period),
              description: quotaResetDescription(plan, quota, true),
            });
          } catch {}
          return newRow.balance;
        }
      } else if (shouldReset) {
        // 跨周期重置
        const { data, error } = await client
          .from('credits')
          .update({
            balance: dailyCredits,
            last_reset_at: resetAt,
          })
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) {
          console.warn('Credits refresh failed, using existing balance');
          setBalance(existingRow.balance);
          return existingRow.balance;
        }

        if (data) {
          setBalance(data.balance);
          try {
            await client.from('credit_transactions').insert({
              user_id: user.id,
              amount: dailyCredits,
              type: quotaTransactionType(quota.period),
              description: quotaResetDescription(plan, quota),
            });
          } catch {}
          return data.balance;
        }
      } else {
        // 同一周期内：直接使用现有余额
        setBalance(existingRow.balance);
        return existingRow.balance;
      }
    } catch (error) {
      console.warn('Credits refresh error, using local value');
      setBalance(DAILY_FREE_CREDITS);
      return DAILY_FREE_CREDITS;
    }
    return balance;
  }

  async function deductCredits(amount: number): Promise<boolean> {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    if (balance < amount) return false;

    // Demo mode
    if (!isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-')) {
      const newBalance = balance - amount;
      setBalance(newBalance);
      saveDemoCredits(newBalance, user.id);
      return true;
    }
    
    try {
      if (!accessToken) return false;
      const client = await getSupabaseClient(accessToken);
      const newBalance = balance - amount;
      
      const { error } = await client
        .from('credits')
        .update({ balance: newBalance })
        .eq('user_id', user.id);
      
      if (error) {
        console.warn('Credits deduction failed, updating locally');
        setBalance(newBalance);
        saveDemoCredits(newBalance, user.id);
        return true;
      }
      
      setBalance(newBalance);
      
      // Log transaction
      try {
        await client.from('credit_transactions').insert({
          user_id: user.id,
          amount: -amount,
          type: 'video_process',
          description: 'Video processing',
        });
      } catch {
        // Ignore transaction log errors
      }
      
      return true;
    } catch (error) {
      console.warn('Credits deduction error, updating locally');
      const newBalance = balance - amount;
      setBalance(newBalance);
      saveDemoCredits(newBalance, user.id);
      return true;
    }
  }

  return (
    <CreditsContext.Provider value={{ balance, loading, plan, refreshCredits, deductCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditsContext);
  if (context === undefined) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
}
