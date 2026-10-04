'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import {
  buildDesktopCallbackPath,
  buildDesktopOAuthRedirectUrl,
  DESKTOP_AUTH_SESSION_KEY,
  DESKTOP_AUTH_STORAGE_KEY,
  DESKTOP_CALLBACK_SESSION_KEY,
  getDesktopCallbackFromBridge,
  getDesktopCallbackFromSearch,
  getDesktopOAuthOrigin,
  isDesktopAuthRequest,
  rememberDesktopAuth,
} from '@/lib/desktop-auth';

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
  signIn: (email: string, password: string) => Promise<{ error: string | null; token?: string | null; refreshToken?: string | null; email?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null; token?: string | null; refreshToken?: string | null; email?: string }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  clearError: () => void;
  // 用 refresh token 刷新会话；成功返回新 access token，失败返回 null。
  // 用于 API 调用收到 401 时无感恢复会话，避免"看似已登录实则过期"。
  refreshSession: () => Promise<string | null>;
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

// Verified admin emails — used when users table doesn't have the record
const ADMIN_EMAILS = new Set(['admin@clipop.ai', 'admin@126.com', 'admin@vidshorter.ai']);

function isDemoAdmin(email: string, password: string): boolean {
  const admin = DEMO_ADMINS[email.toLowerCase()];
  if (!admin) return false;
  if (admin.password === password) return true;
  // admin@126.com 兼容用户习惯的密码 `admin@123`（同时保留旧 `admin123`）。
  if (email.toLowerCase() === 'admin@126.com' && (password === 'admin@123' || password === 'admin123')) return true;
  return false;
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

function clearLocalAuthStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('clipop_access_token');
  localStorage.removeItem('clipop_refresh_token');
  localStorage.removeItem(DEMO_USER_KEY);
  localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
  sessionStorage.removeItem(DESKTOP_AUTH_SESSION_KEY);
  sessionStorage.removeItem(DESKTOP_CALLBACK_SESSION_KEY);
  clearAuthCookies();
  (window as any).__clipopDesktopToken = '';
  (window as any).__clipopDesktopRefreshToken = '';
  (window as any).__clipopDesktopEmail = '';
  (window as any).__clipopDesktopUserId = '';
  (window as any).__clipopDesktopName = '';
}

