'use client';

/**
 * @clipop/auth - AuthProvider
 *
 * Universal authentication context for Supabase + desktop bridges.
 *
 * Features:
 *   - Email/password sign-in & sign-up (Supabase)
 *   - Google OAuth (PKCE implicit flow, desktop-aware redirect)
 *   - Demo fallback when Supabase is not configured
 *   - Desktop token bridge (Electron / Tauri / WebView)
 *   - localStorage + cookie persistence (Max-Age=604800, SameSite=Lax)
 *   - Custom-event sync (`app-auth-change` / `app-auth-session` / `app-desktop-login`)
 *
 * All configuration is read from `useAppConfig()` — never from process.env.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AppUser } from '../core/types';
import { useAppConfig, type AppConfig } from '../core/config';
import {
  getClientWithToken,
  getSupabaseClient,
  isSupabaseConfigured,
} from '../core/supabase';
import { decodeJwt, isDemoJwt } from '../core/utils';
import {
  buildDesktopOAuthRedirectUrl,
  getDesktopBridge,
  getDesktopCallbackFromBridge,
  isDesktopRuntime,
} from './desktop-bridge';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Result of a sign-in / sign-up call. */
export interface AuthActionResult {
  error: string | null;
  token?: string | null;
  refreshToken?: string | null;
  email?: string;
}

/** Shape of the auth context exposed by `useAuth()`. */
export interface AuthContextValue {
  user: AppUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string, name: string) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
  /** Apply a token pushed from the desktop bridge. */
  applyDesktopToken: (token: string, refreshToken?: string | null) => void;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ACCESS_TOKEN_KEY = 'app_access_token';
const REFRESH_TOKEN_KEY = 'app_refresh_token';
const DEMO_USER_KEY = 'app_demo_user';
const DEMO_REGISTERED_KEY = 'app_registered_users';

const EVENT_AUTH_CHANGE = 'app-auth-change';
const EVENT_AUTH_SESSION = 'app-auth-session';
const EVENT_DESKTOP_LOGIN = 'app-desktop-login';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface DemoUserRecord {
  id: string;
  email: string;
  password: string;
  name: string;
}

interface DemoJwtPayload {
  sub: string;
  email: string;
  name?: string | null;
  role?: string;
  avatar_url?: string | null;
  iss?: string;
  demo?: boolean;
  user_metadata?: { name?: string; avatar_url?: string };
  full_name?: string;
}

function getRegisteredUsers(): DemoUserRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(DEMO_REGISTERED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(DEMO_REGISTERED_KEY);
    return [];
  }
}

function saveRegisteredUser(user: DemoUserRecord) {
  if (typeof window === 'undefined') return;
  const users = getRegisteredUsers();
  const idx = users.findIndex(
    (u) => u.email.toLowerCase() === user.email.toLowerCase(),
  );
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  localStorage.setItem(DEMO_REGISTERED_KEY, JSON.stringify(users));
}

function findRegisteredUser(email: string, password: string): DemoUserRecord | null {
  return (
    getRegisteredUsers().find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password,
    ) || null
  );
}

function getDemoUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(DEMO_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    localStorage.removeItem(DEMO_USER_KEY);
    return null;
  }
}

function saveDemoUser(user: AppUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
}

function clearDemoUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEMO_USER_KEY);
}

function matchDemoAdmin(
  config: AppConfig,
  email: string,
  password: string,
): AppUser | null {
  const admins = config.demoAdmins || [];
  const match = admins.find(
    (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password,
  );
  if (!match) return null;
  return {
    id: `demo-admin-${match.email}`,
    email: match.email,
    name: match.name,
    role: 'admin',
    avatarUrl: null,
  };
}

/** Build a demo JWT for clients that don't have a real Supabase session. */
function generateDemoToken(user: AppUser): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatarUrl || null,
      iss: 'clipop-demo',
      demo: true,
      exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    }),
  );
  return `${header}.${payload}.demo-signature`;
}

/** Reconstruct an AppUser from a JWT payload. */
function createUserFromJwt(token: string): AppUser | null {
  const payload = decodeJwt<DemoJwtPayload>(token);
  if (!payload) return null;
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) return null;
  const email = typeof payload.email === 'string' ? payload.email : '';
  const userMetadata = (payload.user_metadata || {}) as {
    name?: string;
    avatar_url?: string;
  };
  const role = payload.role === 'admin' ? 'admin' : 'user';
  return {
    id: sub,
    email,
    name:
      userMetadata.name ||
      payload.name ||
      payload.full_name ||
      email.split('@')[0] ||
      'User',
    role,
    avatarUrl: userMetadata.avatar_url || payload.avatar_url || null,
  };
}

