'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '@/storage/database/supabase-client';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo user storage key (currently logged-in user)
const DEMO_USER_KEY = 'vidshorter_demo_user';

// Registered users store (all accounts that have signed up)
const DEMO_REGISTERED_USERS_KEY = 'vidshorter_registered_users';

interface RegisteredUser {
  id: string;
  email: string;
  password: string;
  name: string;
}

function getRegisteredUsers(): RegisteredUser[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(DEMO_REGISTERED_USERS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(DEMO_REGISTERED_USERS_KEY);
    return [];
  }
}

function saveRegisteredUser(user: RegisteredUser) {
  if (typeof window === 'undefined') return;
  const users = getRegisteredUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
  if (idx >= 0) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(DEMO_REGISTERED_USERS_KEY, JSON.stringify(users));
}

function findRegisteredUser(email: string, password: string): RegisteredUser | null {
  const users = getRegisteredUsers();
  return users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  ) || null;
}

// Admin credentials in demo mode
const DEMO_ADMINS: Record<string, { password: string; name: string; email: string }> = {
  'admin@126.com': { password: 'admin123', name: 'Admin', email: 'admin@126.com' },
  'admin': { password: 'admin123', name: 'Admin', email: 'admin@vidshorter.ai' },
};

function isDemoAdmin(email: string, password: string): boolean {
  const admin = DEMO_ADMINS[email.toLowerCase()];
  return !!admin && admin.password === password;
}

function getDemoAdminUser(email: string): User {
  const admin = DEMO_ADMINS[email.toLowerCase()];
  return {
    id: 'demo-admin-id',
    email: admin?.email || email,
    name: admin?.name || 'Admin',
    role: 'admin',
    avatarUrl: null,
  };
}

// Get demo user from localStorage
function getDemoUser(): User | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(DEMO_USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(DEMO_USER_KEY);
    return null;
  }
}

// Save demo user to localStorage
function saveDemoUser(user: User) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