async function clearDesktopNativeAuth() {
  if (typeof window === 'undefined') return;
  const desktopWindow = window as any;
  const clearers = [
    desktopWindow.clipopDesktop?.clearAuthToken,
    desktopWindow.vidshorterDesktop?.clearAuthToken,
    desktopWindow.electronAPI?.clearAuthToken,
    desktopWindow.api?.clearAuthToken,
    desktopWindow.agent?.clearAuthToken,
  ].filter(Boolean);

  for (const clearAuthToken of clearers) {
    try {
      await Promise.race([
        Promise.resolve(clearAuthToken()),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {}
  }
}

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

/**
 * 服务端兜底建档：调 /api/auth/ensure-profile，用 service role 幂等补齐
 * public.users / credits / subscriptions。
 *
 * 背景：档案行原先完全依赖前端用 anon key 写入且被空 catch 静默吞错，一旦
 * RLS/网络/时序失败，用户就永远不出现在后台「用户管理」。该接口以 Supabase
 * Auth 为身份来源，不受前端 RLS 影响。失败只告警，绝不阻断登录/注册主流程。
 *
 * 返回 true 表示服务端已确认建档；返回 false 时调用方可回落到客户端写入路径。
 */
async function ensureServerProfile(token?: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/auth/ensure-profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[auth] ensure-profile 未成功:', res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[auth] ensure-profile 请求异常:', e);
    return false;
  }
}

/**
 * 传统客户端建档路径（anon key）：仅作为服务端兜底不可用时的回落。
 * 历史上因空 catch 静默失败导致用户漏记，这里把错误显式打出来便于排查。
 */
async function createProfileWithClient(
  client: any,
  authUser: AuthUserLike,
  fallbackName?: string,
): Promise<void> {
  try {
    const email = (authUser.email || '').trim().toLowerCase();
    if (!email) return;

    const meta = authUser.user_metadata || {};
    const provider =
      typeof authUser.app_metadata?.provider === 'string' ? authUser.app_metadata.provider : 'email';
    const name =
      (typeof meta.name === 'string' && meta.name) ||
      fallbackName ||
      email.split('@')[0];

    const { error: userError } = await client.from('users').upsert(
      {
        id: authUser.id,
        email,
        name,
        role: 'user',
        google_id: provider === 'google' ? authUser.id : null,
      },
      { onConflict: 'id' },
    );
    if (userError) {
      // users 行失败则不再写 credits/subscriptions，避免产生悬挂引用。
      console.error('[auth] 客户端补建 users 失败:', userError.message);
      return;
    }

    const { error: creditsError } = await client
      .from('credits')
      .insert({ user_id: authUser.id, balance: 60 });
    if (creditsError && creditsError.code !== '23505') {
      console.error('[auth] 客户端补建 credits 失败:', creditsError.message);
    }

    const { error: subError } = await client
      .from('subscriptions')
      .insert({ user_id: authUser.id, plan_type: 'free', status: 'active' });
    if (subError && subError.code !== '23505') {
      console.error('[auth] 客户端补建 subscriptions 失败:', subError.message);
    }
  } catch (e) {
    console.error('[auth] 客户端补建档案异常:', e);
  }
}

async function verifyTokenAndFetchUser(token: string): Promise<User | null> {
  try {
    const client = await getSupabaseClient(token);
    const { data: { user: authUser } } = await client.auth.getUser(token);
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

    // 档案行缺失 → 服务端兜底补建（service role，幂等）。这保证任何完成注册/登录
    // 的用户都会出现在后台「用户管理」；失败只告警，不阻断前端展示。
    await ensureServerProfile(token);

    return {
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.user_metadata?.name || null,
      role: ADMIN_EMAILS.has((authUser.email || '').toLowerCase()) ? 'admin' : 'user',
      avatarUrl: authUser.user_metadata?.avatar_url || null,
    };
  } catch {
    return null;
  }
}

async function getSignInProviderHint(email: string): Promise<'google' | 'password' | null> {
  try {
    const client = await getSupabaseClient();
    const { data } = await client
      .from('users')
      .select('google_id,password_hash')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (data?.google_id && !data?.password_hash) return 'google';
    if (data?.password_hash) return 'password';
  } catch {}

  return null;
}

function generateDemoToken(user: User): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar_url: user.avatarUrl,
    iss: 'clipop-demo',
    demo: true,
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

function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = secure ? '; Secure' : '';
  const maxAge = '; Max-Age=604800';
  const path = '; Path=/';
  const sameSite = '; SameSite=Lax';

  document.cookie = `clipop_access_token=${encodeURIComponent(accessToken)}${path}${maxAge}${sameSite}${secureFlag}`;
  if (refreshToken) {
    document.cookie = `clipop_refresh_token=${encodeURIComponent(refreshToken)}${path}${maxAge}${sameSite}${secureFlag}`;
  }
}

function clearAuthCookies() {
  if (typeof document === 'undefined') return;
  const path = '; Path=/';
  document.cookie = `clipop_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT${path}`;
  document.cookie = `clipop_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT${path}`;
}

