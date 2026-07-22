/**
 * @clipop/core - Shared type definitions
 *
 * Zero business coupling. All app-specific strings come from ConfigProvider.
 */

/** Application user (database row shape). */
export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatarUrl?: string | null;
  googleId?: string | null;
  createdAt?: string;
}

/** Authentication result returned by signIn/signUp/signInWithGoogle. */
export interface AuthResult {
  user: AppUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  /** True if running in demo mode (no Supabase configured). */
  isDemo?: boolean;
}

/** Plan identifier (apps may extend via PlanConfig). */
export type PlanId = string;

/** Subscription plan definition. */
export interface PlanConfig {
  id: PlanId;
  name: string;
  /** Price in USD. 0 for free tier. */
  priceIntl: number;
  /** Price in CNY for China region. */
  priceCny: number;
  /** Daily credits granted by this plan. */
  dailyCredits: number;
  /** Whether credits are unlimited (e.g. pro tier). */
  unlimitedCredits?: boolean;
  /** Highlight label, e.g. "Most Popular". */
  badge?: string;
  features: string[];
}

/** Subscription record stored in DB. */
export interface Subscription {
  id: string;
  userId: string;
  planType: PlanId;
  status: 'active' | 'cancelled' | 'expired';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  /** Generic provider order ID (Stripe / PayPal / Creem / Alipay / WeChat). */
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
}

/** Credits balance record. */
export interface Credits {
  id: string;
  userId: string;
  balance: number;
  lastResetAt: string;
}

/** Credit transaction log entry. */
export interface CreditTransaction {
  id: string;
  userId: string;
  /** Positive for additions, negative for deductions. */
  amount: number;
  /** 'daily_reset' | 'video_process' | 'purchase' | app-defined. */
  type: string;
  description: string;
  relatedId?: string | null;
  createdAt: string;
}

/** Supported locale identifier (e.g. 'en', 'zh', 'zh-Hant', 'ja'). */
export type Locale = string;

/** Blog post record. */
export interface BlogPost {
  id: string;
  title: string;
  category: string;
  /** HTML rich-text content. */
  content: string;
  coverImage?: string | null;
  authorId?: string | null;
  isPublished: boolean;
  viewCount: number;
  locale: Locale;
  /** Points to root post id (null = root). Used for multi-language translations. */
  parentId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/** User feedback record. */
export interface Feedback {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  content: string;
  /** 1-5 star rating. */
  rating?: number | null;
  status: 'new' | 'read' | 'resolved';
  createdAt: string;
}

/** Behavior event tracked by analytics SDK. */
export interface BehaviorEvent {
  id?: string | number;
  userId?: string | null;
  userEmail?: string | null;
  sessionId: string;
  eventName: string;
  funnelId?: string | null;
  stepIndex?: number | null;
  eventData?: Record<string, unknown>;
  pageUrl?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  country?: string | null;
  createdAt?: string;
}

/** Funnel step definition for analytics. */
export interface FunnelStep {
  event: string;
  step: number;
  funnelId: string;
}

/** Aggregated funnel statistics. */
export interface FunnelStats {
  funnelId: string;
  steps: Array<{
    step: number;
    eventName: string;
    count: number;
    uniqueUsers: number;
    uniqueSessions: number;
    conversionFromPrevious: number;
    conversionFromFirst: number;
  }>;
}

/** Payment provider identifier. */
export type PaymentProvider = 'stripe' | 'paypal' | 'creem' | 'alipay' | 'wechat' | 'custom';

/** Payment channel configuration. */
export interface PaymentChannelConfig {
  provider: PaymentProvider;
  enabled: boolean;
  /** Environment variables or runtime config required by the provider. */
  config: Record<string, string>;
}

/** Result of a payment initiation. */
export interface PaymentInitResult {
  /** URL to redirect the user to (e.g. PayPal approve URL). */
  redirectUrl?: string;
  /** Order ID from provider. */
  orderId: string;
  provider: PaymentProvider;
  /** App may show this in UI (e.g. QR code link for WeChat Pay). */
  qrCodeUrl?: string;
}

/** Desktop bridge — minimum surface a desktop shell must implement. */
export interface DesktopBridge {
  getMediaBaseUrl?: () => Promise<string>;
  openAuth?: () => Promise<{ ok?: boolean }>;
  openWebLogin?: () => Promise<{ ok?: boolean }>;
  openWebRegister?: () => Promise<{ ok?: boolean }>;
  getAuthToken?: () => Promise<string>;
  clearAuthToken?: () => Promise<{ ok?: boolean }>;
}

/** Admin verification result from server. */
export interface AdminVerifyResult {
  isAdmin: boolean;
  reason?: string;
}
