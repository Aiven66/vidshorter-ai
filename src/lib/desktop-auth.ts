export const DESKTOP_AUTH_SESSION_KEY = 'clipop_desktop_auth';
export const DESKTOP_CALLBACK_SESSION_KEY = 'clipop_desktop_callback';
export const DESKTOP_WEB_APP_URL = 'https://vidshorterai.vercel.app';

export interface DesktopAuthPayload {
  token?: string | null;
  refreshToken?: string | null;
  email?: string | null;
  userId?: string | null;
  name?: string | null;
}

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

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
  return normalizeDesktopCallbackUrl(sessionStorage.getItem(DESKTOP_CALLBACK_SESSION_KEY));
}

export function rememberDesktopAuth(callbackUrl?: string | null) {
  if (typeof window === 'undefined') return;

  sessionStorage.setItem(DESKTOP_AUTH_SESSION_KEY, '1');
  const safeCallbackUrl = normalizeDesktopCallbackUrl(callbackUrl);
  if (safeCallbackUrl) {
    sessionStorage.setItem(DESKTOP_CALLBACK_SESSION_KEY, safeCallbackUrl);
  }
}

export function isDesktopAuthRequest(searchParams?: SearchParamsLike | null): boolean {
  const fromSearch =
    searchParams?.get('from') === 'desktop' ||
    searchParams?.get('desktop') === '1';

  if (fromSearch) return true;
  if (typeof window === 'undefined') return false;

  return sessionStorage.getItem(DESKTOP_AUTH_SESSION_KEY) === '1';
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
