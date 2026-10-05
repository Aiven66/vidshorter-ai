import { REMIX_COPY } from '@/lib/tiktok-remix-content';
import { TiktokRemixStudio } from '@/components/tiktok/tiktok-remix-studio';
import { SITE_URL } from '@/lib/seo';
import { Sparkles } from 'lucide-react';

/**
 * TikTok → 原创二创 落地页（主页面）。
 *
 * SSR 正文固定使用英文（与全站 SSR 一致：根 layout 的 serverLocale = defaultLocale），
 * 保证爬虫拿到稳定的静态 HTML；客户端工作台在 hydration 后按用户语言切换。
 */
const copy = REMIX_COPY.en;

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'FAQPage',
      mainEntity: copy.faq.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@type': 'HowTo',
      name: copy.hero.h1,
      description: copy.meta.description,
      step: copy.how.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.title,
        text: s.desc,
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'TikTok Video Remaker', item: `${SITE_URL}/tiktok-remix` },
      ],
    },
  ],
};

export default function TiktokRemixPage() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-8 text-center md:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {copy.hero.badge}
          </div>
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">{copy.hero.h1}</h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {copy.hero.sub}
          </p>
        </div>

        {/* 客户端工作台：粘贴链接 → 拆解 → 生成 */}
        <TiktokRemixStudio />

        {/* How it works（SSR 正文，供搜索引擎收录） */}
        <section className="mt-14">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">{copy.how.title}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {copy.how.steps.map((step, i) => (
              <div key={step.title} className="rounded-xl border border-border bg-card p-5">
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <h3 className="mb-1.5 text-base font-medium text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ（SSR 正文 + FAQPage 结构化数据） */}
        <section className="mt-14">
          <h2 className="mb-6 text-2xl font-semibold text-foreground">{copy.faq.title}</h2>
          <div className="space-y-4">
            {copy.faq.items.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-2 text-base font-medium text-foreground">{item.q}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 底部 CTA */}
        <section className="mt-14 rounded-xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-foreground">{copy.bottomCta.title}</h2>
          <p className="mb-5 text-sm text-muted-foreground">{copy.bottomCta.sub}</p>
          <a
            href="/ai-video"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.bottomCta.cta}
          </a>
        </section>
      </div>
    </div>
  );
}