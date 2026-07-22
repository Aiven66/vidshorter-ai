# @clipop/auth

Universal authentication package for any Tailwind + Next.js + Supabase app.
Provides email/password, Google OAuth, a desktop bridge (Electron / Tauri /
WebView token handoff), and an admin gate — all brand-neutral and driven by
`@clipop/core`'s `useAppConfig()`.

## Features

- **Email / password** sign-in & sign-up (Supabase Auth)
- **Google OAuth** with desktop-aware redirect URLs
- **Demo mode** fallback when Supabase is not configured (uses `config.demoAdmins`)
- **Desktop bridge** — deliver auth tokens to an embedded shell via deep link
  and/or local HTTP callback server
- **AdminGate** — three-layer admin verification (JWT claim + email whitelist
  + server verify endpoint)
- **Three-step registration** with email verification code flow
- Zero shadcn/ui dependency — native `<input>` + Tailwind semantic tokens

## Installation

This package is part of a monorepo and depends on `@clipop/core` at
`../core`. To use it in a host app:

1. Copy the `packages/auth/` directory into your monorepo.
2. Ensure `@clipop/core` is available at `../core` (or update the import paths).
3. Install peer dependencies:

   ```bash
   pnpm add @supabase/supabase-js react
   ```

4. Wrap your app with both providers:

   ```tsx
   import { AppConfigProvider } from '@clipop/core/config';
   import { AuthProvider } from '@clipop/auth';

   export default function RootLayout({ children }) {
     return (
       <AppConfigProvider value={{
         appName: 'MyApp',
         appUrl: 'https://myapp.com',
         supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
         supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
         admin: { adminEmails: ['admin@myapp.com'], loginPath: '/login' },
         desktop: { enabled: true, scheme: 'myapp' },
         dailyFreeCredits: 100,
         demoAdmins: [{ email: 'admin@myapp.com', password: 'admin123', name: 'Admin' }],
         plans: [],
         paymentChannels: [],
       }}>
         <AuthProvider>{children}</AuthProvider>
       </AppConfigProvider>
     );
   }
   ```

## Configuration

All configuration flows through `useAppConfig()` from `@clipop/core`. The
relevant fields for `@clipop/auth`:

| Field                       | Type                                                         | Description                                            |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `appName`                    | `string`                                                     | Used in form headings.                                 |
| `appUrl`                     | `string`                                                     | Public app URL (fallback OAuth origin).               |
| `supabaseUrl`                | `string?`                                                    | When unset, the package runs in demo mode.            |
| `supabaseAnonKey`            | `string?`                                                    | Anon key for the Supabase client.                      |
| `authCallbackPath`           | `string?` (default `/auth/callback`)                        | Path the IdP redirects to.                             |
| `googleOAuthScopes`          | `string?` (default `email profile`)                         | Scopes requested from Google.                         |
| `demoAdmins`                 | `Array<{email,password,name}>?`                              | Static admin credentials for demo mode.                |
| `admin.adminEmails`          | `string[]`                                                   | Email whitelist for AdminGate layer 2.                 |
| `admin.loginPath`            | `string`                                                     | Where AdminGate redirects unauthorized users.          |
| `desktop.scheme`             | `string?`                                                    | Deep-link scheme (e.g. `myapp`).                       |
| `desktop.enabled`            | `boolean`                                                    | Whether desktop bridge features are active.            |
| `dailyFreeCredits`           | `number`                                                     | Credits granted on sign-up.                            |

## Components

### `<AuthProvider>`

Provides the auth context. Wrap your app once.

```tsx
import { AuthProvider, useAuth } from '@clipop/auth';

function Profile() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div>
      <p>Signed in as {user.email}</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
```

`useAuth()` returns:

| Field             | Type                                                     |
| ----------------- | -------------------------------------------------------- |
| `user`            | `AppUser \| null`                                        |
| `accessToken`     | `string \| null`                                         |
| `refreshToken`    | `string \| null`                                         |
| `loading`         | `boolean`                                                |
| `error`           | `string \| null`                                         |
| `isDemoMode`      | `boolean`                                                |
| `signIn`          | `(email, password) => Promise<AuthActionResult>`         |
| `signUp`          | `(email, password, name) => Promise<AuthActionResult>`   |
| `signInWithGoogle`| `() => Promise<{ error: string \| null }>`               |
| `signOut`         | `() => Promise<void>`                                    |
| `applyDesktopToken` | `(token, refreshToken?) => void`                       |

### `<LoginForm>`

Drop-in email/password form with an optional Google button.

```tsx
import { LoginForm } from '@clipop/auth';

export default function LoginPage() {
  return <LoginForm redirectTo="/dashboard" />;
}
```

Props: `redirectTo?`, `onLogin?(user)`, `showRegisterLink?`, `registerPath?`.

### `<RegisterForm>`

Three-step (info → verify → done) registration flow.

```tsx
import { RegisterForm } from '@clipop/auth';

export default function RegisterPage() {
  return <RegisterForm redirectTo="/dashboard" />;
}
```

Props: `redirectTo?`, `onRegister?(user)`, `showTerms?`, `loginPath?`,
`termsPath?`, `privacyPath?`.

### `<GoogleLoginButton>`

Standalone Google sign-in trigger with an inline Google "G" SVG.

```tsx
import { GoogleLoginButton } from '@clipop/auth';

<GoogleLoginButton label="Continue with Google" />
```

### `<AdminGate>`

Wraps admin-only UI. Performs three-layer verification.

