import type { Metadata } from 'next';
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
    default: 'Clipop AI - Transform Long Videos into Viral Shorts',
    template: '%s | Clipop AI',
  },
  description:
    'AI-powered video clipping tool that automatically extracts the best moments from your long-form content. Transform YouTube, Bilibili videos into engaging short clips.',
  keywords: [
    'Clipop AI',
    'AI Video Editor',
    'Video Clipping',
    'Short Video Generator',
    'YouTube to Shorts',
    'Bilibili to Shorts',
    'AI Video Processing',
    'Content Creation',
    'Video Highlights',
  ],
  authors: [{ name: 'Clipop AI Team' }],
  generator: 'Clipop AI',
  openGraph: {
    title: 'Clipop AI - Transform Long Videos into Viral Shorts',
    description:
      'AI-powered video clipping tool that automatically extracts the best moments from your long-form content.',
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

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
