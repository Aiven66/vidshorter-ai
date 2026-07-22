# @clipop/feedback

Universal user feedback package: in-app submit dialog, trigger button, all-in-one widget, and an admin review table. Brand-agnostic — all app-specific values come from `useAppConfig()` in `@clipop/core`.

- **No brand coupling** (no VidShorter / Clipop strings in the runtime).
- **No shadcn/ui dependency** — only native elements + Tailwind classes.
- **No `process.env` access** — routing and config flow through `AppConfig`.
- **Strict TypeScript**, `'use client'` on every component.
- Relative import of `@clipop/core` via `../core` (workspace-friendly).

## Installation

This package lives in the monorepo under `packages/feedback`. From your host app:

```bash
pnpm add file:../packages/feedback
# or with workspace protocol
pnpm add workspace:@clipop/feedback
```

`react`, `@supabase/supabase-js`, and `lucide-react` are peer dependencies — install them in the host if you have not already:

```bash
pnpm add react @supabase/supabase-js lucide-react
```

## Configuration

Wrap your app in `AppConfigProvider` from `@clipop/core`. The feedback package reads two optional fields:

| Field                   | Type     | Default          | Purpose                                                                              |
| ----------------------- | -------- | ---------------- | ------------------------------------------------------------------------------------ |
| `feedbackExternalUrl`   | `string` | `undefined`      | When set, the button opens this URL in a new tab (e.g. a Tally form).                |
| `feedbackEndpoint`      | `string` | `/api/feedback`  | Path the client calls for POST/GET/PATCH.                                            |
| `defaultLocale`         | `string` | `'en'`           | Locale used when no `locale` prop is passed to a component.                          |

Example:

```tsx
// app/providers.tsx
'use client';

import { AppConfigProvider } from '@clipop/core';

export function Providers({ children }) {
  return (
    <AppConfigProvider
      value={{
        appName: 'MyApp',
        appUrl: 'https://myapp.com',
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        feedbackEndpoint: '/api/feedback',
        // feedbackExternalUrl: 'https://tally.so/r/xxxx',  // optional Tally link
        defaultLocale: 'en',
        admin: { adminEmails: ['me@myapp.com'], loginPath: '/login' },
        desktop: { enabled: false },
        plans: [],
        paymentChannels: [],
        dailyFreeCredits: 100,
        adminCredits: 10_000,
      }}
    >
      {children}
    </AppConfigProvider>
  );
}
```

## Components

### `<FeedbackButton />`

A trigger button. In **uncontrolled mode** (default) it renders its own dialog. In **controlled mode** (when `onOpenChange` is provided) it delegates state to the parent and renders nothing else.

```tsx
import { FeedbackButton } from '@clipop/feedback';

// Uncontrolled — manages its own dialog. Pass the user's bearer token.
<FeedbackButton token={accessToken} variant="button" />

// Icon-only trigger (e.g. in a navbar)
<FeedbackButton token={accessToken} variant="icon" className="rounded-full" />

// Controlled — parent owns open state
<FeedbackButton onOpenChange={setOpen} token={accessToken} />
```

Props:

| Prop            | Type                                  | Default     | Notes                                                  |
| --------------- | ------------------------------------- | ----------- | ------------------------------------------------------ |
| `variant`       | `'button' \| 'icon'`                  | `'button'`  | `'icon'` = square icon-only trigger.                   |
| `className`     | `string`                              | —           | Extra classes on the `<button>`.                       |
| `onSubmitted`   | `() => void`                          | —           | Fired after a successful submit (uncontrolled mode).   |
| `onOpenChange`  | `(open: boolean) => void`             | —           | When set, the button is controlled (no internal dialog). |
| `token`         | `string`                              | —           | Bearer token forwarded to the dialog.                  |
| `locale`        | `'en' \| 'zh'`                        | config      | Selects a default dictionary.                          |
| `i18n`          | `Partial<FeedbackI18nDict>`           | —           | Per-key overrides.                                     |

### `<FeedbackDialog />`

The modal itself. Useful when you want a custom trigger.

```tsx
import { FeedbackDialog } from '@clipop/feedback';

const [open, setOpen] = useState(false);

<FeedbackDialog
  open={open}
  onOpenChange={setOpen}
  token={accessToken}
  onSubmitted={() => console.log('thanks!')}
  locale="zh"
/>;
```

Features:

- `textarea` (max 5000 chars) with live char count.
- 5-star rating selector (hover highlight, click to lock).
- Loading state on submit, error banner on failure.
- Success view with "Submit another" and "Close" buttons.
- Esc-to-close, body-scroll lock, backdrop click to close.
- Calls `submitFeedback()` from `./client`.

### `<FeedbackWidget />`

The one-liner: composes `<FeedbackButton>` + `<FeedbackDialog>` and manages open state for you.

```tsx
import { FeedbackWidget } from '@clipop/feedback';

<FeedbackWidget
  token={accessToken}
  buttonVariant="button"
  onSubmitted={() => toast.success('Thanks!')}
/>;

// Icon variant for a fixed corner FAB
<FeedbackWidget token={accessToken} buttonVariant="icon" className="fixed bottom-4 right-4 rounded-full shadow-lg" />
```