// Clear demo user
function clearDemoUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEMO_USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  async function trackSession(token: string) {
    try {
      await fetch('/api/auth/track', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }

  useEffect(() => {
    try {
      const desktop = (window as any)?.vidshorterDesktop;
      if (desktop) {
        setUseDemo(true);
        setUser({
          id: 'demo-desktop-admin',
          email: 'desktop@vidshorter.local',
          name: 'Desktop',
          role: 'admin',
          avatarUrl: null,
        });
        setAccessToken(null);
        setLoading(false);
        return;
      }
    } catch {}

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured. Using demo mode.');
      setUseDemo(true);
      // Check for existing demo user
      const demoUser = getDemoUser();
      if (demoUser) {
        setUser(demoUser);
      }
      setAccessToken(null);
      setLoading(false);
      return;
    }

    // Check for existing session
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();

      if (session?.user) {
        setAccessToken(session.access_token || null);
        if (session.access_token) {
          trackSession(session.access_token);
        }
        // Fetch user data from our users table
        const { data: userData } = await client
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (userData) {
          setUser({
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            avatarUrl: userData.avatar_url,
          });
        } else {
          // User exists in auth but not in our table - create profile
          const newUser = {
            id: session.user.id,
            email: session.user.email!,
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0],
            role: 'user',
          };

          const { data: createdUser } = await client
            .from('users')
            .insert(newUser)
            .select()
            .single();

          if (createdUser) {
            setUser({
              id: createdUser.id,
              email: createdUser.email,
              name: createdUser.name,
              role: createdUser.role,
              avatarUrl: createdUser.avatar_url,
            });

            // Create credits record
            await client.from('credits').insert({
              user_id: createdUser.id,
              balance: 100,
            });

            // Create subscription record
            await client.from('subscriptions').insert({
              user_id: createdUser.id,
              plan_type: 'free',
              status: 'active',
            });
          }
        }
      }
    } catch (err) {
      console.error('Session check error:', err);
      setError('Failed to connect to authentication service');
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    setError(null);

    // ── Demo Mode (no Supabase) ──
    if (!isSupabaseConfigured() || useDemo) {
      // 1. Admin bypass
      if (isDemoAdmin(email, password)) {
        const adminUser = getDemoAdminUser(email);
        setUser(adminUser);
        saveDemoUser(adminUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null };
      }
      // 2. Check registered users store
      const registered = findRegisteredUser(email, password);
      if (registered) {
        const demoUser: User = {
          id: registered.id,
          email: registered.email,
          name: registered.name,
          role: 'user',
          avatarUrl: null,
        };
        setUser(demoUser);
        saveDemoUser(demoUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null };
      }
      // 3. Not found
      return { error: 'Invalid email or password. Please register an account first.' };
    }

    // ── Supabase Mode ──
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.signInWithPassword({ email, password });

      if (error) {
        // Admin bypass even when Supabase is configured
        if (isDemoAdmin(email, password)) {
          const adminUser = getDemoAdminUser(email);
          setUser(adminUser);
          saveDemoUser(adminUser);
          setUseDemo(true);
          setAccessToken(null);
          return { error: null };
        }
        return { error: error.message };
      }

      await checkSession();
      return { error: null };
    } catch (err) {
      console.error('Sign in error:', err);
      // Network fallback: allow admin or registered users only
      if (isDemoAdmin(email, password)) {
        const adminUser = getDemoAdminUser(email);
        setUser(adminUser);
        saveDemoUser(adminUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null };
      }
      const registered = findRegisteredUser(email, password);
      if (registered) {
        const demoUser: User = {
          id: registered.id,
          email: registered.email,
          name: registered.name,
          role: 'user',
          avatarUrl: null,
        };
        setUser(demoUser);
        saveDemoUser(demoUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null };
      }
      return { error: 'Network error. Please try again later.' };
    }
  }

  async function signUp(email: string, password: string, name: string) {
    setError(null);

    // ── Demo Mode ──
    if (!isSupabaseConfigured() || useDemo) {
      // Check if email already registered
      const existingUsers = getRegisteredUsers();
      const existing = existingUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return { error: 'This email is already registered. Please sign in.' };
      }

      const userId = `demo-${Date.now()}`;
      const demoUser: User = {
        id: userId,
        email,
        name,
        role: 'user',
        avatarUrl: null,
      };
      // Persist to registered users store
      saveRegisteredUser({ id: userId, email, password, name });
      setUser(demoUser);
      saveDemoUser(demoUser);
      setUseDemo(true);
      setAccessToken(null);
      return { error: null };
    }

    // ── Supabase Mode ──
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (error) {
        // If Supabase fails, fall back to demo mode
        console.warn('Supabase signup failed, falling back to demo mode:', error.message);
        const userId = `demo-${Date.now()}`;
        const demoUser: User = {
          id: userId,
          email,
          name,
          role: 'user',
          avatarUrl: null,
        };
        saveRegisteredUser({ id: userId, email, password, name });
        setUser(demoUser);
        saveDemoUser(demoUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null };
      }

      await checkSession();
      return { error: null };
    } catch (err) {
      console.error('Sign up error:', err);
      // Network fallback
      const userId = `demo-${Date.now()}`;
      const demoUser: User = {
        id: userId,
        email,
        name,
        role: 'user',
        avatarUrl: null,
      };
      saveRegisteredUser({ id: userId, email, password, name });
      setUser(demoUser);
      saveDemoUser(demoUser);
      setUseDemo(true);
      setAccessToken(null);
      return { error: null };
    }
  }

  async function signInWithGoogle() {
    setError(null);

    // ── Demo Mode: mock Google sign-in ──
    if (!isSupabaseConfigured() || useDemo) {
      const googleId = `google-demo-${Date.now()}`;
      const googleUser: User = {
        id: googleId,
        email: `google_user_${Date.now().toString().slice(-6)}@gmail.com`,
        name: 'Google User',
        role: 'user',
        avatarUrl: 'https://lh3.googleusercontent.com/a/default-user',
      };
      // Register this Google user so they can "sign in" again via email fallback
      saveRegisteredUser({ id: googleId, email: googleUser.email, password: '', name: 'Google User' });
      setUser(googleUser);
      saveDemoUser(googleUser);
      setUseDemo(true);
      setAccessToken(null);
      return { error: null };
    }

    // ── Supabase Mode ──
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      console.error('Google sign in error:', err);
      return { error: 'Failed to connect to authentication service.' };
    }
  }

  async function signOut() {
    if (useDemo) {
      clearDemoUser();
      setUser(null);
      setAccessToken(null);
      return;
    }

    try {
      const client = getSupabaseClient();
      await client.auth.signOut();
      setUser(null);
      setAccessToken(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, error, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
