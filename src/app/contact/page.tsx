import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { BRAND, buildBreadcrumbJsonLd } from '@/lib/geo-content';

export const metadata: Metadata = buildMetadata({
  title: 'Contact Clipop AI - Support, Privacy & Abuse',
  description:
    'Contact Clipop AI for product support, billing questions, privacy and data requests, or content violation reports. Support email, response guidance and company details.',
  path: '/contact',
  keywords: ['Contact Clipop AI', 'Clipop AI support', 'Clipop AI privacy contact', 'AI video clipper support'],
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      name: 'Contact Clipop AI',
      url: `${BRAND.url}/contact`,
      description:
        'Support, privacy and abuse contact details for Clipop AI, an AI video clipping platform.',
      about: { '@id': `${BRAND.url}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${BRAND.url}/#organization`,
      name: BRAND.name,
      url: BRAND.url,
      description: BRAND.description,
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: BRAND.supportEmail,
          availableLanguage: ['English', 'Chinese'],
        },
        {
          '@type': 'ContactPoint',
          contactType: 'privacy',
          email: BRAND.privacyEmail,
        },
        {
          '@type': 'ContactPoint',
          contactType: 'content abuse',
          email: BRAND.abuseEmail,
        },
      ],
    },
    buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Contact', path: '/contact' },
    ]),
  ],
};

const CONTACT_CHANNELS = [
  {
    title: 'Product & billing support',
    email: BRAND.supportEmail,
    description:
      'Questions about a plan, credits, a failed render, export quality, the desktop app or your account.',
  },
  {
    title: 'Privacy & data requests',
    email: BRAND.privacyEmail,
    description:
      'Access, correction, deletion, portability or other data rights requests. We may need to verify your identity before acting.',
  },
  {
    title: 'Content violations',
    email: BRAND.abuseEmail,
    description:
      'Report content that infringes copyright, violates the Terms of Service or breaks the content standards.',
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto max-w-4xl px-4 py-14 md:py-20">
        <header className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold">Contact</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Contact Clipop AI</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Clipop AI is an independent software product built and operated by the Clipop AI team. Use the
            channel below so your message reaches the right person.
          </p>
        </header>

        <article className="space-y-10">
          <section>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">Email contacts</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {CONTACT_CHANNELS.map((channel) => (
                <section key={channel.title} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-2 text-base font-medium">{channel.title}</h3>
                  <a
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    href={`mailto:${channel.email}`}
                  >
                    {channel.email}
                  </a>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{channel.description}</p>
                </section>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">What to include</h2>
            <ul className="list-disc space-y-2 pl-6 text-sm leading-relaxed text-muted-foreground">
              <li>The email address on your Clipop AI account, if you have one.</li>
              <li>The video URL or the name of the source file you were processing.</li>
              <li>The clip or job ID, if the issue happened during rendering.</li>
              <li>A short description of what you expected and what happened.</li>
              <li>A screenshot or screen recording for visual or export issues.</li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We read every message and reply as soon as possible. Including the details above helps us
              investigate without extra back-and-forth.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">Product and company facts</h2>
            <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Product</dt>
                <dd className="text-muted-foreground">{BRAND.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Website</dt>
                <dd className="text-muted-foreground">{BRAND.url}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Category</dt>
                <dd className="text-muted-foreground">AI video clipping software</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Primary audience</dt>
                <dd className="text-muted-foreground">Content creators, podcasters, MCN teams, educators and brands</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">What it does</dt>
                <dd className="text-muted-foreground">
                  Detects highlights in long videos, reframes them to 9:16, adds captions and exports MP4 shorts.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Data handling</dt>
                <dd className="text-muted-foreground">
                  Source files are processed only to generate clips; see the{' '}
                  <Link className="underline hover:text-primary" href="/privacy">Privacy Policy</Link>.
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-muted/30 p-6">
            <h2 className="text-xl font-semibold">Useful pages</h2>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/faq">FAQ</Link>
              <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/about">About</Link>
              <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/pricing">Pricing</Link>
              <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/terms">Terms of Service</Link>
              <Link className="rounded-md border border-border px-4 py-2 font-medium hover:bg-accent" href="/privacy">Privacy Policy</Link>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
