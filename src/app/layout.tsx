import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/app-shell';
import { DevInspector } from '@/components/dev-inspector';
import LazyPostHog from '@/components/lazy-posthog';
import { defaultLocale, flattenTranslations, commonTranslations } from '@/lib/i18n/index';

// Pre-compute English translations at build time (static, no cookies() needed)
const enTranslations = flattenTranslations(commonTranslations);

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clipopai.com').replace(/\/$/, '');

const SITE_TITLE = 'Clipop AI - AI Video Clipper | Turn Long Videos into Viral Shorts';
const SITE_DESCRIPTION =
  'Clipop AI is an AI-powered video tool to auto generate highlight shorts from long videos. Paste YouTube & Bilibili links or upload local videos, get auto captions for TikTok, Reels and more. New users gain 60 free credits.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: '%s | Clipop AI',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Clipop AI',
  category: 'Video',
  keywords: [
    'Clipop AI',
    'AI video clipper',
    'long video to short video',
    'AI highlight generator',
    'YouTube Bilibili video clip',
    'auto caption video tool',
    'social media short clips',
    'viral short creator',
    'AI shorts generator',
    'digital human video',
  ],
  authors: [{ name: 'Clipop AI Team', url: siteUrl }],
  creator: 'Clipop AI',
  publisher: 'Clipop AI',
  generator: 'Clipop AI',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: 'Clipop AI',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['zh_CN', 'zh_TW'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: '@clipopai',
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: 'Clipop AI',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

/** 全站结构化数据：组织 + 站点 + 软件应用（帮助搜索引擎生成富结果） */
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Clipop AI',
      url: siteUrl,
      logo: `${siteUrl}/icon.svg`,
      description:
        'Clipop AI turns long videos and podcasts into viral vertical shorts with AI highlight detection, auto captions and digital human video generation.',
      sameAs: ['https://podcastai.clipopai.com/'],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Clipop AI',
      description: SITE_DESCRIPTION,
      publisher: { '@id': `${siteUrl}/#organization` },
      inLanguage: ['en', 'zh-CN', 'zh-TW'],
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/blog?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#software`,
      name: 'Clipop AI',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web, macOS, Windows, Android',
      url: siteUrl,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free plan with 60 credits per day; paid plans from $9.9/month.',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        ratingCount: '1280',
        bestRating: '5',
        worstRating: '1',
      },
    },
  ],
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

  // 后端 Supabase 源，用于 preconnect（仅取 origin，避免把 key 拼进链接）
  let supabaseOrigin = '';
  try {
    const raw = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (raw) supabaseOrigin = new URL(raw).origin;
  } catch {
    supabaseOrigin = '';
  }

  // Static locale: default to 'en' for SSR (no cookies() = static rendering).
  // Client-side LocaleProvider reads cookie/localStorage and updates after hydration.
  const serverLocale = defaultLocale;
  const serverTranslations = enTranslations;

  return (
    // className="dark"：服务端直出深色，保证首屏（脚本执行前）即为深色，无浅色闪屏
    <html lang={serverLocale} className="dark" suppressHydrationWarning data-build-version="2026-08-06-waffo-payment">
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
        {/* 性能：提前与后端/分析域名建连，降低首屏关键请求延迟 */}
        {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://download.clipopai.com" crossOrigin="anonymous" />
        {/* 全站结构化数据（Organization / WebSite / SoftwareApplication） */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {isDev && <DevInspector />}
        <Providers initialLocale={serverLocale} initialTranslations={serverTranslations}>
          <AppShell>{children}</AppShell>
        </Providers>
        <LazyPostHog />
      </body>
    </html>
  );
}
