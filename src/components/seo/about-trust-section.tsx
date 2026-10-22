import Link from 'next/link';
import { BRAND, PRODUCT_SPECS } from '@/lib/geo-content';

/**
 * About 页的信任闭环区块（GEO 报告 H 维度的核心缺口）：
 * 主体可识别、能力可核对、联系方式可验证、合规页可直达。
 *
 * 纯静态服务端内容，放在 About 原有视觉区块之后、CTA 之前。
 */
export function AboutTrustSection() {
  return (
    <section aria-labelledby="company-facts" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold">Company & product facts</p>
            <h2 id="company-facts" className="text-3xl font-bold tracking-tight md:text-4xl">
              Who makes Clipop AI, and what you can verify
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Clipop AI is an independent software product built and operated by the Clipop AI team. The facts
              below match the live product, the pricing page and the legal pages, so you do not have to rely on
              marketing adjectives alone.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-lg font-semibold">What Clipop AI is</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                An AI video clipping platform that turns long videos, podcasts and articles into 9:16 vertical
                shorts. It detects highlight moments, reframes the subject, generates captions and exports MP4
                files for YouTube Shorts, TikTok and Instagram Reels.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-lg font-semibold">Who it is for</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Content creators, podcasters and interview hosts, MCN teams, social media managers, educators
                and e-commerce brands that need a repeatable short-video workflow from long-form material.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-lg font-semibold">How to verify the product claims</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Pricing and credit allowances:{' '}
                  <Link className="underline hover:text-primary" href="/pricing">pricing page</Link>.
                </li>
                <li>
                  Sources, output format and clip length:{' '}
                  <Link className="underline hover:text-primary" href="/faq">FAQ</Link> and{' '}
                  <Link className="underline hover:text-primary" href="/">home page product guide</Link>.
                </li>
                <li>
                  Content ownership, refunds and prohibited uses:{' '}
                  <Link className="underline hover:text-primary" href="/terms">Terms of Service</Link>.
                </li>
                <li>
                  Data collection, retention and AI processing:{' '}
                  <Link className="underline hover:text-primary" href="/privacy">Privacy Policy</Link>.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-3 text-lg font-semibold">Contact</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  Product and billing:{' '}
                  <a className="underline hover:text-primary" href={`mailto:${BRAND.supportEmail}`}>
                    {BRAND.supportEmail}
                  </a>
                </li>
                <li>
                  Privacy and data requests:{' '}
                  <a className="underline hover:text-primary" href={`mailto:${BRAND.privacyEmail}`}>
                    {BRAND.privacyEmail}
                  </a>
                </li>
                <li>
                  Content violations:{' '}
                  <a className="underline hover:text-primary" href={`mailto:${BRAND.abuseEmail}`}>
                    {BRAND.abuseEmail}
                  </a>
                </li>
                <li>
                  Full contact details:{' '}
                  <Link className="underline hover:text-primary" href="/contact">contact page</Link>.
                </li>
              </ul>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-muted/30 p-6">
            <h3 className="mb-3 text-lg font-semibold">Product specifications</h3>
            <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
              {PRODUCT_SPECS.map((spec) => (
                <div key={spec.label}>
                  <dt className="font-medium text-foreground">{spec.label}</dt>
                  <dd className="text-muted-foreground">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
