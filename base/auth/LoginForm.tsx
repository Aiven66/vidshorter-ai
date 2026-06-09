'use client';

/**
 * 登录表单组件
 * 
 * 提供邮箱密码登录功能
 * 
 * @example
 * ```tsx
 * import { LoginForm } from './base/auth/LoginForm';
 * 
 * function LoginPage() {
 *   return <LoginForm />;
 * }
 * ```
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Mail, Lock } from 'lucide-react';
import Link from 'next/link';
import { GoogleLoginButton } from './GoogleLoginButton';
import { useAuth } from './AuthProvider';

interface LoginFormProps {
  /** 登录成功后的跳转地址，默认 '/' */
  redirectTo?: string;
  /** 是否显示注册链接，默认 true */
  showRegisterLink?: boolean;
  /** 是否显示忘记密码链接，默认 true */
  showForgotPassword?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 额外的加载状态 */
  loading?: boolean;
  /** 登录成功回调 */
  onSuccess?: () => void;
}

export function LoginForm({
  redirectTo = '/',
  showRegisterLink = true,
  showForgotPassword = true,
  className = '',
  loading: externalLoading,
  onSuccess,
}: LoginFormProps) {
  const { signIn, signInWithGoogle, loading: authLoading, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState('');

  const loading = externalLoading || localLoading || authLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);
    setError('');

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setLocalLoading(false);
      return;
    }

    if (onSuccess) {
      onSuccess();
    } else {
      window.location.href = redirectTo;
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLocalLoading(false);
    }
    return result;
  };

  if (user && !authLoading) {
    return (
      <Card className={`w-full max-w-md shadow-lg border-0 ${className}`}>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Already Logged In</CardTitle>
          <CardDescription>
            You are already logged in as {user.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={() => window.location.href = redirectTo}>
            Go to Home
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full max-w-md shadow-lg border-0 ${className}`}>
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 text-sm flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10 h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10 h-11"
              />
            </div>
          </div>
          {showForgotPassword && (
            <div className="text-right">
              <Link href="/forgot-password" className="text-sm text-primary font-medium hover:underline">
                Forgot password?
              </Link>
            </div>
          )}
          <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <GoogleLoginButton onGoogleClick={handleGoogleSignIn} />

        {showRegisterLink && (
          <div className="text-center text-sm pt-1">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
