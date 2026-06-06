'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function HomeStartButton({ label }: { label: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleStart = () => {
    if (loading) return;

    if (user) {
      document.getElementById('core-video-processor')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    router.push('/register');
  };

  return (
    <Button size="lg" className="h-12 px-7 text-base" onClick={handleStart} disabled={loading}>
      {label}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );
}
