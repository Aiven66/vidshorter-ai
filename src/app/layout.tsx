import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { DevInspector } from '@/components/dev-inspector';

export const metadata: Metadata = {
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
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
:root{--background:oklch(1 0 0);--foreground:oklch(.145 0 0);--card:oklch(1 0 0);--card-foreground:oklch(.145 0 0);--primary:oklch(.205 0 0);--primary-foreground:oklch(.985 0 0);--muted:oklch(.97 0 0);--muted-foreground:oklch(.556 0 0);--border:oklch(.922 0 0);--radius:.8rem;--font-sans:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.dark{--background:oklch(.145 0 0);--foreground:oklch(.985 0 0);--card:oklch(.205 0 0);--card-foreground:oklch(.985 0 0);--primary:oklch(.87 0 0);--primary-foreground:oklch(.205 0 0);--muted:oklch(.269 0 0);--muted-foreground:oklch(.708 0 0);--border:oklch(1 0 0/10%)}
*{border-color:var(--border)}
body{background:var(--background);color:var(--foreground);font-family:var(--font-sans);margin:0}
.min-h-screen{min-height:100vh}
.flex{display:flex}
.flex-col{flex-direction:column}
.flex-1{flex:1 1 0%}
.container{width:100%;margin-left:auto;margin-right:auto;padding-left:1rem;padding-right:1rem}
@media(min-width:768px){.container{max-width:768px}.md\\:py-20{padding-top:5rem;padding-bottom:5rem}.md\\:flex{display:flex}.md\\:grid{display:grid}.md\\:cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.md\\:cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.text-center{text-align:center}
.text-3xl{font-size:1.875rem;line-height:2.25rem}
.text-2xl{font-size:1.5rem;line-height:2rem}
.font-bold{font-weight:700}
.font-semibold{font-weight:600}
.mb-4{margin-bottom:1rem}
.mb-10{margin-bottom:2.5rem}
.py-12{padding-top:3rem;padding-bottom:3rem}
.py-16{padding-top:4rem;padding-bottom:4rem}
.px-4{padding-left:1rem;padding-right:1rem}
.mx-auto{margin-left:auto;margin-right:auto}
.max-w-4xl{max-width:56rem}
.max-w-5xl{max-width:64rem}
.max-w-2xl{max-width:42rem}
.text-lg{font-size:1.125rem;line-height:1.75rem}
.text-sm{font-size:.875rem;line-height:1.25rem}
.text-muted-foreground{color:var(--muted-foreground)}
.bg-muted{background:var(--muted)}
.bg-muted\\/30{background:color-mix(in oklch,var(--muted) 30%,transparent)}
.bg-primary{background:var(--primary)}
.text-primary{color:var(--primary)}
.text-primary-foreground{color:var(--primary-foreground)}
.bg-primary\\/10{background:color-mix(in oklch,var(--primary) 10%,transparent)}
.rounded-lg{border-radius:var(--radius)}
.rounded-full{border-radius:9999px}
.border-t{border-top-width:1px}
.border-border{border-color:var(--border)}
.gap-6{gap:1.5rem}
.gap-8{gap:2rem}
.grid{display:grid}
.sticky{position:sticky}
.top-0{top:0}
.z-50{z-index:50}
.h-16{height:4rem}
.items-center{align-items:center}
.justify-between{justify-content:space-between}
.gap-2{gap:.5rem}
.gap-4{gap:1rem}
.font-bold{font-weight:700}
.text-xl{font-size:1.25rem;line-height:1.75rem}
.border-b{border-bottom-width:1px}
.bg-background{background:var(--background)}
.bg-background\\/95{background:color-mix(in oklch,var(--background) 95%,transparent)}
.backdrop-blur{backdrop-filter:blur(8px)}
.overflow-hidden{overflow:hidden}
.relative{position:relative}
.animate-pulse{animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.shadow-xl{box-shadow:0 9px 20px -3px oklch(0 0 0/.08),0 3px 6px -3px oklch(0 0 0/.04)}
`,
          }}
        />
      </head>
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
