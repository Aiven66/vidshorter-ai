'use client';

import { Suspense, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function LoginContent() {
  const { t } = useLocale();
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedSession, setCheckedSession] = useState(false);

  // 直接从 Supabase 检查 session，不依赖 auth context
  useEffect(() => {
    const checkSession = async () => {
      if (checkedSession) return;
      
      try {
        const client = getSupabaseClient();
        const { data } = await client.auth.getSession();
        
        if (data.session?.access_token) {
          const desktop = sp.get('desktop') === '1';
          const redirectUri = sp.get('redirect_uri') || '';
          const state = sp.get('state') || '';
          
          if (desktop && redirectUri) {
            // 如果是桌面登录，并且用户已经登录，直接跳转到回调页面
            const url = new URL(redirectUri);
            url.searchParams.set('state', state);
            url.searchParams.set('access_token', data.session.access_token);
            
            const callbackParams = new URLSearchParams();
            callbackParams.set('deeplink', url.toString());
            if (data.session.user?.email) {
              callbackParams.set('email', data.session.user.email);
            }
            
            router.push(`/desktop/callback?${callbackParams.toString()}`);
          } else {
            // 普通登录，跳转到 dashboard
            router.push('/dashboard');
          }
        }
      } catch (e) {
        console.error('Failed to check session:', e);
      }
      
      setCheckedSession(true);
    };
    
    checkSession();
  }, [router, sp, checkedSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn(email, password);
    
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const desktop = sp.get('desktop') === '1';
    const redirectUri = sp.get('redirect_uri') || '';
    const state = sp.get('state') || '';

    if (desktop && redirectUri) {
      // 先尝试使用从 signIn 返回的 token
      let token = result.token;
      let userEmail = result.email;
      
      // 如果没有获取到 token，尝试直接从 Supabase 获取
      if (!token) {
        try {
          const client = getSupabaseClient();
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token) {
            token = data.session.access_token;
            userEmail = data.session.user?.email || '';
          }
        } catch (e) {
          console.error('Failed to get token from getSession:', e);
        }
      }
      
      if (!token) {
        setError('Failed to get authentication token. Please try again.');
        setLoading(false);
        return;
      }
      
      // 直接构建完整的深度链接
      const url = new URL(redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('access_token', token);
      
      // 将完整的深度链接和用户信息一起传递给回调页面
      const callbackParams = new URLSearchParams();
      callbackParams.set('deeplink', url.toString());
      if (userEmail) {
        callbackParams.set('email', userEmail);
      }
      
      router.push(`/desktop/callback?${callbackParams.toString()}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
            <Video className="h-6 w-6 text-primary" />
            <span>VidShorter AI</span>
          </Link>
          <CardTitle>{t('auth.login.title')}</CardTitle>
          <CardDescription>{t('auth.login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.login.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.login.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('auth.login.submit')}
            </Button>
          </form>

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              OR
            </span>
          </div>

          <Button 
            variant="outline" 
            className="w-full" 
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {t('auth.login.google')}
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('auth.login.noAccount')}{' '}
            <Link href="/register" className="text-primary hover:underline">
              {t('auth.login.register')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-xl mb-4">
              <Video className="h-6 w-6 text-primary" />
              <span>VidShorter AI</span>
            </div>
            <CardTitle>Sign In</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
