# @clipop/payments

Universal payments package: multi-channel checkout (PayPal / Creem / Alipay / WeChat Pay), credits context, subscription management, and webhook signature verification.

Zero brand coupling — all app-specific strings (app name, prices, plan ids) come from `useAppConfig()` provided by `@clipop/core`.

## Installation

```bash
pnpm add @clipop/payments @clipop/core react @supabase/supabase-js
```

In a monorepo, add to your app `package.json`:

```json
{
  "dependencies": {
    "@clipop/payments": "workspace:*",
    "@clipop/core": "workspace:*"
  }
}
```

## Configuration

Wrap your app with `AppConfigProvider` and provide a `paymentChannels` array:

```tsx
import { AppConfigProvider } from '@clipop/core';

<AppConfigProvider value={{
  appName: 'MyApp',
  appUrl: 'https://myapp.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // server-only
  dailyFreeCredits: 100,
  adminCredits: 10_000,
  plans: [
    { id: 'free',    name: 'Free',    priceIntl: 0,    priceCny: 0,  dailyCredits: 100,   features: [...] },
    { id: 'starter', name: 'Starter', priceIntl: 9.9, priceCny: 49, dailyCredits: 500,   badge: 'Popular', features: [...] },
    { id: 'pro',     name: 'Pro',     priceIntl: 19.9,priceCny: 99, dailyCredits: 1_000_000, unlimitedCredits: true, features: [...] },
  ],
  paymentChannels: [
    { provider: 'paypal', enabled: true, config: { clientId: '...', clientSecret: '...', webhookId: '...', environment: 'sandbox' } },
    { provider: 'creem',   enabled: true, config: { apiKey: '...', webhookSecret: '...' } },
    { provider: 'alipay',  enabled: true, config: { appId: '...', privateKey: '...', publicKey: '...' } },
    { provider: 'wechat',  enabled: true, config: { appId: '...', mchId: '...', apiV3Key: '...', serialNo: '...', privateKey: '...' } },
  ],
}}>
  {children}
</AppConfigProvider>
```

## Components

### `<CreditsProvider>` / `useCredits()`

```tsx
import { CreditsProvider, useCredits } from '@clipop/payments';

<CreditsProvider user={user} accessToken={token}>
  <CreditDisplay />
</CreditsProvider>;

function CreditDisplay() {
  const { balance, plan, loading, deductCredits, addCredits, refresh } = useCredits();
  // balance: number
  // plan: string | null
  // deductCredits(amount, type?, description?) => Promise<boolean>
  // addCredits(amount, type?, description?)    => Promise<boolean>
  return <div>{balance} credits remaining</div>;
}
```

Behavior:
- Demo mode (`userId` starts with `demo-` OR Supabase not configured): uses `localStorage` key `app_demo_credits_<userId>`.
- Admin users always see `Math.max(balance, config.adminCredits)`; `deductCredits` returns `true` without touching DB.
- Cross-UTC-day reset: on first fetch of a new UTC day, balance is reset to plan's `dailyCredits` and a `daily_reset` transaction is logged.
- All DB ops use the service role client (bypasses RLS).

### `<PaymentModal>`

```tsx
import { PaymentModal } from '@clipop/payments';

<PaymentModal
  open={open}
  onOpenChange={setOpen}
  plan={selectedPlan}
  userId={user.id}
  onPaymentSuccess={(provider, orderId) => {
    console.log('Paid via', provider, 'order', orderId);
  }}
/>;
```

Renders a native dialog (no shadcn/ui). For PayPal it embeds `<PayPalCheckout>` inline; other providers POST to `/api/payment/{provider}` and either redirect or display a QR code (`qrCodeUrl` / `codeUrl`).

### `<PayPalCheckout>`

```tsx
import { PayPalCheckout } from '@clipop/payments';

<PayPalCheckout
  planId="starter"
  userId={user.id}
  onSuccess={(orderId) => { /* ... */ }}
  onError={(msg) => { /* ... */ }}
/>;
```

Dynamically loads `https://www.paypal.com/sdk/js?client-id=<clientId>&currency=USD&intent=capture` and renders PayPal Buttons. `clientId` is read from `useAppConfig().paymentChannels[provider='paypal'].config.clientId`.

### `<PricingPage>`

```tsx
import { PricingPage } from '@clipop/payments';

<PricingPage
  userId={user?.id}
  locale="zh" // optional: defaults to config.defaultLocale
  onSubscribe={(plan) => {
    if (!user) router.push('/login');
  }}
/>;
```

