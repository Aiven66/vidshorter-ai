'use client';

import dynamic from 'next/dynamic';

const HomeFAQ = dynamic(() => import('@/components/home/home-faq'), {
  ssr: false,
  loading: () => (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <div className="h-7 bg-muted animate-pulse rounded w-20 mx-auto mb-4" />
            <div className="h-8 bg-muted animate-pulse rounded w-48 mx-auto mb-3" />
            <div className="h-4 bg-muted animate-pulse rounded w-64 mx-auto" />
          </div>
          <div className="rounded-lg border bg-background px-4 space-y-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 bg-muted/50 animate-pulse rounded" />
            ))}
          </div>
        </div>
      </div>
    </section>
  ),
});

export default function ClientFAQ() {
  return <HomeFAQ />;
}
