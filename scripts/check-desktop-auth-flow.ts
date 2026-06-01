import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDesktopCallbackPath,
  buildDesktopDeepLink,
  buildDesktopLoginRedirectUrl,
  buildDesktopOAuthRedirectUrl,
  DESKTOP_WEB_APP_URL,
  DESKTOP_AUTH_SESSION_KEY,
  DESKTOP_AUTH_STORAGE_KEY,
  DESKTOP_CALLBACK_SESSION_KEY,
  getDesktopCallbackFromBridge,
  getDesktopCallbackFromPath,
  getDesktopOAuthOrigin,
  getSafeNextPath,
  isDesktopAuthRequest,
  isDesktopRuntime,
  normalizeDesktopCallbackUrl,
  openDesktopLocalCallback,
  openDesktopAuthReturn,
  postDesktopAuthToLocalCallback,
  rememberDesktopAuth,
  syncDesktopAuthAndOpen,
} from '../src/lib/desktop-auth';

const localCallback = 'http://127.0.0.1:49231';
const localhostCallback = 'http://localhost:49231/api/ignored';

assert.equal(normalizeDesktopCallbackUrl(localCallback), localCallback);
assert.equal(normalizeDesktopCallbackUrl(localhostCallback), 'http://localhost:49231');
assert.equal(normalizeDesktopCallbackUrl('https://example.com/callback'), '');
assert.equal(normalizeDesktopCallbackUrl('javascript:alert(1)'), '');

const desktopPath = buildDesktopCallbackPath(localCallback);
assert.equal(desktopPath, '/desktop/callback?from=desktop&callback=http%3A%2F%2F127.0.0.1%3A49231');
assert.equal(getDesktopCallbackFromPath(desktopPath), localCallback);

assert.equal(DESKTOP_WEB_APP_URL, 'https://www.clipopai.com');

const oauthRedirect = buildDesktopOAuthRedirectUrl('https://www.clipopai.com', localCallback);
const oauthUrl = new URL(oauthRedirect);
assert.equal(oauthUrl.origin, 'https://www.clipopai.com');
assert.equal(oauthUrl.pathname, '/auth/callback');
assert.equal(oauthUrl.searchParams.get('from'), 'desktop');
assert.equal(oauthUrl.searchParams.get('callback'), localCallback);
assert.equal(oauthUrl.searchParams.get('next'), desktopPath);

assert.equal(getSafeNextPath('/desktop/callback?from=desktop'), '/desktop/callback?from=desktop');
assert.equal(getSafeNextPath('https://evil.test/steal'), '/');
assert.equal(getSafeNextPath('//evil.test/steal'), '/');

const returnUrl = buildDesktopLoginRedirectUrl(localCallback, {
  token: 'token.123',
  refreshToken: 'refresh.456',
  email: 'aiven@example.com',
  userId: 'user-1',
  name: 'Aiven Zhang',
});
const parsedReturnUrl = new URL(returnUrl);
assert.equal(parsedReturnUrl.origin, localCallback);
assert.equal(parsedReturnUrl.pathname, '/api/desktop-login-redirect');
assert.equal(parsedReturnUrl.searchParams.get('token'), 'token.123');
assert.equal(parsedReturnUrl.searchParams.get('refreshToken'), 'refresh.456');
assert.equal(parsedReturnUrl.searchParams.get('email'), 'aiven@example.com');
assert.equal(parsedReturnUrl.searchParams.get('userId'), 'user-1');
assert.equal(parsedReturnUrl.searchParams.get('name'), 'Aiven Zhang');

const deepLink = buildDesktopDeepLink({
  token: 'token.123',
  refreshToken: 'refresh.456',
  email: 'aiven@example.com',
  userId: 'user-1',
  name: 'Aiven Zhang',
});
assert.equal(
  deepLink,
  'clipop://login-success?token=token.123&refreshToken=refresh.456&email=aiven%40example.com&userId=user-1&name=Aiven+Zhang',
);

const desktopAuthSource = readFileSync('src/lib/desktop-auth.ts', 'utf8');
assert.match(desktopAuthSource, /DESKTOP_AUTH_STORAGE_KEY/);
assert.match(desktopAuthSource, /openDesktopAuthReturn/);

function makeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  };
}