// 中文输入法常见坑：全角字符（ａｄｍｉｎ＠１２３）提交后与真实凭据不匹配，
// Supabase 直接拒绝。登录/注册入口统一做全角→半角归一化 + 去首尾空白。
const FULLWIDTH_RE = /[\uFF01-\uFF5E]/g;
export function normalizeAuthInput(input: string): string {
  if (!input) return input;
  return input
    .replace(FULLWIDTH_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')   // 全角空格
    .trim();
}

// Safari 无痕模式下 localStorage.setItem 会抛 QuotaExceededError；
// 登录已成功却因写缓存失败回退到假登录，是"登录失败"的隐蔽根因。
// 所有 token 持久化必须吞掉存储异常——内存态（supabase client 自身）已有效。
function persistAuthTokens(token: string | null, refreshToken?: string | null) {
  if (typeof window === 'undefined' || !token) return;
  try {
    localStorage.setItem('clipop_access_token', token);
    if (refreshToken) localStorage.setItem('clipop_refresh_token', refreshToken);
  } catch {}
  try { setAuthCookies(token, refreshToken); } catch {}
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
  setUseDemo?: (d: boolean) => void,
  fallbackEmail?: string,
  fallbackUserId?: string,
  fallbackName?: string
) {
  if (!token) return;

  localStorage.setItem('clipop_access_token', token);
  setAuthCookies(token);

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
  } else if (fallbackEmail) {
    setAccessToken(token);
    setUser({
      id: fallbackUserId || '',
      email: fallbackEmail,
      name: fallbackName || fallbackEmail.split('@')[0],
      role: ADMIN_EMAILS.has(fallbackEmail.toLowerCase()) ? 'admin' : 'user',
      avatarUrl: null,
    });
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
      const isDesktop = !!(window.clipopDesktop || window.electronAPI) ||
        (typeof window !== 'undefined' &&
         (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
         window.location.protocol === 'http:');

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

              const storedRefreshToken = typeof window !== 'undefined'
                ? localStorage.getItem('clipop_refresh_token') : null;
              if (storedRefreshToken) {
                try {
                  const client = await getSupabaseClient();
                  await client.auth.setSession({
                    access_token: token,
                    refresh_token: storedRefreshToken,
                  });
                } catch {}
              }

              verifyTokenAndFetchUser(token).then((userData) => {
                if (userData) setUser(userData);
              }).catch(() => {});
              return;
            }
          }
        }
      }

      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/desktop/')) {
        const storedToken = localStorage.getItem('clipop_access_token');
        if (storedToken) {
          const jwtUser = createUserFromJwt(storedToken);
          if (jwtUser) {
            setAccessToken(storedToken);
            setUser(jwtUser);
            setLoading(false);
            verifyTokenAndFetchUser(storedToken).then((userData) => {
              if (userData) setUser(userData);
            }).catch(() => {});
            return;
          }
        }
      }

      if (!isSupabaseConfigured()) {
        const demoUser = getDemoUser();
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem('clipop_access_token') : null;
        if (demoUser) {
          setUser(demoUser);
          setUseDemo(true);
          if (storedToken) {
            setAccessToken(storedToken);
          }
        }
        setLoading(false);
        return;
      }

      const client = await getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();

      if (session?.user) {
        setAccessToken(session.access_token || null);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', session.access_token || '');
          setAuthCookies(session.access_token || '', session.refresh_token);
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
          const email = session.user.email || '';
          // 档案行缺失 → 服务端兜底补建（后台可见性保障），失败不阻断登录。
          await ensureServerProfile(session.access_token);
          setUser({
            id: session.user.id,
            email,
            name: session.user.user_metadata?.name || null,
            role: ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'user',
            avatarUrl: session.user.user_metadata?.avatar_url || null,
          });
        }
      } else {
        // Supabase 没有活跃会话（refresh token 失效/被轮换撤销/过期）。
        // 旧逻辑直接把过期的 storedToken 设为 accessToken，还会把 localStorage
        // 里残留的 demo 用户设为 user —— 页面显示"已登录"但发出的请求会 401
        // ("Your session has expired")。现在按顺序恢复：refresh token 换新会话
        // → 验证 storedToken 仍有效 → 全部失败则清掉本地脏状态，让用户重新登录。
        const storedAccess = typeof window !== 'undefined' ? localStorage.getItem('clipop_access_token') : null;
        const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('clipop_refresh_token') : null;

        let restored = false;
        if (storedAccess && storedRefresh) {
          try {
            const { data: setData, error: setError } = await client.auth.setSession({
              access_token: storedAccess,
              refresh_token: storedRefresh,
            });
            if (!setError && setData?.session) {
              restored = true;
            }
          } catch {}
        } else if (storedRefresh) {
          try {
            const { data: refreshData, error: refreshError } = await client.auth.refreshSession({
              refresh_token: storedRefresh,
            });
            if (!refreshError && refreshData?.session) {
              restored = true;
            }
          } catch {}
        }

        if (restored) {
          // setSession/refreshSession 已写入 supabase 存储；onAuthStateChange
          // 监听器会同步 accessToken/user 并持久化。这里直接重读一次会话，
          // 避免依赖监听器时序。
          const { data: { session: newSession } } = await client.auth.getSession();
          if (newSession?.access_token) {
            setAccessToken(newSession.access_token);
            if (typeof window !== 'undefined') {
              localStorage.setItem('clipop_access_token', newSession.access_token);
              if (newSession.refresh_token) localStorage.setItem('clipop_refresh_token', newSession.refresh_token);
              setAuthCookies(newSession.access_token, newSession.refresh_token);
            }
            const restoredUser = await verifyTokenAndFetchUser(newSession.access_token).catch(() => null);
            if (restoredUser) setUser(restoredUser);
            return;
          }
        }

        if (!restored && storedAccess) {
          // refresh 失败但 access token 可能仍然有效（只是 refresh token 被撤销）
          const userData = await verifyTokenAndFetchUser(storedAccess).catch(() => null);
          if (userData && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(userData.id)) {
            setAccessToken(storedAccess);
            setAuthCookies(storedAccess);
            setUser(userData);
            return;
          }
        }

        // 会话确实过期：清掉本地认证状态，避免"假登录"继续发送过期 token。
        if (typeof window !== 'undefined') {
          localStorage.removeItem('clipop_access_token');
          localStorage.removeItem('clipop_refresh_token');
          clearAuthCookies();
        }
        setUser(null);
        setAccessToken(null);
      }
    } catch {
      // 异常路径（如网络瞬断）。保留 storedToken 供后续请求验证，但不再把
      // localStorage 残留的 demo 用户设为 user —— 生产环境残留的 demo id 非 UUID，
      // 会让视频处理请求稳定 401 ("Your session has expired")。
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('clipop_access_token') : null;
      if (storedToken) {
        setAccessToken(storedToken);
        setAuthCookies(storedToken);
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
    let authSessionHandler: ((event: Event) => void) | null = null;
    let supabaseAuthUnsubscribe: (() => void) | null = null;

    // supabase-js 的 autoRefreshToken 只更新它自己的 session 存储；
    // auth-context 的 accessToken state 与 clipop_access_token localStorage
    // 不会自动跟进。监听 TOKEN_REFRESHED/SIGNED_IN 同步两处，SIGNED_OUT
    // 时清理 —— 否则用户停在页面数小时后，旧 token 会把视频处理请求打 401。
    const setupSupabaseAuthListener = async () => {
      try {
        if (!isSupabaseConfigured()) return;
        const client = await getSupabaseClient();
        const { data } = client.auth.onAuthStateChange((event: string, session: any) => {
          if (typeof window === 'undefined') return;

          if (event === 'SIGNED_OUT') {
            localStorage.removeItem('clipop_access_token');
            localStorage.removeItem('clipop_refresh_token');
            clearAuthCookies();
            setUser(null);
            setAccessToken(null);
            setUseDemo(false);
            return;
          }

          if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
            setAccessToken(session.access_token);
            localStorage.setItem('clipop_access_token', session.access_token);
            if (session.refresh_token) {
              localStorage.setItem('clipop_refresh_token', session.refresh_token);
            }
            setAuthCookies(session.access_token, session.refresh_token);

            // onAuthStateChange 回调内直接调用 supabase 方法可能死锁，异步执行。
            setTimeout(() => {
              verifyTokenAndFetchUser(session.access_token)
                .then((userData) => { if (userData) setUser(userData); })
                .catch(() => {});
            }, 0);
          }
        });
        supabaseAuthUnsubscribe = () => data.subscription.unsubscribe();
      } catch {}
    };

    const init = () => {
      const handleOAuthCallback = async () => {
        if (typeof window === 'undefined') return;

        if (window.location.pathname.startsWith('/desktop/')) {
          checkAuthState();
          return;
        }

        const hash = window.location.hash;
        const search = window.location.search;

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
              if (data.session.refresh_token) {
                localStorage.setItem('clipop_refresh_token', data.session.refresh_token);
              }
              setAuthCookies(data.session.access_token, data.session.refresh_token);

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
                  const email = user.email || '';
                  setUser({
                    id: user.id,
                    email,
                    name: user.user_metadata?.name || null,
                    role: ADMIN_EMAILS.has(email.toLowerCase()) ? 'admin' : 'user',
                    avatarUrl: user.user_metadata?.avatar_url || null,
                  });

                  // 服务端兜底建档（service role，不受前端 RLS 影响）优先；
                  // 服务端不可用时回落到客户端写入路径。
                  const ensured = await ensureServerProfile(data.session.access_token);
                  if (!ensured) {
                    await createProfileWithClient(client, user);
                  }
                }
              }

              const urlParams = new URLSearchParams(window.location.search);
              const isDesktopAuth = isDesktopAuthRequest(urlParams)
                || window.location.pathname.startsWith('/desktop/');
              if (isDesktopAuth) {
                const callbackUrl = getDesktopCallbackFromSearch(urlParams);
                rememberDesktopAuth(callbackUrl);
                const desktopCallbackPath = buildDesktopCallbackPath(callbackUrl);
                const desktopUrl = new URL(desktopCallbackPath, window.location.origin);
                desktopUrl.searchParams.set('access_token', data.session.access_token);
                if (data.session.refresh_token) {
                  desktopUrl.searchParams.set('refresh_token', data.session.refresh_token);
                }
                window.location.replace(`${desktopUrl.pathname}?${desktopUrl.searchParams.toString()}`);
                return;
              }

              window.history.replaceState(null, '', window.location.pathname);
              window.dispatchEvent(new Event('clipop-auth-change'));

              if (!isDesktopAuth && (window.location.pathname === '/login' || window.location.pathname === '/register')) {
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

      if (!hash) {
        checkAuthState();
      }
    };

    handleOAuthCallback();

    desktopHandler = async (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail?.token) {
        applyDesktopToken(
          detail.token,
          setUser,
          setAccessToken,
          setLoading,
          setUseDemo,
          detail.email,
          detail.userId,
          detail.name
        );
        if (detail.refreshToken) {
          // 持久化 refresh token，供会话过期后 refreshSession() 无感恢复。
          if (typeof window !== 'undefined') {
            localStorage.setItem('clipop_refresh_token', detail.refreshToken);
          }
          try {
            const client = await getSupabaseClient();
            await client.auth.setSession({
              access_token: detail.token,
              refresh_token: detail.refreshToken,
            });
          } catch {}
        }
      }
    };

    authChangeHandler = () => {
      checkAuthState();
    };

    authSessionHandler = async (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const token = typeof detail?.accessToken === 'string' ? detail.accessToken : '';
      const refreshToken = typeof detail?.refreshToken === 'string' ? detail.refreshToken : '';
      if (!token) return;

      localStorage.setItem('clipop_access_token', token);
      setAuthCookies(token, refreshToken);
      if (refreshToken) {
        localStorage.setItem('clipop_refresh_token', refreshToken);
        try {
          const client = await getSupabaseClient();
          await client.auth.setSession({
            access_token: token,
            refresh_token: refreshToken,
          });
        } catch {}
      }

      const jwtUser = createUserFromJwt(token);
      if (jwtUser) {
        setAccessToken(token);
        setUser(jwtUser);
        setLoading(false);
      }

      verifyTokenAndFetchUser(token).then((userData) => {
        if (userData) {
          setAccessToken(token);
          setUser(userData);
          setLoading(false);
        }
      }).catch(() => {});
    };

    window.addEventListener('clipop-desktop-login', desktopHandler);
    window.addEventListener('clipop-auth-change', authChangeHandler);
    window.addEventListener('clipop-auth-session', authSessionHandler);
    setupSupabaseAuthListener();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(init);
    } else {
      setTimeout(init, 100);
    }

    return () => {
      if (desktopHandler) window.removeEventListener('clipop-desktop-login', desktopHandler);
      if (authChangeHandler) window.removeEventListener('clipop-auth-change', authChangeHandler);
      if (authSessionHandler) window.removeEventListener('clipop-auth-session', authSessionHandler);
      if (supabaseAuthUnsubscribe) supabaseAuthUnsubscribe();
    };
  }, [checkAuthState]);

  async function signIn(email: string, password: string) {
    setError(null);

    // 归一化：中文输入法的全角字符（ａｄｍｉｎ＠１２３）和首尾空白是
    // "凭据正确却登录失败"的头号客户端根因，统一在入口转换。
    email = normalizeAuthInput(email).toLowerCase();
    password = normalizeAuthInput(password);

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
          setAuthCookies(demoToken);
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
        // 注意：这里不再走 demo 管理员兜底。admin@126.com / admin@clipop.ai
        // 已有真实 Supabase 账号，密码错误时若走兜底会产生"假登录成功 →
        // 跳转后被清除 → 又变未登录"的死循环（用户感知: 怎么都登录不上）。
        // 密码错就明确报错，让用户改用正确密码。
        if (authError.message.toLowerCase().includes('invalid login credentials')) {
          const providerHint = await getSignInProviderHint(email);
          if (providerHint === 'google') {
            return {
              error: 'This email is already connected to Google sign-in. Please use Continue with Google.',
              token: null,
            };
          }

          return { error: 'Invalid email or password. Please check your password or register a new account.', token: null };
        }

        return { error: authError.message, token: null };
      }

      if (data.session) {
        const token = data.session.access_token || null;
        const refreshToken = data.session.refresh_token || null;
        setAccessToken(token);
        persistAuthTokens(token, refreshToken);
        const userData = await verifyTokenAndFetchUser(data.session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, refreshToken, email: data.session.user?.email };
      }

      return { error: null, token: null };
    } catch {
      // 网络异常时绝不回落 demo 假登录（会话会被清除，制造"登录失败"错觉），
      // 直接如实报错让用户重试。
      return { error: 'Network error. Please try again later.' };
    }
  }

  async function signUp(email: string, password: string, name: string) {
    setError(null);

    // 同 signIn：全角→半角归一化，防中文输入法导致的注册失败
    email = normalizeAuthInput(email).toLowerCase();
    password = normalizeAuthInput(password);

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
      const { data: authData, error: authError } = await client.auth.signUp({
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
        const demoToken = generateDemoToken(demoUser);
        setAccessToken(demoToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clipop_access_token', demoToken);
        }
        return { error: null, token: demoToken, email: demoUser.email };
      }

      const { data: { session } } = await client.auth.getSession();

      if (authData?.user) {
        // 服务端兜底建档（service role，不受前端 RLS 影响）优先；拿不到 session
        // （如需邮箱确认）或服务端不可用时，回落到原来的客户端写入路径。
        const ensured = await ensureServerProfile(session?.access_token);
        if (!ensured) {
          await createProfileWithClient(client, authData.user, name);
        }
      }

      if (session) {
        const token = session.access_token || null;
        const refreshToken = session.refresh_token || null;
        setAccessToken(token);
        persistAuthTokens(token, refreshToken);
        const userData = await verifyTokenAndFetchUser(session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, refreshToken, email: session.user.email || email };
      }

      const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (!signInError && signInData.session) {
        const token = signInData.session.access_token || null;
        const refreshToken = signInData.session.refresh_token || null;
        setAccessToken(token);
        persistAuthTokens(token, refreshToken);
        const userData = await verifyTokenAndFetchUser(signInData.session.access_token!);
        if (userData) {
          setUser(userData);
        }
        return { error: null, token, refreshToken, email: signInData.session.user?.email || email };
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
      const demoToken = generateDemoToken(demoUser);
      setAccessToken(demoToken);
      if (typeof window !== 'undefined') {
        localStorage.setItem('clipop_access_token', demoToken);
      }
      return { error: null, token: demoToken, email: demoUser.email };
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
      let callbackParam = getDesktopCallbackFromSearch(params);
      const isDesktopAuth = isDesktopAuthRequest(params);
      if (isDesktopAuth && !callbackParam) {
        callbackParam = await getDesktopCallbackFromBridge();
      }
      if (isDesktopAuth) {
        rememberDesktopAuth(callbackParam);
      }

      const redirectUrl = isDesktopAuth
        ? buildDesktopOAuthRedirectUrl(getDesktopOAuthOrigin(), callbackParam)
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
    clearLocalAuthStorage();
    setUseDemo(false);
    setUser(null);
    setAccessToken(null);
    setLoading(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('clipop-auth-change'));
    }

    try {
      await clearDesktopNativeAuth();

      if (!useDemo && isSupabaseConfigured()) {
        try {
          const client = await getSupabaseClient();
          await client.auth.signOut();
        } catch {}
      }
    } catch {}
  }

  // 用 refresh token 刷新会话：API 调用收到 401 时先无感恢复，避免用户
  // 在"看似已登录"的状态下被过期 token 反复拒绝。成功返回新 access token。
  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (!isSupabaseConfigured()) return null;
    try {
      const client = await getSupabaseClient();
      let { data: { session }, error } = await client.auth.refreshSession();

      // storage 里没有可刷新的会话时，用 localStorage 备份的 token 引导。
      if (!session) {
        const storedAccess = typeof window !== 'undefined' ? localStorage.getItem('clipop_access_token') : null;
        const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('clipop_refresh_token') : null;
        if (!storedAccess && !storedRefresh) return null;
        try {
          const result = await client.auth.setSession({
            access_token: storedAccess || 'x',
            refresh_token: storedRefresh || 'x',
          });
          session = result.data.session;
          error = result.error ?? null;
        } catch {
          return null;
        }
      }

      if (error || !session?.access_token) return null;

      setAccessToken(session.access_token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('clipop_access_token', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('clipop_refresh_token', session.refresh_token);
        }
        setAuthCookies(session.access_token, session.refresh_token);
      }
      const userData = await verifyTokenAndFetchUser(session.access_token).catch(() => null);
      if (userData) setUser(userData);
      return session.access_token;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, error, signIn, signUp, signInWithGoogle, signOut, clearError, refreshSession }}>
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
