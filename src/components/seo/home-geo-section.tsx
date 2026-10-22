import Link from 'next/link';
import {
  BRAND,
  CORE_FAQS,
  PRODUCT_SPECS,
  WORKFLOW_STEPS,
  buildFaqJsonLd,
} from '@/lib/geo-content';

/**
 * 首页服务端正文区块（SEO/GEO）。
 *
 * 只包含静态文案与链接，不依赖任何客户端状态，也不触碰上方的工作台交互。
 * 目的：
 * - 给爬虫与 AI 模型提供可抽取的「输入 → 处理 → 输出」证据块；
 * - 补齐首页的 H2/H3 层级与 FAQPage / HowTo 结构化数据；
 * - 用可核对规格替代「高效 / 强大」这类无信息量表述。
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    buildFaqJsonLd(CORE_FAQS),
    {
      '@type': 'HowTo',
      name: 'How Clipop AI turns a long video into vertical shorts',
      description:
        'Add a video source, let Clipop AI detect highlights, reframe and caption the selected moments, then review and export the clips.',
      totalTime: 'PT5M',
      step: WORKFLOW_STEPS.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        name: step.name,
        text: step.text,
      })),
    },
  ],
};

export function HomeGeoSection() {
  return (
    <section aria-labelledby="product-guide" className="border-t border-border bg-muted/20 py-16 md:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold">Product guide</p>
          <h2 id="product-guide" className="text-2xl font-semibold tracking-tight md:text-3xl">
            What Clipop AI does
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            Clipop AI is an AI video clipping platform. It analyzes a long video, selects the strongest
            moments, reframes them to 9:16 and exports MP4 shorts with burned-in captions. The same source
            can be reviewed as highlights, vertical Shorts or a structured video summary.
          </p>
        </div>

        {/* 输入 / 处理 / 输出 */}
        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-2 text-base font-semibold">Input</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Paste a public YouTube or Bilibili link, or upload a local MP4, MOV or AVI file. No editing
              timeline or manual scrubbing is required.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-2 text-base font-semibold">AI analysis</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The highlight engine scores hooks, topic shifts, emotion and motion, then chooses segments that
              work as standalone short clips.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-2 text-base font-semibold">Output</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each clip is rendered as a 9:16 vertical MP4 with AI captions, ready for YouTube Shorts, TikTok
              and Instagram Reels.
            </p>
          </section>
        </div>

        {/* 工作流 */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            How Clipop AI turns a long video into shorts
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {WORKFLOW_STEPS.map((step, index) => (
              <li key={step.name} className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-1.5 text-base font-medium">
                  <span className="mr-2 text-gold">{index + 1}.</span>
                  {step.name}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 规格表 */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Supported sources and output specifications
          </h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Item</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Specification</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCT_SPECS.map((spec) => (
                  <tr key={spec.label} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="w-48 px-5 py-3 align-top font-medium text-foreground">
                      {spec.label}
                    </th>
                    <td className="px-5 py-3 align-top text-muted-foreground">{spec.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 适用人群 */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Who Clipop AI is for</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Clipop AI is used by content creators, podcasters and interview hosts, MCN teams and social media
            managers, educators and course creators, and e-commerce brands that need a steady output of short
            vertical video from long-form material.
          </p>
        </section>

        {/* FAQ */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Frequently asked questions</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {CORE_FAQS.map((item) => (
              <section key={item.question} className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-2 text-base font-medium">{item.question}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </section>
            ))}
          </div>
        </section>

        {/* 内链 */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Explore Clipop AI</h2>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/video-clips">
              Highlight Clips
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/shorts">
              Shorts Studio
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/video-notes">
              YouTube Video Summarizer
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/ai-tools">
              AI Toolbox
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/pricing">
              Pricing
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/faq">
              FAQ
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/about">
              About
            </Link>
            <Link className="rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-accent" href="/contact">
              Contact
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Product facts on this page are maintained by the Clipop AI team. For corrections, email{' '}
            <a className="underline hover:text-primary" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>.
          </p>
        </section>
      </div>
    </section>
  );
}
