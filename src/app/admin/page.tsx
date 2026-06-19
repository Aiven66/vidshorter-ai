'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ax/login');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4"></div>
      </div>
    </div>
  );
}
