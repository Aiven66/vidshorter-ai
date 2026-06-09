# Clipop Base Components

可复用的基础组件库，包含认证、支付和用户反馈功能。

## 安装

1. 将 `base` 文件夹复制到你的项目目录中
2. 安装依赖（如果尚未安装）：
   ```bash
   pnpm add lucide-react
   ```

3. 确保你的项目已配置：
   - Tailwind CSS
   - shadcn/ui 组件库
   - Next.js App Router

## 组件列表

### 认证模块 (`/auth`)

#### AuthProvider
认证状态提供者，需要包裹在你的应用外层。

```tsx
import { AuthProvider } from './base/auth/AuthProvider';

function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}
```

#### useAuth
认证 Hook，用于访问用户状态和认证方法。

```tsx
import { useAuth } from './base/auth/AuthProvider';

function Profile() {
  const { user, signOut } = useAuth();
  
  if (!user) return <div>Please login</div>;
  
  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

#### LoginForm
登录表单组件，支持邮箱密码登录和 Google OAuth。

```tsx
import { LoginForm } from './base/auth/LoginForm';

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoginForm 
        redirectTo="/dashboard"
        showRegisterLink={true}
      />
    </div>
  );
}
```

#### RegisterForm
注册表单组件，支持邮箱注册和验证码验证。

```tsx
import { RegisterForm } from './base/auth/RegisterForm';

function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <RegisterForm 
        redirectTo="/"
        showTerms={true}
      />
    </div>
  );
}
```

#### GoogleLoginButton
Google 一键登录按钮。

```tsx
import { GoogleLoginButton } from './base/auth/GoogleLoginButton';

function LoginPage() {
  const handleGoogleLogin = async () => {
    // 自定义 Google 登录逻辑
    return { error: null };
  };
  
  return (
    <GoogleLoginButton 
      onGoogleClick={handleGoogleLogin}
      label="Login with Google"
    />
  );
}
```

### 支付模块 (`/payment`)

#### PaymentModal
支付模态框，支持 Creem 和 PayPal 两种支付方式。

```tsx
import { useState } from 'react';
import { PaymentModal } from './base/payment/PaymentModal';

function PricingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  
  const handleSubscribe = (planInfo) => {
    setPlan(planInfo);
    setModalOpen(true);
  };
  
  return (
    <>
      <button onClick={() => handleSubscribe({ id: 'pro', name: 'Pro', price: { intl: 19.9 }, period: 'month' })}>
        Subscribe to Pro
      </button>
      <PaymentModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        plan={plan}
        onPaymentSuccess={() => console.log('Payment successful!')}
      />
    </>
  );
}
```

#### PayPalCheckout
PayPal 支付组件，可单独使用。

```tsx
import { PayPalCheckout } from './base/payment/PayPalCheckout';

function PayPalButton() {
  return (
    <PayPalCheckout
      planId="pro"
      userId="user_123"
      onSuccess={() => alert('Payment successful!')}
      onError={(msg) => alert(msg)}
    />
  );
}
```

### 用户反馈模块 (`/feedback`)

#### UserFeedbackButton
用户反馈按钮，点击打开外部反馈表单。

```tsx
import { UserFeedbackButton } from './base/feedback/UserFeedbackButton';

function Navbar() {
  return (
    <nav className="flex items-center gap-4">
      <a href="/">Home</a>
      <a href="/about">About</a>
      <UserFeedbackButton />
    </nav>
  );
}
```

## 环境变量

### Supabase 配置（认证必需）
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### PayPal 配置（支付可选）
在 `/api/payment/paypal` API 中配置：
```env
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
```

### Creem 配置（支付可选）
在 `/api/payment/creem` API 中配置：
```env
CREEM_API_KEY=your-creem-api-key
CREEM_PRODUCT_ID=your-creem-product-id
```

## API Routes

组件依赖以下 API Routes，请一并复制到你的项目中：

```
/api/
├── auth/
│   └── callback/          # OAuth 回调
├── check-email/           # 检查邮箱是否已注册
├── send-verification-code/ # 发送验证码
├── payment/
│   ├── creem/
│   │   └── route.ts       # Creem 支付 API
│   └── paypal/
│       └── route.ts       # PayPal 支付 API
└── user/
    └── route.ts           # 用户信息 API
```

## 样式依赖

这些组件依赖以下 shadcn/ui 组件，请确保已安装：

```bash
npx shadcn@latest add button input card dialog separator badge checkbox label
```

## License

MIT
