import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDesktopCallbackPath,
  buildDesktopDeepLink,
  buildDesktopLoginRedirectUrl,
  buildDesktopOAuthRedirectUrl,
  getDesktopCallbackFromPath,
  getSafeNextPath,
  normalizeDesktopCallbackUrl,
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

const oauthRedirect = buildDesktopOAuthRedirectUrl('https://vidshorterai.vercel.app', localCallback);
const oauthUrl = new URL(oauthRedirect);
assert.equal(oauthUrl.origin, 'https://vidshorterai.vercel.app');
assert.equal(oauthUrl.pathname, '/auth/callback');
assert.equal(oauthUrl.searchParams.get('from'), 'desktop');
assert.equal(oauthUrl.searchParams.get('callback'), localCallback);
assert.equal(oauthUrl.searchParams.get('next'), desktopPath);

assert.equal(getSafeNextPath('/desktop/callback?from=desktop'), '/desktop/callback?from=desktop');
assert.equal(getSafeNextPath('https://evil.test/steal'), '/');
assert.equal(getSafeNextPath('//evil.test/steal'), '/');

const returnUrl = buildDesktopLoginRedirectUrl(localCallback, {
  token: 'token.123',
  email: 'aiven@example.com',
  userId: 'user-1',
  name: 'Aiven Zhang',
});
const parsedReturnUrl = new URL(returnUrl);
assert.equal(parsedReturnUrl.origin, localCallback);
assert.equal(parsedReturnUrl.pathname, '/api/desktop-login-redirect');
assert.equal(parsedReturnUrl.searchParams.get('token'), 'token.123');
assert.equal(parsedReturnUrl.searchParams.get('email'), 'aiven@example.com');
assert.equal(parsedReturnUrl.searchParams.get('userId'), 'user-1');
assert.equal(parsedReturnUrl.searchParams.get('name'), 'Aiven Zhang');

const deepLink = buildDesktopDeepLink({
  token: 'token.123',
  email: 'aiven@example.com',
  userId: 'user-1',
  name: 'Aiven Zhang',
});
assert.equal(
  deepLink,
  'clipop://login-success?token=token.123&email=aiven%40example.com&userId=user-1&name=Aiven+Zhang',
);

const authContextSource = readFileSync('src/lib/auth-context.tsx', 'utf8');
assert.match(authContextSource, /buildDesktopOAuthRedirectUrl/);

const authCallbackSource = readFileSync('src/app/auth/callback/page.tsx', 'utf8');
assert.match(authCallbackSource, /buildDesktopCallbackPath/);
assert.match(authCallbackSource, /rememberDesktopAuth/);

const desktopMainSource = readFileSync('apps/macos-agent/main.js', 'utf8');
assert.match(desktopMainSource, /const SERVER_URL = 'https:\/\/vidshorterai\.vercel\.app'/);
assert.doesNotMatch(desktopMainSource, /SERVER_URL: 'https:\/\/clipopai\.vercel\.app'/);

console.log('Desktop auth flow checks passed.');
