/**
 * 回归测试：高光剪辑 "Your session has expired" (401) 问题。
 *
 * 根因: auth-context.checkAuthState 在 Supabase 无活跃会话时，直接把过期的
 * localStorage token 设为 accessToken，并把残留的 demo 用户(id 非 UUID) 设为
 * user —— 页面显示"已登录"但 /api/videos/process 稳定 401。
 *
 * 修复点:
 *   1. checkAuthState 无会话时: refresh token 恢复 → 验证 storedToken → 清理脏状态
 *   2. onAuthStateChange 监听同步 supabase 自动刷新的 token
 *   3. video-processor 收到 401 时先 refreshSession 无感重试，仍 401 才
 *      signOut 并引导重新登录
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readProjectFile(filePath: string): string {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. auth-context.tsx — checkAuthState 无会话分支的恢复/清理链
// ---------------------------------------------------------------------------
const authContext = readProjectFile('src/lib/auth-context.tsx');

// 恢复路径 1: 用 localStorage 保存的 access+refresh 引导 setSession
assert.match(
  authContext,
  /const \{ data: setData, error: setError \} = await client\.auth\.setSession\(\{\s*\n\s*access_token: storedAccess,\s*\n\s*refresh_token: storedRefresh,\s*\n\s*\}\)/,
  'checkAuthState must try setSession(storedAccess, storedRefresh) to recover expired sessions',
);

// 恢复路径 2: 只有 refresh token 时 refreshSession
assert.match(
  authContext,
  /await client\.auth\.refreshSession\(\{\s*\n\s*refresh_token: storedRefresh,\s*\n\s*\}\)/,
  'checkAuthState must try refreshSession({ refresh_token }) fallback',
);

// 恢复成功: 持久化新 token
assert.match(
  authContext,
  /localStorage\.setItem\('clipop_access_token', newSession\.access_token\)/,
  'restored session must be persisted to localStorage',
);

// 恢复失败兜底: 验证 storedToken 仍有效才使用
assert.match(
  authContext,
  /verifyTokenAndFetchUser\(storedAccess\)/,
  'storedToken must be verified before use',
);

// 全部失败: 清理脏状态（"假登录"根因修复）
assert.match(
  authContext,
  /localStorage\.removeItem\('clipop_access_token'\);\s*\n\s*localStorage\.removeItem\('clipop_refresh_token'\);\s*\n\s*clearAuthCookies\(\);\s*\n\s*\}\s*\n\s*setUser\(null\);\s*\n\s*setAccessToken\(null\);/,
  'checkAuthState must clear stale auth state (token/cookies/user) when session cannot be recovered',
);

// 无会话分支不允许再把 demo 残留用户设为登录态（生产环境 demo id 非 UUID → 稳定 401）
const noSessionBranch = authContext.split('else {')[1]?.split('} catch {')[0] ?? '';
assert.doesNotMatch(
  noSessionBranch,
  /setUser\(demoUser\)/,
  'no-session branch must not resurrect stale demo users',
);
assert.doesNotMatch(
  noSessionBranch,
  /setUseDemo\(true\)/,
  'no-session branch must not enable demo mode',
);

// catch 分支同样不允许 demo 复活
const catchBranch = authContext.split('} catch {')[1]?.split('} finally {')[0] ?? '';
assert.doesNotMatch(catchBranch, /setUser\(demoUser\)/, 'catch branch must not set demo user');

// ---------------------------------------------------------------------------
// 2. auth-context.tsx — onAuthStateChange 同步 supabase 自动刷新
// ---------------------------------------------------------------------------
assert.match(
  authContext,
  /onAuthStateChange\(\(event: string, session: any\)/,
  'must subscribe to onAuthStateChange',
);
assert.match(
  authContext,
  /event === 'TOKEN_REFRESHED' \|\| event === 'SIGNED_IN'/,
  'TOKEN_REFRESHED/SIGNED_IN events must sync accessToken',
);
assert.match(
  authContext,
  /event === 'SIGNED_OUT'/,
  'SIGNED_OUT event must clear local auth state',
);
assert.match(
  authContext,
  /supabaseAuthUnsubscribe\(\)/,
  'onAuthStateChange subscription must be unsubscribed on cleanup',
);

// ---------------------------------------------------------------------------
// 3. auth-context.tsx — refreshSession 对外暴露
// ---------------------------------------------------------------------------
assert.match(
  authContext,
  /refreshSession: \(\) => Promise<string \| null>;/,
  'AuthContextType must expose refreshSession',
);
assert.match(
  authContext,
  /const refreshSession = useCallback\(async \(\): Promise<string \| null> =>/,
  'refreshSession must be implemented',
);
assert.match(
  authContext,
  /signOut, clearError, refreshSession/,
  'refreshSession must be provided in the context value',
);

// ---------------------------------------------------------------------------
// 4. video-processor.tsx — 401 自动恢复与重试
// ---------------------------------------------------------------------------
const processor = readProjectFile('src/components/home/video-processor.tsx');

assert.match(
  processor,
  /const \{ user, accessToken, refreshSession, signOut \} = useAuth\(\)/,
  'video-processor must consume refreshSession and signOut from useAuth',
);

// 401 → 刷新 → 无感重试（最多 3 次），直到拿到可用 token
assert.match(
  processor,
  /let submitRes = await doSubmit\(authToken\);\s*\n\s*let attempts = 1;\s*\n\s*while \(submitRes\.status === 401 && attempts < 3\) \{\s*\n\s*const refreshed = await refreshSession\(\);/,
  'submit 401 must refresh the session and transparently retry (up to 3x)',
);

// 重试仍 401 → signOut + 跳转登录（清除"假登录"状态）
assert.match(
  processor,
  /await signOut\(\);\s*\n\s*if \(typeof window !== 'undefined'\) window\.location\.href = '\/login';/,
  'persistent 401 must signOut and redirect to /login',
);

// 轮询必须使用（可能已刷新的）authToken 而非闭包里的旧 accessToken
assert.match(
  processor,
  /Authorization: `Bearer \$\{authToken\}`/,
  'status polling must use the refreshed authToken',
);

// 旧的"直接抛 session expired"行为应被替换为重试逻辑
assert.doesNotMatch(
  processor,
  /throw new Error\(locale === 'zh' \? '登录状态已失效，请重新登录后再试' : 'Your session has expired\. Please sign in again\.'\)/,
  'video-processor must no longer surface a hard session-expired error without a refresh retry',
);

// 依赖数组必须包含新增的回调
assert.match(
  processor,
  /\}, \[accessToken, error, getLocalMediaBaseUrl, refreshCredits, refreshSession, selectedFile, signOut, trimmedVideoUrl, uploadToSupabase, useAgent, user, locale\]\);/,
  'handleProcess deps must include refreshSession, signOut and locale',
);

// ---------------------------------------------------------------------------
// 5. 后端 401 语义保持（未放宽信任客户端 userId）
// ---------------------------------------------------------------------------
const processRoute = readProjectFile('src/app/api/videos/process/route.ts');
assert.match(
  processRoute,
  /Please sign in again to process videos \(your session expired\)/,
  'server must keep rejecting non-UUID user ids with 401 (never trust client ids)',
);
assert.match(
  processRoute,
  /const \{ data: \{ user: authUser \}, error: authErr \} = await userClient\.auth\.getUser\(\)/,
  'server must resolve the real user from the bearer token',
);
assert.match(
  processRoute,
  /let bearerResolved = false;/,
  'server must track whether the bearer token actually resolved to a user',
);
assert.match(
  processRoute,
  /if \(bearerToken && !bearerResolved\)/,
  'server must hard-fail 401 when a bearer token fails to resolve (never trust client userId)',
);

console.log('✓ All session-expired regression checks passed (5/5 groups)');