Renders a 3-column plan grid from `config.plans` with badges, features list, and CTA buttons. Free plan CTA does not open the payment modal.

## Server-side: `applyPlanPurchase`

```ts
import { applyPlanPurchase } from '@clipop/payments/server/subscriptions';
// or: import { applyPlanPurchase } from '@clipop/payments';

await applyPlanPurchase(config, {
  userId: 'user-uuid',
  planId: 'starter',
  provider: 'creem',
  orderId: 'order_abc123',
});
```

Actions:
1. `upsert subscriptions` (plan_type, status='active', provider_subscription_id, current_period_start/end).
2. `upsert credits` (balance = `Math.max(existing, plan.dailyCredits)`, last_reset_at = now UTC midnight).
3. `insert credit_transactions` (amount=planCredits, type='purchase', description includes provider + orderId).

Idempotent: queries `credit_transactions` for an existing record with the same description (orderId) and skips if found.

Helpers:
- `getPlanCredits(config, planId): number` — plan.dailyCredits lookup.
- `isPaidPlan(config, planId): boolean` — true if plan exists and price > 0.

## Webhook verification

### Creem (HMAC-SHA256)

```ts
import { verifyCreemWebhookWithSignature } from '@clipop/payments';

const signature = request.headers.get('creem-signature') || '';
const rawBody = await request.text();
const ok = verifyCreemWebhookWithSignature(rawBody, signature, webhookSecret);
```

### PayPal (Webhooks API)

```ts
import { verifyPaypalWebhookFromConfig } from '@clipop/payments';

const headers = Object.fromEntries(request.headers.entries());
const rawBody = await request.text();
const ok = await verifyPaypalWebhookFromConfig(headers, rawBody, config);
```

### Alipay (RSA2)

```ts
import { verifyAlipayWebhook, toPem } from '@clipop/payments';

const formData = await request.formData();
const params = Object.fromEntries(formData.entries()) as Record<string, string>;
const publicKeyPem = toPem(process.env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY');
const ok = verifyAlipayWebhook(params, publicKeyPem);
```

### WeChat Pay v3 (AES-256-GCM)

```ts
import { verifyWechatWebhookFromConfig } from '@clipop/payments';

const rawBody = await request.text();
const { ok, decrypted, error } = verifyWechatWebhookFromConfig(rawBody, config);
if (ok) {
  const payload = decrypted as { out_trade_no?: string; trade_state?: string; attach?: string };
  // ... apply purchase ...
}
```

## Host app API routes

The host application must implement these HTTP endpoints (path is hardcoded in client components):

| Method | Path                       | Body / Query                                  | Returns                                                          |
|--------|----------------------------|-----------------------------------------------|------------------------------------------------------------------|
| POST   | `/api/payment/paypal`      | `{ action: 'create' \| 'capture', planId, userId, orderId }` | `{ orderId }` (create) or `{ paid: boolean }` (capture)         |
| GET    | `/api/payment/paypal`      | —                                             | `{ enabled, clientId, currency, environment }`                   |
| POST   | `/api/payment/creem`      | `{ planId, userId, userEmail?, successUrl, cancelUrl }` | `{ checkoutUrl, sessionId, demo? }`                       |
| GET    | `/api/payment/creem`      | `?session_id=...`                             | `{ paid: boolean }`                                               |
| POST   | `/api/payment/alipay`     | `{ planId, userId, amount, subject, successUrl, cancelUrl }` | `{ payUrl, orderId }`                                    |
| POST   | `/api/payment/wechat`     | `{ planId, userId, amount, description, successUrl, cancelUrl }` | `{ codeUrl, orderId, demo? }`                          |

Each POST should accept `successUrl` and `cancelUrl` and return `{ redirectUrl, orderId, provider, qrCodeUrl? }`. The `<PaymentModal>` component will redirect or render the QR code based on these fields.

## Database tables

Required tables (matches `@clipop/core` types):

```sql
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plan_type text not null,
  status text not null default 'active',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists credits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  balance integer not null default 0,
  last_reset_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  amount integer not null,
  type text not null,
  description text,
  related_id text,
  created_at timestamptz default now()
);

create index on subscriptions (user_id);
create index on credits (user_id);
create index on credit_transactions (user_id);
```

## License

MIT
