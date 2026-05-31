export const DESKTOP_AUTH_SESSION_KEY = 'clipop_desktop_auth';
export const DESKTOP_CALLBACK_SESSION_KEY = 'clipop_desktop_callback';
export const DESKTOP_AUTH_STORAGE_KEY = 'clipop_desktop_auth_state';
export const DESKTOP_WEB_APP_URL = (
  process.env.NEXT_PUBLIC_DESKTOP_WEB_APP_URL ||
  'https://clipopai.vercel.app'
).replace(/\/$/, '');

export interface DesktopAuthPayload {
  token?: string | null;
  refreshToken?: string | null;
  email?: string | null;
  userId?: string | null;
  name?: string | null;
}

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

interface StoredDesktopAuthState {
  callbackUrl?: string;
  createdAt?: number;
}

export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const desktopWindow = window as any;
  return !!(
    desktopWindow.clipopDesktop ||
    desktopWindow.vidshorterDesktop ||
    desktopWindow.electronAPI ||
    desktopWindow.agent?.openWebLogin ||
    desktopWindow.agent?.openWebRegister
  );
}

export function normalizeDesktopCallbackUrl(callbackUrl?: string | null): string {
  const raw = (callbackUrl || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const allowedHostnames = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
    if (url.protocol !== 'http:' || !allowedHostnames.has(url.hostname)) {
      return '';
    }
    return url.origin;
  } catch {
    return '';
  }
}

export function getStoredDesktopCallbackUrl(): string {
  if (typeof window === 'undefined') return '';

  const sessionCallback = normalizeDesktopCallbackUrl(sessionStorage.getItem(DESKTOP_CALLBACK_SESSION_KEY));
  if (sessionCallback) return sessionCallback;

  try {
    const stored = localStorage.getItem(DESKTOP_AUTH_STORAGE_KEY);
    if (!stored) return '';
    const parsed = JSON.parse(stored) as StoredDesktopAuthState;
    return normalizeDesktopCallbackUrl(parsed.callbackUrl);
  } catch {
    localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
    return '';
  }
}

export function rememberDesktopAuth(callbackUrl?: string | null) {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(DESKTOP_AUTH_SESSION_KEY, '1');
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  if (safeCallbackUrl) {
    sessionStorage.setItem(DESKTOP_CALLBACK_SESSION_KEY, safeCallbackUrl);
  }

  localStorage.setItem(DESKTOP_AUTH_STORAGE_KEY, JSON.stringify({
    callbackUrl: safeCallbackUrl || getStoredDesktopCallbackUrl(),
    createdAt: Date.now(),
  }));
}

export async function getDesktopCallbackFromBridge(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const desktopWindow = window as any;
  const candidates = [
    desktopWindow.clipopDesktop?.getAuthCallbackUrl,
    desktopWindow.vidshorterDesktop?.getAuthCallbackUrl,
    desktopWindow.electronAPI?.getAuthCallbackUrl,
    desktopWindow.agent?.getAuthCallbackUrl,
  ].filter(Boolean);

  for (const getUrl of candidates) {
    try {
      const result = await getUrl();
      const callbackUrl = typeof result === 'string' ? result : result?.callbackUrl;
      const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
      if (safeCallbackUrl) return safeCallbackUrl;
    } catch {}
  }

  return '';
}