const sessionStorageMock = makeStorage();
const localStorageMock = makeStorage();
const navigations: string[] = [];
const fetches: Array<{ url: string; body: string }> = [];
(globalThis as any).sessionStorage = sessionStorageMock;
(globalThis as any).localStorage = localStorageMock;
(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  fetches.push({ url, body: String(init?.body || '') });
  return { ok: true, status: 200 };
};
(globalThis as any).window = {
  sessionStorage: sessionStorageMock,
  localStorage: localStorageMock,
  clipopDesktop: {
    getAuthCallbackUrl: async () => localCallback,
  },
  setTimeout: (fn: () => void) => {
    fn();
    return 1;
  },
  location: {
    origin: 'https://www.clipopai.com',
    pathname: '/login',
    set href(value: string) {
      navigations.push(value);
    },
    get href() {
      return navigations[navigations.length - 1] || '';
    },
  },
};

assert.equal(isDesktopRuntime(), true);
assert.equal(isDesktopAuthRequest(new URLSearchParams()), true);
assert.equal(getDesktopOAuthOrigin(), 'https://www.clipopai.com');

rememberDesktopAuth(localCallback);
assert.equal(sessionStorageMock.getItem(DESKTOP_AUTH_SESSION_KEY), '1');
assert.equal(sessionStorageMock.getItem(DESKTOP_CALLBACK_SESSION_KEY), localCallback);
assert.equal(isDesktopAuthRequest(new URLSearchParams()), true);
sessionStorageMock.clear();
assert.equal(isDesktopAuthRequest(new URLSearchParams()), true);
assert.match(localStorageMock.getItem(DESKTOP_AUTH_STORAGE_KEY) || '', /127\.0\.0\.1/);

const returnResult = openDesktopAuthReturn(localCallback, {
  token: 'token.abc',
  refreshToken: 'refresh.def',
  email: 'desktop@example.com',
});
assert.equal(returnResult.redirectUrl.includes('/api/desktop-login-redirect'), true);
assert.equal(navigations.length, 1);
assert.equal(navigations[0].startsWith('clipop://login-success?'), true);

const fallbackRedirectUrl = openDesktopLocalCallback(localCallback, {
  token: 'token.fallback',
  refreshToken: 'refresh.fallback',
  email: 'desktop@example.com',
});
assert.equal(fallbackRedirectUrl.includes('/api/desktop-login-redirect'), true);
assert.equal(navigations.length, 2);
assert.equal(new URL(navigations[1]).origin, localCallback);

const deepLinkOnlyResult = openDesktopAuthReturn('', {
  token: 'token.no-callback',
  email: 'fallback@example.com',
});
assert.equal(deepLinkOnlyResult.redirectUrl, '');
assert.equal(navigations[2].startsWith('clipop://login-success?'), true);

async function checkAsyncDesktopReturn() {
  assert.equal(await getDesktopCallbackFromBridge(), localCallback);

  const postResult = await postDesktopAuthToLocalCallback(localCallback, {
    token: 'token.post',
    refreshToken: 'refresh.post',
    email: 'post@example.com',
  });
  assert.equal(postResult.ok, true);
  assert.equal(postResult.url, `${localCallback}/api/desktop-auth`);
  assert.match(fetches.at(-1)?.body || '', /token\.post/);

  const syncAndOpenResult = await syncDesktopAuthAndOpen(localCallback, {
    token: 'token.sync',
    refreshToken: 'refresh.sync',
    email: 'sync@example.com',
  });
  assert.equal(syncAndOpenResult.localSync.ok, true);
  assert.equal(navigations.at(-1)?.startsWith('clipop://login-success?'), true);
  assert.match(fetches.at(-1)?.body || '', /token\.sync/);
}

const authContextSource = readFileSync('src/lib/auth-context.tsx', 'utf8');
assert.match(authContextSource, /buildDesktopOAuthRedirectUrl/);
assert.match(authContextSource, /buildDesktopCallbackPath/);
assert.match(authContextSource, /getDesktopOAuthOrigin/);
assert.match(authContextSource, /getDesktopCallbackFromBridge/);
assert.match(authContextSource, /buildDesktopOAuthRedirectUrl\(getDesktopOAuthOrigin\(\), callbackParam\)/);
assert.match(authContextSource, /window\.location\.replace\(`\$\{desktopUrl\.pathname\}\?\$\{desktopUrl\.searchParams\.toString\(\)\}`\)/);
assert.match(authContextSource, /clearLocalAuthStorage/);
assert.match(authContextSource, /clearDesktopNativeAuth/);
assert.match(authContextSource, /window\.location\.pathname\.startsWith\('\/desktop\/'\)/);
assert.doesNotMatch(authContextSource, /setAccessToken\(null\);\n\s*return \{ error: null, token: null \}/);
assert.match(authContextSource, /generateDemoToken\(adminUser\)/);
assert.match(authContextSource, /return \{ error: null, token: demoToken, email: adminUser\.email \}/);
assert.match(authContextSource, /return \{ error: null, token: demoToken, email: demoUser\.email \}/);

