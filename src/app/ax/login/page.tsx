'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { normalizeAuthInput } from '@/lib/auth-context';
import { isAdminUser } from '@/lib/admin-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function AxLoginPage() {
  const router = useRouter();
  const { user, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 登录成功后 context 的 user 是异步更新的，闭包里直接读 `user` 拿到的
  // 永远是提交前的旧值（null），导致管理员也被误判 "not admin"。
  // 用 ref 跟踪最新值。
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // user 就绪且为管理员 → 立即进入后台（主路径）
  useEffect(() => {
    if (user && isAdminUser(user)) {
      router.replace('/ax');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      // 登录成功。user 更新后上方 useEffect 会自动跳 /ax；
      // 这里兜底处理"已登录但非管理员"的情况（用 ref 读最新 user）。
      setTimeout(() => {
        const latest = userRef.current;
        if (latest && isAdminUser(latest)) {
          router.replace('/ax');
        } else if (latest) {
          setError('This account does not have admin access.');
        } else {
          // user 尚未同步（网络慢）——继续等 useEffect，不误报
          setError('Signed in. Verifying admin access…');
        }
      }, 800);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Secure Admin Access</h1>
          <p className="text-slate-400 text-sm">Restricted area — admin credentials required</p>
        </div>

        <Card className="border-slate-700 bg-slate-800/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Admin Sign In
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter your administrator credentials to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(normalizeAuthInput(e.target.value))}
                  placeholder="admin@example.com"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || authLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white"
              >
                {submitting ? 'Verifying...' : 'Sign In to Admin Panel'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-500 text-xs mt-6">
          Unauthorized access attempts are logged and monitored.
        </p>
      </div>
    </div>
  );
}
