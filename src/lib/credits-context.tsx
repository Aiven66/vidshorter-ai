'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';
import { useAuth } from './auth-context';

interface CreditsContextType {
  balance: number;
  loading: boolean;
  refreshCredits: () => Promise<void>;
  deductCredits: (amount: number) => Promise<boolean>;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

// Demo mode credits storage – keyed per user
const DEMO_CREDITS_KEY = 'vidshorter_demo_credits';
const DEMO_CREDITS_RESET_KEY = 'vidshorter_demo_credits_reset';

function getDemoCreditsKey(userId?: string): string {
  return userId ? `vidshorter_demo_credits_${userId}` : DEMO_CREDITS_KEY;
}

function getDemoCredits(userId?: string): number {
  if (typeof window === 'undefined') return 300;
  const stored = localStorage.getItem(getDemoCreditsKey(userId));
  if (stored) return parseInt(stored, 10);
  // Legacy shared key migration
  const legacy = localStorage.getItem(DEMO_CREDITS_KEY);
  return legacy ? parseInt(legacy, 10) : 300;
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
  
  // Reset at 8 AM
  const resetTime = new Date(now);
  resetTime.setHours(8, 0, 0, 0);
  
  return now >= resetTime && resetDate < resetTime;
}

function setDemoResetTime() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_CREDITS_RESET_KEY, new Date().toISOString());
}

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // Admin always gets 10000 credits
      const isAdmin = user.role === 'admin';
      const defaultCredits = isAdmin ? 10000 : 300;
      const useDemoMode = !isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-');

      if (useDemoMode) {
        const existingBalance = getDemoCredits(user.id);
        // Admin: set to 10000 if they don't already have more (or first login)
        if (isAdmin) {
          const adminBalance = Math.max(existingBalance, 10000);
          // Initialize admin credits if this is first time or they have less than 10000
          if (!localStorage.getItem(getDemoCreditsKey(user.id))) {
            setBalance(10000);
            saveDemoCredits(10000, user.id);
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
  }, [user]);

  async function fetchCredits() {
    // Check configuration directly
    if (!isSupabaseConfigured()) {
      const isAdmin = user?.role === 'admin';
      const defaultCredits = isAdmin ? 10000 : 300;
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
      const client = getSupabaseClient(user.id);
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
        // Check if we need to reset daily credits
        const lastReset = new Date(data.last_reset_at);
        const now = new Date();
        const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceReset >= 24) {
          // Reset credits
          await refreshCredits();
        } else {
          setBalance(data.balance);
        }
      } else {
        // Create credits record for new user
        const { data: newCredits, error: insertError } = await client
          .from('credits')
          .insert({
            user_id: user.id,
            balance: 300,
          })
          .select()
          .single();
        
        if (insertError) {
          console.warn('Credits creation failed, using demo mode');
          setBalance(300);
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
      const resetAmount = isAdmin ? 10000 : 300;
      setBalance(resetAmount);
      saveDemoCredits(resetAmount, user.id);
      setDemoResetTime();
      return;
    }
    
    try {
      const client = getSupabaseClient(user.id);
      const now = new Date();
      now.setHours(8, 0, 0, 0); // Set to 8:00 AM
      
      const { data, error } = await client
        .from('credits')
        .update({
          balance: 300,
          last_reset_at: now.toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();
      
      if (error) {
        console.warn('Credits refresh failed, using local value');
        setBalance(300);
        return;
      }
      
      if (data) {
        setBalance(data.balance);
        
        // Log transaction
        try {
          await client.from('credit_transactions').insert({
            user_id: user.id,
            amount: 300,
            type: 'daily_reset',
            description: 'Daily credits reset',
          });
        } catch {
          // Ignore transaction log errors
        }
      }
    } catch (error) {
      console.warn('Credits refresh error, using local value');
      setBalance(300);
    }
  }

  async function deductCredits(amount: number): Promise<boolean> {
    if (!user || balance < amount) return false;

    // Demo mode
    if (!isSupabaseConfigured() || user.id.startsWith('demo-') || user.id.startsWith('google-demo-')) {
      const newBalance = balance - amount;
      setBalance(newBalance);
      saveDemoCredits(newBalance, user.id);
      return true;
    }
    
    try {
      const client = getSupabaseClient(user.id);
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