### `<AdminFeedbackManager />`

Admin-only review table.

```tsx
import { AdminFeedbackManager } from '@clipop/feedback';

// Inside an admin-only route:
<AdminFeedbackManager token={adminAccessToken} locale="en" />
```

Features:

- Table: user (name + email), content (truncated), rating (star), status (badge), created date.
- Click a row to expand the full content.
- Filter by status (`new` / `read` / `resolved`) and by rating (1–5).
- Sort by created date (newest / oldest).
- Per-row status dropdown — calls `updateFeedbackStatus()` with optimistic update.
- Refresh button to re-fetch.

## API Routes (host must implement)

The package calls these endpoints (path configurable via `config.feedbackEndpoint`):

| Method | Path             | Auth                       | Body                                   | Response                                                 |
| ------ | ---------------- | -------------------------- | -------------------------------------- | -------------------------------------------------------- |
| POST   | `/api/feedback`  | Bearer token (any user)    | `{ content: string, rating?: number }` | `{ success: true }` or `{ success: true, demo: true }`   |
| GET    | `/api/feedback`  | Bearer token (admin only)  | —                                      | `{ feedbacks: FeedbackRow[] }`                           |
| PATCH  | `/api/feedback`  | Bearer token (admin only)  | `{ id: string, status: 'new' \| 'read' \| 'resolved' }` | `{ success: true }`                                    |

`FeedbackRow` is the raw Supabase row with a joined `users(email, name)`:

```ts
{
  id: string;
  user_id: string;
  content: string;
  rating: number | null;
  status: 'new' | 'read' | 'resolved';
  created_at: string;
  users?: { email?: string; name?: string } | null;
}
```

The host's `GET` handler must verify the caller is an admin (e.g. by selecting `users.role` for `auth.uid()` and checking for `'admin'`). The `PATCH` handler must do the same and update only `status`.

### Example server route (Next.js App Router)

```ts
// app/api/feedback/route.ts
import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@clipop/core';
import { FEEDBACK_SQL } from '@clipop/feedback';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return Response.json({ success: true, demo: true });

  // build config from env here, then:
  // const client = getSupabaseClient(config, token);
  // ... insert into feedbacks ...
}

export async function GET(request: NextRequest) { /* admin-only */ }
export async function PATCH(request: NextRequest) { /* admin-only */ }
```

> The package does not ship a server runtime — host apps wire their own config + Supabase client. See `packages/core/supabase.ts` for the factory.

## Database

Run this DDL in your Supabase SQL editor (also exported as `FEEDBACK_SQL`):

```sql
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  rating INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
-- 用户只能 INSERT/SELECT 自己的反馈
CREATE POLICY "feedback_insert_own" ON feedbacks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "feedback_select_own" ON feedbacks FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- 管理员可 SELECT 所有反馈
CREATE POLICY "feedback_admin_select" ON feedbacks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
```

RLS:

- Users can `INSERT` and `SELECT` only their own rows.
- Admins (any user whose `users.role = 'admin'`) can `SELECT` all rows.
- `UPDATE` is intentionally not granted to clients — status changes go through the server route with admin verification.

The package assumes the host already has a `users(id uuid, role text)` table (matches `AppUser` from `@clipop/core`).

## i18n customization

The default dictionary ships English and Chinese. Pick a locale via the `locale` prop on any component, or globally via `config.defaultLocale`.

```tsx
import { DEFAULT_I18N, getFeedbackI18n } from '@clipop/feedback';

// Override a single string:
<FeedbackDialog
  open={open}
  onOpenChange={setOpen}
  locale="en"
  i18n={{ submit: 'Send', title: 'Got feedback?' }}
/>;

// Add a new locale by composing:
const ja = { ...DEFAULT_I18N.en, button: 'フィードバック', title: 'フィードバックを送る' };
```

`getFeedbackI18n(locale?)` resolves to a full dictionary (falling back to English). `mergeFeedbackI18n(base, override?)` merges a partial override.

The admin manager ships its own `en` / `zh` strings inline; pass `locale="zh"` to switch.

## External feedback link (Tally, etc.)

Set `feedbackExternalUrl` in your `AppConfig`:

```tsx
<AppConfigProvider
  value={{
    // ...
    feedbackExternalUrl: 'https://tally.so/r/xxxx',
  }}
>
```

When set, `<FeedbackButton>` and `<FeedbackWidget>` will open that URL in a new tab on click and skip the in-app dialog entirely. Use this when you'd rather collect feedback through a hosted form (Tally, Typeform, Google Form) and skip the database table.

## Public API

`index.ts` re-exports everything:

```ts
import {
  // client
  submitFeedback,
  listFeedback,
  updateFeedbackStatus,
  type FeedbackStatus,
  type SubmitFeedbackInput,
  type SubmitFeedbackResult,
  FEEDBACK_MAX_LENGTH,
  // components
  FeedbackButton,
  FeedbackDialog,
  FeedbackWidget,
  AdminFeedbackManager,
  // i18n
  DEFAULT_I18N,
  getFeedbackI18n,
  mergeFeedbackI18n,
  type FeedbackLocale,
  type FeedbackI18nDict,
  // sql
  FEEDBACK_SQL,
} from '@clipop/feedback';
```