```tsx
import { AdminGate } from '@clipop/auth';

export default function AdminLayout({ children }) {
  return <AdminGate loginPath="/admin/login">{children}</AdminGate>;
}
```

Props: `children`, `loginPath?`, `fallback?`.

Also exports `isAdminUser(user, config)` and `useIsAdmin()`.

### `<OAuthCallback>`

Drop-in OAuth callback page. Mount at your `authCallbackPath` (default
`/auth/callback`).

```tsx
// src/app/auth/callback/page.tsx
import { OAuthCallback } from '@clipop/auth';

export default function AuthCallbackPage() {
  return <OAuthCallback redirectTo="/dashboard" />;
}
```

Props: `redirectTo?`, `desktopRedirectPath?` (default `/desktop/callback`).

## Required host API routes

The host Next.js app must provide these endpoints:

| Method & Path                     | Body                              | Response                              | Used by             |
| --------------------------------- | --------------------------------- | ------------------------------------- | ------------------- |
| `POST /api/check-email`           | `{ email }`                       | `{ exists: boolean }`                 | RegisterForm        |
| `POST /api/send-verification-code`| `{ email }`                      | `{ ok: boolean }` (sends 6-digit code)| RegisterForm        |
| `PUT /api/send-verification-code` | `{ email, code }`                | `{ ok: boolean }`                     | RegisterForm        |
| `POST /api/admin/verify`          | (Authorization: Bearer `<token>`) | `{ isAdmin: boolean }`                | AdminGate           |
| `POST /api/init-admin`            | `{ email, password, name }`       | `{ ok: boolean }`                     | One-time admin seed |

## Required database tables

The Supabase project must expose these tables (column names matter):

### `users`

| column        | type                       |
| ------------- | -------------------------- |
| `id`          | `uuid` (refs `auth.users`) |
| `email`       | `text`                     |
| `name`        | `text`                     |
| `role`        | `text` (`'admin' \| 'user'`) |
| `avatar_url`  | `text?`                    |
| `google_id`   | `text?`                    |

### `credits`

| column         | type    |
| -------------- | ------- |
| `id`           | `uuid`  |
| `user_id`      | `uuid`  |
| `balance`      | `int4`  |
| `last_reset_at`| `timestamptz` |

### `subscriptions`

| column        | type                              |
| ------------- | --------------------------------- |
| `id`          | `uuid`                            |
| `user_id`     | `uuid`                            |
| `plan_type`   | `text` (e.g. `'free'`)            |
| `status`      | `text` (`'active' \| …`)          |

On sign-up, `@clipop/auth` inserts one row into each of these tables
(`balance` = `config.dailyFreeCredits`, `plan_type = 'free'`,
`status = 'active'`).

## Desktop client integration

When the web app runs inside an embedded shell (Electron / Tauri / custom
WebView), the shell should inject one of the following global objects:

```ts
interface DesktopBridge {
  getMediaBaseUrl?: () => Promise<string>;   // local callback URL
  openAuth?: () => Promise<{ ok?: boolean }>;
  openWebLogin?: () => Promise<{ ok?: boolean }>;
  openWebRegister?: () => Promise<{ ok?: boolean }>;
  getAuthToken?: () => Promise<string>;
  clearAuthToken?: () => Promise<{ ok?: boolean }>;
}
```

Discovery priority:

```
window.clipopDesktop > window.vidshorterDesktop >
window.electronAPI  > window.api > window.agent
```

### Token handoff

After a successful sign-in inside the desktop shell, `@clipop/auth`:

1. POSTs the token to the local callback URL returned by
   `bridge.getMediaBaseUrl()` (must be `http://127.0.0.1:*` or
   `http://localhost:*` — validated by `isSafeLocalCallbackUrl`).
2. Opens a deep link `${scheme}://login-success?token=…&refreshToken=…&email=…&userId=…&name=…`
   so the shell can intercept it via a custom URL scheme handler.
3. Falls back to `window.open(${callbackUrl}?token=…)` if the POST fails.

The shell's local callback server should accept `POST /` with a JSON body
matching `DesktopAuthPayload`:

```ts
interface DesktopAuthPayload {
  token?: string | null;
  refreshToken?: string | null;
  email?: string | null;
  userId?: string | null;
  name?: string | null;
}
```

### Loopback detection

`isDesktopRuntime()` returns `true` when a bridge is present **or** the page
is served from `http://127.0.0.1` / `http://localhost` / `http://[::1]`.

## Persistence

| Storage        | Key                   | Value                          |
| -------------- | --------------------- | ------------------------------ |
| `localStorage` | `app_access_token`    | JWT access token               |
| `localStorage` | `app_refresh_token`   | JWT refresh token              |
| `localStorage` | `app_demo_user`       | Demo user (demo mode only)     |
| `localStorage` | `app_registered_users`| Demo-mode registered users      |
| Cookie         | `app_access_token`    | Same as localStorage (7 days)  |
| Cookie         | `app_refresh_token`   | Same as localStorage (7 days)  |

Cookies use `Max-Age=604800`, `SameSite=Lax`, `Secure` (when HTTPS).

## Custom events

The provider listens for (and dispatches) these `window` events:

| Event                | `detail`                                            | Purpose                              |
| -------------------- | --------------------------------------------------- | ------------------------------------ |
| `app-auth-change`    | none                                                | Re-run `checkAuthState`              |
| `app-auth-session`   | `{ accessToken, refreshToken }`                     | Apply a new session token            |
| `app-desktop-login`  | `{ token, refreshToken }`                           | Apply a token pushed by the desktop shell |

## License

MIT
