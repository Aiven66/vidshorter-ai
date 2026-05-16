import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DevInspector } from '@/components/dev-inspector';

export const metadata: Metadata = {
  title: {
    default: 'VidShorter AI - Transform Long Videos into Viral Shorts',
    template: '%s | VidShorter AI',
  },
  description:
    'AI-powered video clipping tool that automatically extracts the best moments from your long-form content. Transform YouTube, Bilibili videos into engaging short clips.',
  keywords: [
    'VidShorter AI',
    'AI Video Editor',
    'Video Clipping',
    'Short Video Generator',
    'YouTube to Shorts',
    'Bilibili to Shorts',
    'AI Video Processing',
    'Content Creation',
    'Video Highlights',
  ],
  authors: [{ name: 'VidShorter AI Team' }],
  generator: 'VidShorter AI',
  openGraph: {
    title: 'VidShorter AI - Transform Long Videos into Viral Shorts',
    description:
      'AI-powered video clipping tool that automatically extracts the best moments from your long-form content.',
    type: 'website',
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
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {isDev && <DevInspector />}
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
