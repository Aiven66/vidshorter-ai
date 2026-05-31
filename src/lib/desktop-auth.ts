export const DESKTOP_AUTH_SESSION_KEY = 'clipop_desktop_auth';
export const DESKTOP_CALLBACK_SESSION_KEY = 'clipop_desktop_callback';
export const DESKTOP_AUTH_STORAGE_KEY = 'clipop_desktop_auth_state';
export const DESKTOP_WEB_APP_URL = 'https://vidshorterai.vercel.app';

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

export function isDesktopAuthRequest(searchParams?: SearchParamsLike | null): boolean {
  const fromSearch =
    searchParams?.get('from') === 'desktop' ||
    searchParams?.get('desktop') === '1';

  if (fromSearch) return true;
  if (typeof window === 'undefined') return false;

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

    if (redirectUrl) {
      window.setTimeout(() => {
        window.location.href = redirectUrl;
      }, 900);
    }
  }

  return { deepLink, redirectUrl };
}
