'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { useAuth } from './auth-context';

interface CreditsContextType {
  balance: number;
  loading: boolean;
  refreshCredits: () => Promise<number>;
  deductCredits: (amount: number) => Promise<boolean>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

// Demo mode credits storage – keyed per user
const DEMO_CREDITS_KEY = 'vidshorter_demo_credits';
const DEMO_CREDITS_RESET_KEY = 'vidshorter_demo_credits_reset';

const DAILY_FREE_CREDITS = 100;
const DAILY_BASIC_CREDITS = 1000;
const DAILY_PRO_CREDITS = 1_000_000;
const ADMIN_CREDITS = 10_000;

function getDemoCreditsKey(userId?: string): string {
  return userId ? `vidshorter_demo_credits_${userId}` : DEMO_CREDITS_KEY;
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

  function planDailyCredits(planType: string | null | undefined) {
    if (planType === 'basic') return DAILY_BASIC_CREDITS;
    if (planType === 'pro') return DAILY_PRO_CREDITS;
    return DAILY_FREE_CREDITS;
  }

  function utcMidnightIso(now: Date) {
    return new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    )).toISOString();
  }

  function shouldResetUtc(lastResetAt: string) {
    const last = new Date(lastResetAt);
    const now = new Date();
    return (
      now.getUTCFullYear() !== last.getUTCFullYear()
      || now.getUTCMonth() !== last.getUTCMonth()
      || now.getUTCDate() !== last.getUTCDate()
    );
  }

  useEffect(() => {
    if (user) {
      // Admin always gets 10000 credits
      const isAdmin = user.role === 'admin';
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
      const isAdmin = user?.role === 'admin';
      const defaultCredits = isAdmin ? ADMIN_CREDITS : DAILY_FREE_CREDITS;
      if (isAdmin || !shouldResetDemoCredits()) {
        setBalance(getDemoCredits(user?.id));
      } else {
        setBalance(defaultCredits);
        saveDemoCredits(defaultCredits, user?.id);
        setDemoResetTime();
      }
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
        setLoading(false);
        return;
      }

      const client = getSupabaseClient(accessToken);
      const { data: sub } = await client
        .from('subscriptions')
        .select('plan_type')
        .eq('user_id', user.id)
        .maybeSingle();
      const dailyCredits = user.role === 'admin' ? ADMIN_CREDITS : planDailyCredits(sub?.plan_type);

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
        if (user.role !== 'admin' && shouldResetUtc(data.last_reset_at)) {
          await refreshCredits();
        } else {
          setBalance(user.role === 'admin' ? Math.max(data.balance, ADMIN_CREDITS) : data.balance);
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
      const isAdmin = user.role === 'admin';
      const resetAmount = isAdmin ? ADMIN_CREDITS : DAILY_FREE_CREDITS;
      setBalance(resetAmount);
      saveDemoCredits(resetAmount, user.id);
      setDemoResetTime();
      return resetAmount;
    }
    
    try {
      if (!accessToken) return balance;
      const client = getSupabaseClient(accessToken);

      if (user.role === 'admin') {
        const adminBalance = Math.max(balance, ADMIN_CREDITS);
        setBalance(adminBalance);
        return adminBalance;
      }

      const { data: sub } = await client
        .from('subscriptions')
        .select('plan_type')
        .eq('user_id', user.id)
        .maybeSingle();
      const dailyCredits = planDailyCredits(sub?.plan_type);
      const resetAt = utcMidnightIso(new Date());
      
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
        console.warn('Credits refresh failed, using local value');
        setBalance(dailyCredits);
        return dailyCredits;
      }
      
      if (data) {
        setBalance(data.balance);
        
        // Log transaction
        try {
          await client.from('credit_transactions').insert({
            user_id: user.id,
            amount: dailyCredits,
            type: 'daily_reset',
            description: 'Daily credits reset',
          });
        } catch {
          // Ignore transaction log errors
        }
        return data.balance;
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
    if (user.role === 'admin') return true;
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
      const client = getSupabaseClient(accessToken);
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
    <CreditsContext.Provider value={{ balance, loading, refreshCredits, deductCredits }}>
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