const authCallbackSource = readFileSync('src/app/auth/callback/page.tsx', 'utf8');
assert.match(authCallbackSource, /buildDesktopCallbackPath/);
assert.match(authCallbackSource, /rememberDesktopAuth/);
assert.match(authCallbackSource, /clipop_access_token/);
assert.match(authCallbackSource, /flowType: 'implicit'/);
assert.match(authCallbackSource, /recoverHashSession/);
assert.match(authCallbackSource, /getSessionWithRetry/);
assert.match(authCallbackSource, /recoverStoredSession/);

const supabaseClientSource = readFileSync('src/storage/database/supabase-client.ts', 'utf8');
assert.match(supabaseClientSource, /flowType: 'implicit'/);

const desktopCallbackSource = readFileSync('src/app/desktop/callback/page.tsx', 'utf8');
assert.match(desktopCallbackSource, /publishDesktopAuth/);
assert.match(desktopCallbackSource, /clipop-desktop-login/);
assert.match(desktopCallbackSource, /clipop-auth-change/);
assert.match(desktopCallbackSource, /clipop_refresh_token/);

const providersSource = readFileSync('src/app/providers.tsx', 'utf8');
assert.match(providersSource, /DesktopAuthReturnBanner/);

const desktopBannerSource = readFileSync('src/components/desktop-auth-return-banner.tsx', 'utf8');
assert.match(desktopBannerSource, /isDesktopAuthRequest/);
assert.match(desktopBannerSource, /Return to Clipop Agent/);
assert.match(desktopBannerSource, /Close desktop return banner/);
assert.match(desktopBannerSource, /DESKTOP_RETURN_DISMISSED_KEY/);
assert.match(desktopBannerSource, /localStorage\.removeItem\(DESKTOP_AUTH_STORAGE_KEY\)/);
assert.match(desktopBannerSource, /clipop_access_token/);
assert.match(desktopBannerSource, /openDesktopLocalCallback/);
assert.match(desktopBannerSource, /syncDesktopAuthAndOpen/);
assert.doesNotMatch(desktopBannerSource, /pathname === '\/login'/);
assert.doesNotMatch(desktopBannerSource, /pathname === '\/register'/);

const registerPageSource = readFileSync('src/app/register/page.tsx', 'utf8');
assert.match(registerPageSource, /setStep\('done'\)/);
assert.match(registerPageSource, /setDesktopToken\(accessToken\)/);

const desktopMainSource = readFileSync('apps/macos-agent/main.js', 'utf8');
assert.match(desktopMainSource, /const SERVER_URL = 'https:\/\/www\.clipopai\.com'/);
assert.doesNotMatch(desktopMainSource, /const SERVER_URL = 'https:\/\/clipopai\.vercel\.app'/);
assert.doesNotMatch(desktopMainSource, /const SERVER_URL = 'https:\/\/vidshorterai\.vercel\.app'/);
assert.match(desktopMainSource, /persistAndSyncAuth/);
assert.match(desktopMainSource, /Access-Control-Allow-Private-Network/);
assert.match(desktopMainSource, /waitForAuthCallbackUrl/);
assert.match(desktopMainSource, /get-auth-callback-url/);
assert.match(desktopMainSource, /clipop_refresh_token/);

const preloadWebSource = readFileSync('apps/macos-agent/preload-web.js', 'utf8');
assert.match(preloadWebSource, /getAuthCallbackUrl/);

const preloadSource = readFileSync('apps/macos-agent/preload.js', 'utf8');
assert.match(preloadSource, /clearAuthToken/);

checkAsyncDesktopReturn().then(() => {
  console.log('Desktop auth flow checks passed.');
});
