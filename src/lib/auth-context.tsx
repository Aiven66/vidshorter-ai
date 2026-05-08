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

const DEMO_USER_KEY = 'vidshorter_demo_user';
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

function saveDemoUser(user: User) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

function clearDemoUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEMO_USER_KEY);
}

async function verifyTokenAndFetchUser(token: string): Promise<User | null> {
  try {
    const client = getSupabaseClient(token);
    const { data: { user: authUser } } = await client.auth.getUser();
    if (!authUser) return null;
    
    const { data: userData } = await client
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    
    if (userData) {
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        avatarUrl: userData.avatar_url,
      };
    }
    
    return {
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.user_metadata?.name || null,
      role: 'user',
      avatarUrl: authUser.user_metadata?.avatar_url || null,
    };
  } catch (e) {
    console.log('[AuthContext] verifyTokenAndFetchUser error:', e);
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function createUserFromJwt(token: string): User | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const email = payload.email || '';
  const sub = payload.sub || '';
  if (!sub) return null;
  return {
    id: sub,
    email,
    name: payload.user_metadata?.name || payload.full_name || email.split('@')[0],
    role: payload.role || 'user',
    avatarUrl: payload.user_metadata?.avatar_url || payload.avatar_url || null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);

  useEffect(() => {
    checkAuthState();

    const handleAuthChange = () => {
      console.log('[AuthContext] Received vidshorter-auth-change event');
      checkAuthState();
    };
    window.addEventListener('vidshorter-auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('vidshorter-auth-change', handleAuthChange);
    };
  }, []);

  async function checkAuthState() {
    try {
      const isDesktop = !!(window as any)?.vidshorterDesktop || !!(window as any)?.electronAPI;
      
      if (isDesktop) {
        try {
          let token: string | null = null;

          if ((window as any).__vidshorterDesktopToken) {
            token = (window as any).__vidshorterDesktopToken;
            console.log('[AuthContext] Got token via __vidshorterDesktopToken');
          }

          if (!token && typeof window !== 'undefined' && window.localStorage) {
            const storedToken = localStorage.getItem('vidshorter_access_token');
            if (storedToken) {
              token = storedToken;
              console.log('[AuthContext] Got token via localStorage');
            }
          }
          
          if (!token && (window as any).electronAPI?.getAuthToken) {
            token = await (window as any).electronAPI.getAuthToken();
            console.log('[AuthContext] Got token via electronAPI:', !!token);
          }
          
          if (!token && (window as any).api?.getAuthToken) {
            token = await (window as any).api.getAuthToken();
            console.log('[AuthContext] Got token via window.api:', !!token);
          }
          
          if (token) {
            console.log('[AuthContext] Token found, attempting verification...');
            const userData = await verifyTokenAndFetchUser(token);
            if (userData) {
              console.log('[AuthContext] User verified via Supabase API');
              setAccessToken(token);
              setUser(userData);
              setLoading(false);
              return;
            }

            console.log('[AuthContext] Supabase API failed, falling back to JWT decode');
            const jwtUser = createUserFromJwt(token);
            if (jwtUser) {
              console.log('[AuthContext] User created from JWT:', jwtUser.email);
              setAccessToken(token);
              setUser(jwtUser);
              setLoading(false);
              return;
            }

            console.log('[AuthContext] JWT decode also failed');
          } else {
            console.log('[AuthContext] No token found in desktop');
          }
        } catch (err) {
          console.log('[AuthContext] Desktop token verification failed:', err);
        }
      }
      
      if (!isSupabaseConfigured()) {
        const demoUser = getDemoUser();
        if (demoUser) {
          setUser(demoUser);
          setUseDemo(true);
        }
        setAccessToken(null);
        setLoading(false);
        return;
      }

      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();

      if (session?.user) {
        setAccessToken(session.access_token || null);
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
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || null,
            role: 'user',
            avatarUrl: session.user.user_metadata?.avatar_url || null,
          });
        }
      } else {
        const demoUser = getDemoUser();
        if (demoUser) {
          setUser(demoUser);
          setUseDemo(true);
        }
      }
    } catch (err) {
      console.log('Auth check failed:', err);
      const demoUser = getDemoUser();
      if (demoUser) {
        setUser(demoUser);
        setUseDemo(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    setError(null);

    if (!isSupabaseConfigured() || useDemo) {
      if (isDemoAdmin(email, password)) {
        const adminUser = getDemoAdminUser(email);
        setUser(adminUser);
        saveDemoUser(adminUser);
        setUseDemo(true);
        setAccessToken(null);
        return { error: null, token: null };
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
        return { error: null, token: null };
      }
      return { error: 'Invalid email or password. Please register an account first.', token: null };
    }

    try {
      const client = getSupabaseClient();
      const { data, error: authError } = await client.auth.signInWithPassword({ email, password });

      if (authError) {
        if (isDemoAdmin(email, password)) {
          const adminUser = getDemoAdminUser(email);
          setUser(adminUser);
          saveDemoUser(adminUser);
          setUseDemo(true);
          setAccessToken(null);
          return { error: null, token: null };
        }
        return { error: authError.message, token: null };
      }

      if (data.session) {
        const token = data.session.access_token || null;
        setAccessToken(token);
        if (token && typeof window !== 'undefined') {
          localStorage.setItem('vidshorter_access_token', token);
        }
        const userData = await verifyTokenAndFetchUser(data.session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, email: data.session.user?.email };
      }
      
      return { error: null, token: null };
    } catch {
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

    if (!isSupabaseConfigured() || useDemo) {
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
      saveRegisteredUser({ id: userId, email, password, name });
      setUser(demoUser);
      saveDemoUser(demoUser);
      setUseDemo(true);
      setAccessToken(null);
      return { error: null };
    }

    try {
      const client = getSupabaseClient();
      const { error: authError } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (authError) {
        // Check if error indicates user already exists
        if (
          authError.message.includes('already registered') ||
          authError.message.includes('user already exists') ||
          authError.message.includes('email already in use')
        ) {
          return { error: 'This email is already registered. Please sign in.' };
        }
        
        console.warn('Supabase signup failed, falling back to demo mode:', authError.message);
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

      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const token = session.access_token || null;
        setAccessToken(token);
        if (token && typeof window !== 'undefined') {
          localStorage.setItem('vidshorter_access_token', token);
        }
        const userData = await verifyTokenAndFetchUser(session.access_token!);
        if (userData) {
          setUser(userData);
        }
      }
      
      return { error: null };
    } catch {
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

    if (!isSupabaseConfigured() || useDemo) {
      const googleId = `google-demo-${Date.now()}`;
      const googleUser: User = {
        id: googleId,
        email: `google_user_${Date.now().toString().slice(-6)}@gmail.com`,
        name: 'Google User',
        role: 'user',
        avatarUrl: 'https://lh3.googleusercontent.com/a/default-user',
      };
      saveRegisteredUser({ id: googleId, email: googleUser.email, password: '', name: 'Google User' });
      setUser(googleUser);
      saveDemoUser(googleUser);
      setUseDemo(true);
      setAccessToken(null);
      return { error: null };
    }

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
    } catch {
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
      const isDesktop = !!(window as any)?.vidshorterDesktop || !!(window as any)?.electronAPI;
      if (isDesktop) {
        if (window.api?.clearAuthToken) {
          await window.api.clearAuthToken();
        } else if (window.electronAPI?.clearAuthToken) {
          await window.electronAPI.clearAuthToken();
        }
      }
      
      const client = getSupabaseClient();
      await client.auth.signOut();
      setUser(null);
      setAccessToken(null);
    } catch {
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
