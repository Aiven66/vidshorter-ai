import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata, SITE_URL } from '@/lib/seo';
import {
  REMIX_COPY,
  REMIX_TEMPLATE_PAGES,
  findRemixTemplatePage,
} from '@/lib/tiktok-remix-content';
import { TiktokRemixStudio } from '@/components/tiktok/tiktok-remix-studio';
import { Sparkles, ArrowRight } from 'lucide-react';

/** 8 个模版子页在构建期静态化（长尾词落地页）。 */
export function generateStaticParams() {
  return REMIX_TEMPLATE_PAGES.map((page) => ({ template: page.slug }));
}

/** 只允许上面 8 个 slug：未知子路径直接 404，避免产生可被索引的软 404 页面。 */
export const dynamicParams = false;

type Params = { params: Promise<{ template: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { template } = await params;
  const page = findRemixTemplatePage(template);
  if (!page) return buildMetadata({ title: 'TikTok video remaker', description: '', path: '/tiktok-remix' });

  return buildMetadata({
    title: page.h1.en,
    description: page.intro.en,
    path: `/tiktok-remix/${page.slug}`,
    keywords: page.keywords.en,
  });
}

export default async function TiktokRemixTemplatePage({ params }: Params) {
  const { template } = await params;
  const page = findRemixTemplatePage(template);
  if (!page) notFound();

  const copy = REMIX_COPY.en;
  const url = `${SITE_URL}/tiktok-remix/${page.slug}`;
  const isAiVideo = page.entry.type === 'ai-video';
  const siblings = REMIX_TEMPLATE_PAGES.filter((p) => p.slug !== page.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'TikTok Video Remaker', item: `${SITE_URL}/tiktok-remix` },
          { '@type': 'ListItem', position: 3, name: page.h1.en, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        name: page.h1.en,
        description: page.intro.en,
        url,
        inLanguage: 'en',
      },
    ],
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link
            href="/tiktok-remix"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {copy.hero.badge}
          </Link>
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">{page.h1.en}</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {page.intro.en}
          </p>
        </div>

        {/* 该模版的拆解要点 */}
        <ul className="mb-10 grid gap-3 md:grid-cols-3">
          {page.bullets.en.map((b) => (
            <li key={b} className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
              {b}
            </li>
          ))}
        </ul>

        {/* 工作台：普通模版走拆解 → AI 成片；数字人走专用入口 */}
        {isAiVideo ? (
          <TiktokRemixStudio defaultTemplate={page.slug} />
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{copy.complianceResult}</p>
            <Link
              href="/digital-human-live"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {copy.bottomCta.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* 内链：其它模版子页 */}
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{copy.result.anglesLabel}</h2>
          <div className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <Link
                key={s.slug}
                href={`/tiktok-remix/${s.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
              >
                <span className="block h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
                {s.h1.en}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}