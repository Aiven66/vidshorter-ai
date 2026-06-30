import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DevInspector } from '@/components/dev-inspector';
import LazyPostHog from '@/components/lazy-posthog';

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

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="cf-worker-config" strategy="beforeInteractive">
          {`window.__CF_WORKER_URL__ = ${JSON.stringify(cfWorkerUrl)};`}
        </Script>
        {/* Google tag (gtag.js) - Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-6P1172P3PK"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-6P1172P3PK');
          `}
        </Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {isDev && <DevInspector />}
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
        <LazyPostHog />
      </body>
    </html>
  );
}
