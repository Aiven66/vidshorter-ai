'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url === '' || anonKey === '') return false;
  return true;
}

function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || '',
  };
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
  signIn: (email: string, password: string) => Promise<{ error: string | null; token?: string | null; email?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null; token?: string | null; email?: string }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_KEY = 'clipop_demo_user';
const DEMO_REGISTERED_USERS_KEY = 'clipop_registered_users';

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
  'admin': { password: 'admin123', name: 'Admin', email: 'admin@clipop.ai' },
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
    const client = await getSupabaseClient(token);
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
  } catch {
    return null;
  }
}

function generateDemoToken(user: User): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT', demo: true }));
  const payload = btoa(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar_url: user.avatarUrl,
    iss: 'clipop-demo',
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }));
  const signature = 'demo-signature';
  return `${header}.${payload}.${signature}`;
}

function isDemoToken(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    return payload?.demo === true;
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createUserFromJwt(token: string): User | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const email = typeof payload.email === 'string' ? payload.email : '';
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) return null;
  const userMetadata = (
    payload.user_metadata && typeof payload.user_metadata === 'object'
      ? payload.user_metadata
      : {}
  ) as Record<string, unknown>;
  const metadataName = typeof userMetadata.name === 'string' ? userMetadata.name : null;
  const fullName = typeof payload.full_name === 'string' ? payload.full_name : null;
  const role = typeof payload.role === 'string' ? payload.role : 'user';
  const metadataAvatar = typeof userMetadata.avatar_url === 'string' ? userMetadata.avatar_url : null;
  const avatarUrl = typeof payload.avatar_url === 'string' ? payload.avatar_url : null;
  return {
    id: sub,
    email,
    name: metadataName || fullName || email.split('@')[0],
    role,
    avatarUrl: metadataAvatar || avatarUrl,
  };
}

