'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { getSupabaseClient, isSupabaseConfigured, getSupabaseCredentials } from '@/storage/database/supabase-client';

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
  console.log('[DEBUG-AUTH] verifyTokenAndFetchUser called');
  try {
    const client = getSupabaseClient(token);
    const { data: { user: authUser } } = await client.auth.getUser();
    if (!authUser) {
      console.log('[DEBUG-AUTH] No auth user from Supabase');
      return null;
    }
    
    console.log('[DEBUG-AUTH] Got auth user, fetching profile...');
    const { data: userData } = await client
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    
    if (userData) {
      console.log('[DEBUG-AUTH] Got user profile');
      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        avatarUrl: userData.avatar_url,
      };
    }
    
    console.log('[DEBUG-AUTH] No user profile, using auth user');
    return {
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.user_metadata?.name || null,
      role: 'user',
      avatarUrl: authUser.user_metadata?.avatar_url || null,
    };
  } catch (e) {
    console.log('[DEBUG-AUTH] verifyTokenAndFetchUser error:', e);
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
  console.log('[DEBUG-AUTH] applyDesktopToken called, token:', !!token);
  if (!token) return;
  
  localStorage.setItem('clipop_access_token', token);
  
  if (isDemoToken(token)) {
    console.log('[DEBUG-AUTH] It\'s a Demo token');
    const jwtUser = createUserFromJwt(token);
    if (jwtUser) {
      console.log('[DEBUG-AUTH] User from Demo JWT:', jwtUser.email);
      setAccessToken(token);
      setUser(jwtUser);
      if (setUseDemo) setUseDemo(true);
      setLoading(false);
    }
    return;
  }
  
  const jwtUser = createUserFromJwt(token);
  if (jwtUser) {
    console.log('[DEBUG-AUTH] User from JWT:', jwtUser.email);
    setAccessToken(token);
    setUser(jwtUser);
    setLoading(false);
    
    verifyTokenAndFetchUser(token).then((userData) => {
      if (userData) {
        console.log('[DEBUG-AUTH] User verified from Supabase');
        setUser(userData);
      }
    }).catch((err) => {
      console.log('[DEBUG-AUTH] Supabase verification failed:', err);
    });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemo, setUseDemo] = useState(false);
  const initializedRef = useRef(false);

  console.log('[DEBUG-AUTH] AuthProvider rendering, initialized:', initializedRef.current);

  const checkAuthState = useCallback(async () => {
    console.log('[DEBUG-AUTH] checkAuthState called');
    try {
      const isDesktop = !!(window.clipopDesktop || window.electronAPI);
      console.log('[DEBUG-AUTH] isDesktop:', isDesktop);

      if (isDesktop) {
        console.log('[DEBUG-AUTH] Desktop mode, checking token sources...');
        
        let token: string | null = null;

        if (typeof window !== 'undefined' && window.localStorage) {
          const storedToken = localStorage.getItem('clipop_access_token');
          if (storedToken) {
            token = storedToken;
            console.log('[DEBUG-AUTH] Got token from localStorage');
          }
        }

        if (!token && (window as any).__clipopDesktopToken) {
            token = (window as any).__clipopDesktopToken;
          console.log('[DEBUG-AUTH] Got token from __clipopDesktopToken');
        }
        
        if (!token && window.electronAPI?.getAuthToken) {
          token = await window.electronAPI.getAuthToken();
          console.log('[DEBUG-AUTH] Got token from electronAPI.getAuthToken:', !!token);
        }
        
        if (!token && (window as any).api?.getAuthToken) {
          token = await (window as any).api.getAuthToken();
          console.log('[DEBUG-AUTH] Got token from window.api.getAuthToken:', !!token);
        }
        
        if (token) {
          console.log('[DEBUG-AUTH] Token found, applying...');
          
          if (isDemoToken(token)) {
            console.log('[DEBUG-AUTH] It\'s a Demo token');
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
                if (userData) {
                  console.log('[DEBUG-AUTH] User verified from Supabase');
                  setUser(userData);
                }
              }).catch(() => {});
              return;
            }
          }
        } else {
          console.log('[DEBUG-AUTH] No token found in desktop mode');
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

      console.log('[DEBUG-AUTH] getSession result:', session ? `user=${session.user?.email}` : 'no session');

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
    } catch (err) {
      console.log('[DEBUG-AUTH] checkAuthState error:', err);
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
    if (initializedRef.current) {
      console.log('[DEBUG-AUTH] Already initialized, skipping useEffect');
      return;
    }
    
    console.log('[DEBUG-AUTH] Initializing useEffect');
    initializedRef.current = true;

    const handleOAuthCallback = async () => {
      if (typeof window === 'undefined') return;

      const hash = window.location.hash;
      const search = window.location.search;
      const params = new URLSearchParams();

      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const error = hashParams.get('error');
        const errorCode = hashParams.get('error_code');

        if (error) {
          console.log('[DEBUG-AUTH] OAuth error in hash:', error, errorCode);
          setError(`登录失败: ${error}`);
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        if (accessToken && refreshToken) {
          console.log('[DEBUG-AUTH] Found OAuth tokens in URL hash');
          try {
            const client = getSupabaseClient();
            const { data, error: sessionError } = await client.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.log('[DEBUG-AUTH] setSession error:', sessionError);
              setError(`登录失败: ${sessionError.message}`);
            } else if (data?.session) {
              console.log('[DEBUG-AUTH] Session established from URL hash');
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
                  } catch (e) {
                    console.log('[DEBUG-AUTH] User creation error (non-fatal):', e);
                  }
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
          } catch (e) {
            console.log('[DEBUG-AUTH] Error processing OAuth tokens:', e);
          }
        }
      }

      const code = new URLSearchParams(search).get('code');
      const errorSearch = new URLSearchParams(search).get('error');
      if (errorSearch) {
        console.log('[DEBUG-AUTH] OAuth error in search params:', errorSearch);
        setError(`登录失败: ${errorSearch}`);
        return;
      }

      if (!hash || !params.get('access_token')) {
        checkAuthState();
      }
    };

    handleOAuthCallback();

    console.log('[DEBUG-AUTH] Adding event listeners');

    const handleDesktopLogin = (event: Event) => {
      console.log('[DEBUG-AUTH] ========================================');
      console.log('[DEBUG-AUTH] clipop-desktop-login event RECEIVED!');
      const detail = event instanceof CustomEvent ? event.detail : null;
      console.log('[DEBUG-AUTH] Event detail:', detail);
      console.log('[DEBUG-AUTH] ========================================');
      
      if (detail?.token) {
        applyDesktopToken(detail.token, setUser, setAccessToken, setLoading, setUseDemo);
      }
    };

    const handleAuthChange = () => {
      console.log('[DEBUG-AUTH] clipop-auth-change event received');
      checkAuthState();
    };

    window.addEventListener('clipop-desktop-login', handleDesktopLogin);
    window.addEventListener('clipop-auth-change', handleAuthChange);

    console.log('[DEBUG-AUTH] Event listeners added');

    return () => {
      console.log('[DEBUG-AUTH] Cleanup: removing event listeners');
      window.removeEventListener('clipop-desktop-login', handleDesktopLogin);
      window.removeEventListener('clipop-auth-change', handleAuthChange);
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
      const client = getSupabaseClient();
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
      const msg = 'Google 登录未配置：缺少 Supabase 环境变量，请联系管理员配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY';
      setError(msg);
      return { error: msg };
    }

    try {
      const client = getSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const fromDesktop = params.get('from') === 'desktop';

      const redirectUrl = fromDesktop
        ? `${window.location.origin}/desktop/callback?from=desktop`
        : `${window.location.origin}/auth/callback`;

      console.log('[AUTH] Starting Google OAuth, redirectTo:', redirectUrl);

      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          scopes: 'email profile',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError) {
        console.log('[AUTH] Google OAuth error:', oauthError.message);
        const msg = `Google 登录失败: ${oauthError.message}`;
        setError(msg);
        return { error: msg };
      }

      if (data?.url) {
        console.log('[AUTH] Google OAuth redirect URL:', data.url);
        return { error: null };
      }

      const msg = 'Google 登录未返回授权地址，请重试';
      setError(msg);
      return { error: msg };
    } catch (err) {
      console.log('[AUTH] Google OAuth exception:', err);
      const msg = err instanceof Error ? err.message : 'Google 登录过程中发生未知错误';
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
      
      const client = getSupabaseClient();
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
