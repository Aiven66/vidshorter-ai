import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import {
  BRAND,
  EXTENDED_FAQS,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
} from '@/lib/geo-content';

export const metadata: Metadata = buildMetadata({
  title: 'Clipop AI FAQ - Sources, Output, Credits & Privacy',
  description:
    'Answers about Clipop AI: supported video sources, clip length, 9:16 output and export quality, credits and pricing, desktop apps, languages, content rights and data handling.',
  path: '/faq',
  keywords: ['Clipop AI FAQ', 'AI video clipper questions', 'video to shorts FAQ', 'Clipop AI credits', 'Clipop AI privacy'],
});

/** 按主题分组展示，保证每个 H2 都是可独立抽取的证据块。 */
const GROUPS: Array<{ title: string; indexes: number[] }> = [
  { title: 'Product and video inputs', indexes: [0, 1, 2, 3] },
  { title: 'Credits and plans', indexes: [4, 10, 12] },
  { title: 'Workflow and platforms', indexes: [5, 11, 13, 14] },
  { title: 'Rights, privacy and support', indexes: [7, 8, 9, 6] },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    buildFaqJsonLd(EXTENDED_FAQS),
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'FAQ', path: '/faq' },
    ]),
  ],
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto max-w-3xl px-4 py-14 md:py-20">
        <header className="mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold">FAQ</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Clipop AI FAQ</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Straight answers about Clipop AI: which videos you can use, what the AI produces, how credits work,
            where your data goes and how to reach the team.
          </p>
        </header>

        <article className="space-y-12">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="mb-5 text-2xl font-semibold tracking-tight">{group.title}</h2>
              <div className="space-y-4">
                {group.indexes.map((index) => {
                  const item = EXTENDED_FAQS[index];
                  if (!item) return null;
                  return (
                    <section key={item.question} className="rounded-xl border border-border bg-card p-5">
                      <h3 className="mb-2 text-base font-medium">{item.question}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                    </section>
                  );
                })}
              </div>
            </section>
          ))}
        </article>

        <section className="mt-14 rounded-2xl border border-border bg-muted/30 p-6 md:p-8">
          <h2 className="text-xl font-semibold">Still need help?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Email <a className="underline hover:text-primary" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>{' '}
            for product and billing questions, or read the{' '}
            <Link className="underline hover:text-primary" href="/contact">contact page</Link>{' '}
            for privacy and abuse contacts.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90" href="/">
              Start with 180 free credits
            </Link>
            <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/pricing">
              Compare plans
            </Link>
            <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/about">
              About Clipop AI
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
