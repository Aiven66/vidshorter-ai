'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight } from 'lucide-react';

export function HomeStartButton({ label }: { label: string }) {
  const { loading } = useAuth();

  // P0-2 免登录试跑：未登录不再强制跳注册，直接滚动到处理器即可试跑一条低清预览，
  // 与已登录行为一致 —— 降低激活门槛。
  const handleStart = () => {
    if (loading) return;
    document.getElementById('core-video-processor')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <Button size="lg" className="h-12 px-7 text-base" onClick={handleStart} disabled={loading}>
      {label}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );
}
