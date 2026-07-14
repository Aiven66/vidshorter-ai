import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DevInspector } from '@/components/dev-inspector';
import LazyPostHog from '@/components/lazy-posthog';
import { defaultLocale, flattenTranslations, commonTranslations } from '@/lib/i18n/index';

// Pre-compute English translations at build time (static, no cookies() needed)
const enTranslations = flattenTranslations(commonTranslations);

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Clipop AI - AI Video Clipper | Turn Long Videos into Viral Shorts',
    template: '%s | Clipop AI',
  },
  description:
    'Clipop AI is an AI-powered video tool to auto generate highlight shorts from long videos. Paste YouTube & Bilibili links or upload local videos, get auto captions for TikTok, Reels and more. New users gain 100 free credits.',
  keywords: [
    'Clipop AI',
    'AI video clipper',
    'long video to short video',
    'AI highlight generator',
    'YouTube Bilibili video clip',
    'auto caption video tool',
    'social media short clips',
    'viral short creator',
  ],
  authors: [{ name: 'Clipop AI Team' }],
  generator: 'Clipop AI',
  openGraph: {
    title: 'Clipop AI - AI Video Clipper | Turn Long Videos into Viral Shorts',
    description:
      'Clipop AI is an AI-powered video tool to auto generate highlight shorts from long videos. Paste YouTube & Bilibili links or upload local videos, get auto captions for TikTok, Reels and more. New users gain 100 free credits.',
    url: siteUrl,
    siteName: 'Clipop AI',
    type: 'website',
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';
  // Expose CF Worker URL to the browser so the frontend can pre-resolve
  // YouTube stream URLs from the user's IP (not rate-limited by YouTube,
  // unlike Vercel datacenter IPs). The URL may include a ?key= secret for
  // access control; that's expected — the key is already bundled in client JS.
  const cfWorkerUrl = String(process.env.CF_WORKER_URL || '').trim();

  // Static locale: default to 'en' for SSR (no cookies() = static rendering).
  // Client-side LocaleProvider reads cookie/localStorage and updates after hydration.
  const serverLocale = defaultLocale;
  const serverTranslations = enTranslations;

  return (
    <html lang={serverLocale} suppressHydrationWarning data-build-version="2026-07-14-v42-muted-play-fix">
      <head>
        {/* Inline CF Worker config — plain script tag (no Script component overhead) */}
        <script dangerouslySetInnerHTML={{ __html: `window.__CF_WORKER_URL__ = ${JSON.stringify(cfWorkerUrl)};` }} />
        {/* Google Analytics — deferred to first user interaction (saves 178KB from initial load) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var loaded = false;
            function loadGA() {
              if (loaded) return;
              loaded = true;
              var s = document.createElement('script');
              s.async = true;
              s.src = 'https://www.googletagmanager.com/gtag/js?id=G-6P1172P3PK';
              document.head.appendChild(s);
              window.dataLayer = window.dataLayer || [];
              window.gtag = function(){dataLayer.push(arguments);};
              gtag('js', new Date());
              gtag('config', 'G-6P1172P3PK');
            }
            ['click','scroll','keydown','touchstart','mousemove'].forEach(function(e){
              window.addEventListener(e, loadGA, {once:true, passive:true, capture:true});
            });
            setTimeout(loadGA, 4500);
          })();
        `}} />
        <link rel="dns-prefetch" href="https://us-assets.i.posthog.com" />
        <link rel="dns-prefetch" href="https://api.github.com" />
      </head>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {isDev && <DevInspector />}
        <Providers initialLocale={serverLocale} initialTranslations={serverTranslations}>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
        <LazyPostHog />
      </body>
    </html>
  );
}