export function isDesktopAuthRequest(searchParams?: SearchParamsLike | null): boolean {
  const fromSearch =
    searchParams?.get('from') === 'desktop' ||
    searchParams?.get('desktop') === '1';

  if (fromSearch) return true;
  if (typeof window === 'undefined') return false;

  if (isDesktopRuntime()) {
    const pathname = window.location?.pathname || '';
    if (
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/auth/callback' ||
      pathname.startsWith('/desktop/')
    ) {
      return true;
    }
  }

  if (sessionStorage.getItem(DESKTOP_AUTH_SESSION_KEY) === '1') return true;

  try {
    const stored = localStorage.getItem(DESKTOP_AUTH_STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as StoredDesktopAuthState;
    const createdAt = Number(parsed.createdAt || 0);
    if (!createdAt) return false;

    const maxAgeMs = 30 * 60 * 1000;
    if (Date.now() - createdAt > maxAgeMs) {
      localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
      return false;
    }

    return true;
  } catch {
    localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
    return false;
  }
}

export function getDesktopCallbackFromSearch(searchParams?: SearchParamsLike | null): string {
  return normalizeDesktopCallbackUrl(searchParams?.get('callback')) || getStoredDesktopCallbackUrl();
}

export function getDesktopCallbackFromPath(path?: string | null): string {
  const raw = (path || '').trim();
  if (!raw.startsWith('/')) return '';

  try {
    const url = new URL(raw, 'https://clipop.local');
    return normalizeDesktopCallbackUrl(url.searchParams.get('callback'));
  } catch {
    return '';
  }
}

export function buildDesktopCallbackPath(callbackUrl?: string | null): string {
  const params = new URLSearchParams({ from: 'desktop' });
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  if (safeCallbackUrl) {
    params.set('callback', safeCallbackUrl);
  }
  return `/desktop/callback?${params.toString()}`;
}

export function buildDesktopOAuthRedirectUrl(origin: string, callbackUrl?: string | null): string {
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  const desktopCallbackPath = buildDesktopCallbackPath(safeCallbackUrl);
  const params = new URLSearchParams({
    from: 'desktop',
    next: desktopCallbackPath,
  });

  if (safeCallbackUrl) {
    params.set('callback', safeCallbackUrl);
  }

  return `${origin}/auth/callback?${params.toString()}`;
}

export function getDesktopOAuthOrigin(): string {
  if (typeof window === 'undefined') return DESKTOP_WEB_APP_URL;

  const origin = window.location?.origin || '';
  if (!origin) return DESKTOP_WEB_APP_URL;

  try {
    const url = new URL(origin);
    const isLocalOrigin =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '::1' ||
      url.hostname === '[::1]';
    return isLocalOrigin ? DESKTOP_WEB_APP_URL : origin;
  } catch {
    return DESKTOP_WEB_APP_URL;
  }
}

export function getSafeNextPath(next?: string | null): string {
  const raw = (next || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/';
  }
  return raw;
}

export function buildDesktopLoginRedirectUrl(callbackUrl: string, payload: DesktopAuthPayload): string {
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  if (!safeCallbackUrl) return '';

  const url = new URL('/api/desktop-login-redirect', safeCallbackUrl);
  url.searchParams.set('token', payload.token || '');
  if (payload.refreshToken) url.searchParams.set('refreshToken', payload.refreshToken);
  url.searchParams.set('email', payload.email || '');
  url.searchParams.set('userId', payload.userId || '');
  url.searchParams.set('name', payload.name || '');
  return url.toString();
}

export function buildDesktopDeepLink(payload: DesktopAuthPayload): string {
  const params = new URLSearchParams();
  params.set('token', payload.token || '');
  if (payload.refreshToken) params.set('refreshToken', payload.refreshToken);
  params.set('email', payload.email || '');
  params.set('userId', payload.userId || '');
  params.set('name', payload.name || '');
  return `clipop://login-success?${params.toString()}`;
}

export function openDesktopAuthReturn(callbackUrl: string, payload: DesktopAuthPayload): {
  deepLink: string;
  redirectUrl: string;
} {
  const deepLink = buildDesktopDeepLink(payload);
  const redirectUrl = buildDesktopLoginRedirectUrl(callbackUrl, payload);

  if (typeof window !== 'undefined') {
    try {
      window.location.href = deepLink;
    } catch {}
  }

  return { deepLink, redirectUrl };
}

export async function postDesktopAuthToLocalCallback(callbackUrl: string, payload: DesktopAuthPayload): Promise<{
  ok: boolean;
  url: string;
  error?: string;
}> {
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  if (!safeCallbackUrl || !payload.token) {
    return { ok: false, url: '' };
  }

  const url = new URL('/api/desktop-auth', safeCallbackUrl).toString();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      mode: 'cors',
    });

    return { ok: response.ok, url, error: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function syncDesktopAuthAndOpen(callbackUrl: string, payload: DesktopAuthPayload): Promise<{
  deepLink: string;
  redirectUrl: string;
  localSync: { ok: boolean; url: string; error?: string };
}> {
  const localSync = await postDesktopAuthToLocalCallback(callbackUrl, payload);
  const result = openDesktopAuthReturn(callbackUrl, payload);
  return { ...result, localSync };
}

export function openDesktopLocalCallback(callbackUrl: string, payload: DesktopAuthPayload): string {
  const redirectUrl = buildDesktopLoginRedirectUrl(callbackUrl, payload);
  if (typeof window !== 'undefined' && redirectUrl) {
    window.location.href = redirectUrl;
  }
  return redirectUrl;
}