function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = secure ? '; Secure' : '';
  const common = `; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secureFlag}`;
  document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(accessToken)}${common}`;
  if (refreshToken) {
    document.cookie = `${REFRESH_TOKEN_KEY}=${encodeURIComponent(refreshToken)}${common}`;
  }
}

function clearAuthCookies() {
  if (typeof document === 'undefined') return;
  document.cookie = `${ACCESS_TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
  document.cookie = `${REFRESH_TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
}

function clearLocalAuthStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(DEMO_USER_KEY);
  clearAuthCookies();
  const w = window as unknown as Record<string, string>;
  w.__appDesktopToken = '';
  w.__appDesktopRefreshToken = '';
  w.__appDesktopEmail = '';
  w.__appDesktopUserId = '';
  w.__appDesktopName = '';
}

/** Ask every desktop bridge to forget its cached token. */
async function clearDesktopNativeAuth() {
  if (typeof window === 'undefined') return;
  const bridge = getDesktopBridge();
  if (!bridge?.clearAuthToken) return;
  try {
    await Promise.race([
      Promise.resolve(bridge.clearAuthToken()),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch {
    // ignore — desktop shell may already be gone
  }
}

/** Fetch the users row for an authenticated Supabase user. */
async function fetchUserFromDb(
  config: AppConfig,
  token: string,
): Promise<AppUser | null> {
  try {
    const client = getClientWithToken(config, token);
    const { data: authUser } = await client.auth.getUser(token);
    if (!authUser) return null;

    const { data: row } = await client
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (row) {
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role === 'admin' ? 'admin' : 'user',
        avatarUrl: row.avatar_url || null,
        googleId: row.google_id || null,
      };
    }

    return {
      id: authUser.id,
      email: authUser.email || '',
      name:
        (authUser.user_metadata?.name as string | undefined) ||
        authUser.email?.split('@')[0] ||
        null,
      role: 'user',
      avatarUrl:
        (authUser.user_metadata?.avatar_url as string | undefined) || null,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const config = useAppConfig();
  const [user, setUser] = useState<AppUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const initializedRef = useRef(false);

  /* ------------------------------------------------------------ */
  /* Token application                                            */
  /* ------------------------------------------------------------ */

  const applyDesktopToken = useCallback(
    (token: string, newRefreshToken?: string | null) => {
      if (!token) return;
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        if (newRefreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
        setAuthCookies(token, newRefreshToken);
      }

      const isDemo = isDemoJwt(token);
      const jwtUser = createUserFromJwt(token);
      if (jwtUser) {
        setAccessToken(token);
        setRefreshToken(newRefreshToken || null);
        setUser(jwtUser);
        setIsDemoMode(isDemo);
        setLoading(false);
      }

      // If real Supabase token, hydrate full DB record in the background.
      if (!isDemo && isSupabaseConfigured(config)) {
        fetchUserFromDb(config, token)
          .then((dbUser) => {
            if (dbUser) {
              setUser(dbUser);
              setAccessToken(token);
            }
          })
          .catch(() => {
            /* non-fatal */
          });
      }
    },
    [config],
  );

  /* ------------------------------------------------------------ */
  /* Initial auth state bootstrap                                 */
  /* ------------------------------------------------------------ */

  const checkAuthState = useCallback(async () => {
    try {
      // Desktop runtime: try multi-source token resolution first.
      if (isDesktopRuntime()) {
        let token: string | null = null;

        if (typeof window !== 'undefined' && window.localStorage) {
          token = localStorage.getItem(ACCESS_TOKEN_KEY) || null;
        }

        const w = window as unknown as Record<string, string | undefined>;
        if (!token && w.__appDesktopToken) token = w.__appDesktopToken!;

        const bridge = getDesktopBridge();
        if (!token && bridge?.getAuthToken) {
          try {
            token = await bridge.getAuthToken();
          } catch {
            /* ignore */
          }
        }

        if (token) {
          applyDesktopToken(token, localStorage.getItem(REFRESH_TOKEN_KEY));
          return;
        }
      }

      // Web runtime with Supabase configured.
      if (isSupabaseConfigured(config)) {
        const client = getSupabaseClient(config);
        const { data: { session } } = await client.auth.getSession();
        if (session?.user) {
          const token = session.access_token || null;
          const rToken = session.refresh_token || null;
          setAccessToken(token);
          setRefreshToken(rToken);
          if (typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_TOKEN_KEY, token || '');
            if (rToken) localStorage.setItem(REFRESH_TOKEN_KEY, rToken);
            setAuthCookies(token || '', rToken);
          }

          const dbUser = await fetchUserFromDb(config, token || '');
          if (dbUser) {
            setUser(dbUser);
          } else {
            const email = session.user.email || '';
            setUser({
              id: session.user.id,
              email,
              name:
                (session.user.user_metadata?.name as string | undefined) ||
                email.split('@')[0] ||
                null,
              role: 'user',
              avatarUrl:
                (session.user.user_metadata?.avatar_url as string | undefined) ||
                null,
            });
          }
          return;
        }
      }

      // Demo fallback (no Supabase configured, or no session).
      const demoUser = getDemoUser();
      const storedToken =
        typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      if (demoUser) {
        setUser(demoUser);
        setIsDemoMode(true);
      }
      if (storedToken) {
        setAccessToken(storedToken);
        setAuthCookies(storedToken);
      }
    } catch {
      // Final fallback: surface any persisted demo user / token.
      const demoUser = getDemoUser();
      const storedToken =
        typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      if (demoUser) {
        setUser(demoUser);
        setIsDemoMode(true);
      }
      if (storedToken) {
        setAccessToken(storedToken);
        setAuthCookies(storedToken);
      }
    } finally {
      setLoading(false);
    }
  }, [applyDesktopToken, config]);

  /* ------------------------------------------------------------ */
  /* Effects: initial bootstrap + event listeners                 */
  /* ------------------------------------------------------------ */

  // Initial auth check — runs once on mount (deferred to idle time).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;
    const init = () => {
      if (cancelled) return;
      checkAuthState();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(init);
    } else {
      setTimeout(init, 100);
    }

    return () => {
      cancelled = true;
    };
  }, [checkAuthState]);

  // Event listeners — registered/cleaned up on every dependency change.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const authChangeHandler = () => {
      checkAuthState();
    };

    const authSessionHandler = async (event: Event) => {
      const detail =
        event instanceof CustomEvent ? (event.detail as { accessToken?: string; refreshToken?: string }) : null;
      const token = typeof detail?.accessToken === 'string' ? detail.accessToken : '';
      const rToken = typeof detail?.refreshToken === 'string' ? detail.refreshToken : '';
      if (!token) return;
      applyDesktopToken(token, rToken || null);
    };

    const desktopLoginHandler = async (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { token?: string; refreshToken?: string })
          : null;
      if (detail?.token) {
        applyDesktopToken(detail.token, detail.refreshToken);
      }
    };

    window.addEventListener(EVENT_AUTH_CHANGE, authChangeHandler);
    window.addEventListener(EVENT_AUTH_SESSION, authSessionHandler);
    window.addEventListener(EVENT_DESKTOP_LOGIN, desktopLoginHandler);

    return () => {
      window.removeEventListener(EVENT_AUTH_CHANGE, authChangeHandler);
      window.removeEventListener(EVENT_AUTH_SESSION, authSessionHandler);
      window.removeEventListener(EVENT_DESKTOP_LOGIN, desktopLoginHandler);
    };
  }, [applyDesktopToken, checkAuthState]);

  /* ------------------------------------------------------------ */
  /* Actions                                                      */
  /* ------------------------------------------------------------ */

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      setError(null);

      // Demo admin path: no Supabase, or already in demo mode.
      if (!isSupabaseConfigured(config) || isDemoMode) {
        const admin = matchDemoAdmin(config, email, password);
        if (admin) {
          const token = generateDemoToken(admin);
          setUser(admin);
          saveDemoUser(admin);
          setIsDemoMode(true);
          setAccessToken(token);
          if (typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            setAuthCookies(token);
          }
          return { error: null, token, email: admin.email };
        }
        const registered = findRegisteredUser(email, password);
        if (registered) {
          const demoUser: AppUser = {
            id: registered.id,
            email: registered.email,
            name: registered.name,
            role: 'user',
            avatarUrl: null,
          };
          const token = generateDemoToken(demoUser);
          setUser(demoUser);
          saveDemoUser(demoUser);
          setIsDemoMode(true);
          setAccessToken(token);
          if (typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
          }
          return { error: null, token, email: demoUser.email };
        }
        return {
          error: 'Invalid email or password. Please register an account first.',
          token: null,
        };
      }

      try {
        const client = getSupabaseClient(config);
        const { data, error: authError } = await client.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          // Last-chance demo admin fallback (e.g. network / config drift).
          const admin = matchDemoAdmin(config, email, password);
          if (admin) {
            const token = generateDemoToken(admin);
            setUser(admin);
            saveDemoUser(admin);
            setIsDemoMode(true);
            setAccessToken(token);
            if (typeof window !== 'undefined') {
              localStorage.setItem(ACCESS_TOKEN_KEY, token);
              setAuthCookies(token);
            }
            return { error: null, token, email: admin.email };
          }
          return { error: authError.message, token: null };
        }

        if (data.session) {
          const token = data.session.access_token || null;
          const rToken = data.session.refresh_token || null;
          setAccessToken(token);
          setRefreshToken(rToken);
          if (token && typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            if (rToken) localStorage.setItem(REFRESH_TOKEN_KEY, rToken);
            setAuthCookies(token, rToken);
          }
          const dbUser = await fetchUserFromDb(config, token || '');
          if (dbUser) setUser(dbUser);
          return { error: null, token, refreshToken: rToken, email: data.session.user?.email };
        }
        return { error: null, token: null };
      } catch {
        return { error: 'Network error. Please try again later.', token: null };
      }
    },
    [config, isDemoMode],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string): Promise<AuthActionResult> => {
      setError(null);

      if (!isSupabaseConfigured(config) || isDemoMode) {
        const existing = getRegisteredUsers().find(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        );
        if (existing) {
          return { error: 'This email is already registered. Please sign in.' };
        }
        const userId = `demo-${Date.now()}`;
        const demoUser: AppUser = {
          id: userId,
          email,
          name,
          role: 'user',
          avatarUrl: null,
        };
        const token = generateDemoToken(demoUser);
        saveRegisteredUser({ id: userId, email, password, name });
        setUser(demoUser);
        saveDemoUser(demoUser);
        setIsDemoMode(true);
        setAccessToken(token);
        if (typeof window !== 'undefined') {
          localStorage.setItem(ACCESS_TOKEN_KEY, token);
        }
        return { error: null, token, email: demoUser.email };
      }

      try {
        const client = getSupabaseClient(config);
        const { data: authData, error: authError } = await client.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });

        if (authError) {
          if (
            authError.message.includes('already registered') ||
            authError.message.includes('user already exists') ||
            authError.message.includes('email already in use')
          ) {
            return { error: 'This email is already registered. Please sign in.' };
          }
          return { error: authError.message };
        }

        // Persist user / credits / subscription rows.
        if (authData?.user) {
          try {
            await client.from('users').upsert(
              {
                id: authData.user.id,
                email,
                name,
                role: 'user',
              },
              { onConflict: 'id' },
            );
            await client.from('credits').insert({
              user_id: authData.user.id,
              balance: config.dailyFreeCredits,
            });
            await client.from('subscriptions').insert({
              user_id: authData.user.id,
              plan_type: 'free',
              status: 'active',
            });
          } catch {
            /* non-fatal — DB rows are best-effort */
          }
        }

        // Try to materialize a session (some Supabase setups auto-confirm).
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          const token = session.access_token || null;
          const rToken = session.refresh_token || null;
          setAccessToken(token);
          setRefreshToken(rToken);
          if (token && typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            if (rToken) localStorage.setItem(REFRESH_TOKEN_KEY, rToken);
          }
          const dbUser = await fetchUserFromDb(config, token || '');
          if (dbUser) setUser(dbUser);
          return { error: null, token, refreshToken: rToken, email: session.user?.email || email };
        }
        return { error: null, token: null };
      } catch {
        return { error: 'Network error. Please try again later.', token: null };
      }
    },
    [config, isDemoMode],
  );

  const signInWithGoogle = useCallback(async (): Promise<{ error: string | null }> => {
    setError(null);

    if (!isSupabaseConfigured(config)) {
      const msg = 'Google login is not configured. Please contact the administrator.';
      setError(msg);
      return { error: msg };
    }

    try {
      const client = getSupabaseClient(config);
      const origin = typeof window !== 'undefined' ? window.location.origin : config.appUrl;

      // Desktop bridge: fetch local callback URL and remember desktop flow.
      let desktopCallbackUrl: string | null = null;
      if (isDesktopRuntime()) {
        desktopCallbackUrl = await getDesktopCallbackFromBridge();
      }

      const redirectUrl = desktopCallbackUrl
        ? buildDesktopOAuthRedirectUrl(
            origin,
            desktopCallbackUrl,
            config.authCallbackPath,
          )
        : `${origin}${config.authCallbackPath || '/auth/callback'}`;

      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          scopes: config.googleOAuthScopes || 'email profile',
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
  }, [config]);

  const signOut = useCallback(async () => {
    clearLocalAuthStorage();
    setIsDemoMode(false);
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setLoading(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(EVENT_AUTH_CHANGE));
    }

    try {
      await clearDesktopNativeAuth();
    } catch {
      /* ignore */
    }

    if (!isDemoMode && isSupabaseConfigured(config)) {
      try {
        const client = getSupabaseClient(config);
        await client.auth.signOut();
      } catch {
        /* ignore */
      }
    }
  }, [config, isDemoMode]);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextValue = {
    user,
    accessToken,
    refreshToken,
    loading,
    error,
    isDemoMode,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    clearError,
    applyDesktopToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Throws if used outside an <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

export default AuthProvider;
