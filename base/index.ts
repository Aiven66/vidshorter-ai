/**
 * Clipop Base Components
 * 
 * 可复用的基础组件库，包含认证、支付和用户反馈功能
 * 
 * @packageDocumentation
 */

export { AuthProvider, useAuth, type User, type AuthContextType } from './auth/AuthProvider';
export { LoginForm } from './auth/LoginForm';
export { RegisterForm } from './auth/RegisterForm';
export { GoogleLoginButton } from './auth/GoogleLoginButton';

export { PaymentModal, type PaymentModalProps, type PlanInfo } from './payment/PaymentModal';
export { PayPalCheckout, type PayPalCheckoutProps } from './payment/PayPalCheckout';

export { UserFeedbackButton, type UserFeedbackButtonProps } from './feedback/UserFeedbackButton';
