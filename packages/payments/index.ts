/**
 * @clipop/payments - Public API
 *
 * Universal payments package: multi-channel checkout (PayPal/Creem/Alipay/WeChat),
 * credits context, pricing page, server-side subscription application, and
 * webhook signature verification.
 *
 * All branding/app configuration is injected via AppConfigProvider from
 * '@clipop/core'.
 */

export {
  CreditsProvider,
  useCredits,
  getDailyCreditsForPlan,
  type CreditsProviderProps,
  type CreditsContextValue,
} from './credits-provider';

export {
  PaymentModal,
  type PaymentModalProps,
} from './payment-modal';

export {
  PayPalCheckout,
  type PayPalCheckoutProps,
} from './paypal-checkout';

export {
  PricingPage,
  type PricingPageProps,
} from './pricing-page';

export {
  applyPlanPurchase,
  getPlanCredits,
  isPaidPlan,
  PLAN_CREDITS,
  type PlanPurchaseInput,
  type PlanPurchaseResult,
} from './server/subscriptions';

export {
  verifyCreemWebhook,
  verifyCreemWebhookWithSignature,
  verifyPaypalWebhook,
  verifyPaypalWebhookFromConfig,
  verifyAlipayWebhook,
  verifyWechatWebhook,
  verifyWechatWebhookFromConfig,
  toPem,
  type PayPalWebhookVerifyConfig,
  type PayPalWebhookHeaders,
  type WechatWebhookResult,
} from './server/verify-webhook';