function applyDesktopToken(
  token: string,
  setUser: (u: User | null) => void,
  setAccessToken: (t: string | null) => void,
  setLoading: (l: boolean) => void,
  setUseDemo?: (d: boolean) => void
) {
  if (!token) return;

  localStorage.setItem('clipop_access_token', token);

  if (isDemoToken(token)) {
    const jwtUser = createUserFromJwt(token);
    if (jwtUser) {
      setAccessToken(token);
      setUser(jwtUser);
      if (setUseDemo) setUseDemo(true);
      setLoading(false);
    }
    return;
  }

  const jwtUser = createUserFromJwt(token);
  if (jwtUser) {
    setAccessToken(token);
    setUser(jwtUser);
    setLoading(false);

    verifyTokenAndFetchUser(token).then((userData) => {
      if (userData) setUser(userData);
    }).catch(() => {});
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);
  const initializedRef = useRef(false);

  const checkAuthState = useCallback(async () => {
    try {
      const isDesktop = !!(window.clipopDesktop || window.electronAPI);

      if (isDesktop) {
        let token: string | null = null;

        if (typeof window !== 'undefined' && window.localStorage) {
          const storedToken = localStorage.getItem('clipop_access_token');
          if (storedToken) token = storedToken;
        }

        if (!token && (window as any).__clipopDesktopToken) {
          token = (window as any).__clipopDesktopToken;
        }

        if (!token && window.electronAPI?.getAuthToken) {
          token = await window.electronAPI.getAuthToken();
        }

        if (!token && (window as any).api?.getAuthToken) {
          token = await (window as any).api.getAuthToken();
        }

        if (token) {
          if (isDemoToken(token)) {
            const jwtUser = createUserFromJwt(token);
            if (jwtUser) {
              setAccessToken(token);
              setUser(jwtUser);
              setUseDemo(true);
              setLoading(false);
              return;
            }
          } else {
            const jwtUser = createUserFromJwt(token);
            if (jwtUser) {
              setAccessToken(token);
              setUser(jwtUser);
              setLoading(false);
              verifyTokenAndFetchUser(token).then((userData) => {
                if (userData) setUser(userData);
              }).catch(() => {});
              return;
            }
          }
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

      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();

      if (session?.user) {
        setAccessToken(session.access_token || null);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', session.access_token || '');
        }
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
    } catch {
      const demoUser = getDemoUser();
      if (demoUser) {
        setUser(demoUser);
        setUseDemo(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let desktopHandler: ((event: Event) => void) | null = null;
    let authChangeHandler: (() => void) | null = null;

    const init = () => {
      const handleOAuthCallback = async () => {
        if (typeof window === 'undefined') return;

        const hash = window.location.hash;
        const search = window.location.search;
        const params = new URLSearchParams();

      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const oauthError = hashParams.get('error');

        if (oauthError) {
          setError(`Login failed: ${oauthError}`);
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        if (accessToken && refreshToken) {
          try {
            const client = await getSupabaseClient();
            const { data, error: sessionError } = await client.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              setError(`Login failed: ${sessionError.message}`);
            } else if (data?.session) {
              setAccessToken(data.session.access_token);
              localStorage.setItem('clipop_access_token', data.session.access_token);

              const user = data.session.user;
              if (user) {
                const { data: userData } = await client
                  .from('users')
                  .select('*')
                  .eq('id', user.id)
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
                    id: user.id,
                    email: user.email || '',
                    name: user.user_metadata?.name || null,
                    role: 'user',
                    avatarUrl: user.user_metadata?.avatar_url || null,
                  });

                  try {
                    await client.from('users').insert({
                      id: user.id,
                      email: user.email!,
                      name: user.user_metadata?.name || user.email?.split('@')[0],
                      role: 'user',
                      google_id: user.app_metadata?.provider === 'google' ? user.id : null,
                    });
                    await client.from('credits').insert({ user_id: user.id, balance: 100 });
                    await client.from('subscriptions').insert({ user_id: user.id, plan_type: 'free', status: 'active' });
                  } catch {}
                }
              }

              window.history.replaceState(null, '', window.location.pathname);
              window.dispatchEvent(new Event('clipop-auth-change'));

              if (window.location.pathname === '/login' || window.location.pathname === '/register') {
                window.location.href = '/';
                return;
              }

              return;
            }
          } catch {}
        }
      }

      const errorSearch = new URLSearchParams(search).get('error');
      if (errorSearch) {
        setError(`Login failed: ${errorSearch}`);
        return;
      }

      if (!hash || !params.get('access_token')) {
        checkAuthState();
      }
    };

    handleOAuthCallback();

    desktopHandler = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail?.token) {
        applyDesktopToken(detail.token, setUser, setAccessToken, setLoading, setUseDemo);
      }
    };

    authChangeHandler = () => {
      checkAuthState();
    };

    window.addEventListener('clipop-desktop-login', desktopHandler);
    window.addEventListener('clipop-auth-change', authChangeHandler);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(init);
    } else {
      setTimeout(init, 100);
    }

    return () => {
      if (desktopHandler) window.removeEventListener('clipop-desktop-login', desktopHandler);
      if (authChangeHandler) window.removeEventListener('clipop-auth-change', authChangeHandler);
    };
  }, [checkAuthState]);

  async function signIn(email: string, password: string) {
    setError(null);

    if (!isSupabaseConfigured() || useDemo) {
      if (isDemoAdmin(email, password)) {
        const adminUser = getDemoAdminUser(email);
        const demoToken = generateDemoToken(adminUser);
        setUser(adminUser);
        saveDemoUser(adminUser);
        setUseDemo(true);
        setAccessToken(demoToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', demoToken);
        }
        return { error: null, token: demoToken, email: adminUser.email };
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
        const demoToken = generateDemoToken(demoUser);
        setUser(demoUser);
        saveDemoUser(demoUser);
        setUseDemo(true);
        setAccessToken(demoToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', demoToken);
        }
        return { error: null, token: demoToken, email: demoUser.email };
      }
      return { error: 'Invalid email or password. Please register an account first.', token: null };
    }

    try {
      const client = await getSupabaseClient();
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
          localStorage.setItem('clipop_access_token', token);
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
      const demoToken = generateDemoToken(demoUser);
      saveRegisteredUser({ id: userId, email, password, name });
      setUser(demoUser);
      saveDemoUser(demoUser);
      setUseDemo(true);
      setAccessToken(demoToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('clipop_access_token', demoToken);
      }
      return { error: null, token: demoToken, email: demoUser.email };
    }

    try {
      const client = await getSupabaseClient();
      const { error: authError } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (authError) {
        if (
          authError.message.includes('already registered') ||
          authError.message.includes('user already exists') ||
          authError.message.includes('email already in use')
        ) {
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

      const { data: { session } } = await client.auth.getSession();
      if (session) {
        const token = session.access_token || null;
        setAccessToken(token);
        if (token && typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', token);
        }
        const userData = await verifyTokenAndFetchUser(session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, email: session.user.email || email };
      }

      const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (!signInError && signInData.session) {
        const token = signInData.session.access_token || null;
        setAccessToken(token);
        if (token && typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', token);
        }
        const userData = await verifyTokenAndFetchUser(signInData.session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, email: signInData.session.user?.email || email };
      }

      return { error: null, token: null };
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

    const { url, anonKey } = getSupabaseCredentials();

    if (!url || url === '' || url === 'https://placeholder.supabase.co' ||
        !anonKey || anonKey === '' || anonKey === 'placeholder-key') {
      const msg = 'Google login is not configured. Please contact the administrator.';
      setError(msg);
      return { error: msg };
    }

    try {
      const client = await getSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const fromDesktop = params.get('from') === 'desktop';
      const callbackParam = params.get('callback') || '';

      const redirectUrl = fromDesktop
        ? `${window.location.origin}/desktop/callback?from=desktop${callbackParam ? `&callback=${encodeURIComponent(callbackParam)}` : ''}`
        : `${window.location.origin}/auth/callback`;

      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          scopes: 'email profile',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError) {
        const msg = `Google login failed: ${oauthError.message}`;
        setError(msg);
        return { error: msg };
      }

      if (data?.url) {
        window.location.href = data.url;
        return { error: null };
      }

      const msg = 'Google login failed. Please try again.';
      setError(msg);
      return { error: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google login failed.';
      setError(msg);
      return { error: msg };
    }
  }

  function clearError() {
    setError(null);
  }

  async function signOut() {
    if (useDemo) {
      clearDemoUser();
      setUser(null);
      setAccessToken(null);
      return;
    }

    try {
      const isDesktop = !!(window.clipopDesktop || window.electronAPI);
      if (isDesktop) {
        if ((window as any).api?.clearAuthToken) {
          await (window as any).api.clearAuthToken();
        } else if (window.electronAPI?.clearAuthToken) {
          await window.electronAPI.clearAuthToken();
        }
        localStorage.removeItem('clipop_access_token');
      }

      const client = await getSupabaseClient();
      await client.auth.signOut();
      setUser(null);
      setAccessToken(null);
    } catch {
    }
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, error, signIn, signUp, signInWithGoogle, signOut, clearError }}>
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
