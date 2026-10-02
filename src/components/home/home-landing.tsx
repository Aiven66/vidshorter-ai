'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Link2,
  X,
  FolderUp,
  Wand2,
  ArrowRight,
  Flame,
  Zap,
  Star,
  Smartphone,
  Podcast,
  ShoppingBag,
  Languages,
  MonitorDown,
  Apple,
  Monitor,
  Crown,
  PlayCircle,
  Download,
  ShieldCheck,
  Image as ImageIcon,
} from 'lucide-react';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 与 video-processor 约定的本地文件传递通道（同源 SPA 内一次性消费） */
declare global {
  interface Window {
    __clipopPendingFile?: File | null;
  }
}

const PLATFORMS = ['YouTube', '哔哩哔哩 (Bilibili)', 'TikTok / 抖音', '小宇宙播客', 'MP4 / WebM'];

/** 展示区配图：纯 CSS 合成画面，无外部依赖、永远不破版 */
const frameGlow = (a: string, b: string) =>
  [
    `radial-gradient(circle at 30% 36%, color-mix(in oklab, ${a} 26%, transparent), transparent 58%)`,
    `radial-gradient(circle at 74% 70%, color-mix(in oklab, ${b} 20%, transparent), transparent 60%)`,
  ].join(', ');

const PRESETS = [
  { href: '/video-clips', icon: Smartphone, tint: 'text-gold', k: 'c1' },
  { href: '/podcast', icon: Podcast, tint: 'text-ai-cyan', k: 'c2' },
  { href: '/marketing-video', icon: ShoppingBag, tint: 'text-gold', k: 'c3' },
  { href: '/ai-tools', icon: Languages, tint: 'text-ai-cyan', k: 'c4' },
] as const;

const FEATURES = [
  { icon: ImageIcon, k: 'f1' },
  { icon: Sparkles, k: 'f2' },
  { icon: Flame, k: 'f3' },
  { icon: Zap, k: 'f4' },
] as const;

function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function HomeLanding() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { balance } = useCredits();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const goProcess = useCallback(
    (nextUrl: string) => {
      if (!user) {
        router.push('/login');
        return;
      }
      const qs = nextUrl ? `?url=${encodeURIComponent(nextUrl)}` : '';
      router.push(`/video-clips${qs}`);
    },
    [router, user],
  );

  const onGenerate = useCallback(() => {
    const value = url.trim();
    if (!value || !isValidHttpUrl(value)) {
      setHint('invalid');
      return;
    }
    setHint(null);
    goProcess(value);
  }, [goProcess, url]);

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!user) {
        router.push('/login');
        return;
      }
      // 通过全局通道把文件交给 /video-clips 的处理器，进入后自动开始上传分析
      window.__clipopPendingFile = file;
      router.push('/video-clips');
    },
    [router, user],
  );

  const platformsLabel = t('landing.workspace.platforms');

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 氛围光晕（受主题令牌控制，深浅色均适配） */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-gold/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-[520px] right-0 -z-10 h-[380px] w-[380px] rounded-full bg-ai-cyan/5 blur-[100px]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-8 md:px-6 md:py-12">
        {/* 1. HERO */}
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 shadow-sm">
            <Sparkles className="h-4 w-4 text-gold" />
            <span className="text-xs font-medium">{t('landing.hero.badge')}</span>
            <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-black">NEW</span>
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl md:leading-[1.15]">
            {t('landing.hero.titleA')}{' '}
            <span className="bg-gradient-to-r from-gold-light via-gold to-gold-dim bg-clip-text text-transparent">
              {t('landing.hero.titleB')}
            </span>
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {t('landing.hero.subtitle')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">AI</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-[10px] font-bold text-gold">YT</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">B</span>
              </div>
              <span>
                <b className="text-foreground">10,000+</b> {t('landing.hero.socialCreators')}
              </span>
            </div>
            <span className="hidden sm:inline text-border">·</span>
            <span className="flex items-center gap-1 text-gold">
              <Star className="h-4 w-4 fill-current" />
              <b className="text-foreground">4.9/5</b> {t('landing.hero.socialRating')}
            </span>
            <span className="hidden sm:inline text-border">·</span>
            <span className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-ai-cyan" />
              <span>10x {t('landing.hero.socialSpeed')}</span>
            </span>
          </div>
        </section>

        {/* 2. 工作台：输入 / 上传 */}
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/70 p-4 shadow-xl backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-gold">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-semibold">{t('landing.workspace.title')}</span>
                  <span className="text-xs text-muted-foreground">{t('landing.workspace.subtitle')}</span>
                </div>
              </div>
              {mounted && user && (
                <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">
                    {t('nav.creditsBalance') === 'nav.creditsBalance' ? 'Credits' : t('nav.creditsBalance')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-gold">{balance}</span>
                </div>
              )}
            </div>

            {/* 平台支持 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{platformsLabel}:</span>
              {PLATFORMS.map((p) => (
                <span key={p} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {p}
                </span>
              ))}
            </div>

            {/* URL 输入 + 生成 */}
            <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-1.5 sm:flex-row">
              <div className="flex flex-1 items-center gap-2 px-3">
                <Link2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (hint) setHint(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
                  placeholder={t('landing.workspace.urlPlaceholder')}
                  className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                  aria-label={t('landing.workspace.urlPlaceholder')}
                />
                {url && (
                  <button
                    type="button"
                    onClick={() => setUrl('')}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                onClick={onGenerate}
                className="gap-2 whitespace-nowrap bg-gradient-to-r from-gold-light via-gold to-gold-dim font-semibold text-black hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />
                {t('landing.workspace.generate')}
              </Button>
            </div>
            {hint === 'invalid' && (
              <p className="px-1 text-xs text-destructive">{t('landing.workspace.invalidUrl')}</p>
            )}

            {/* 分割线 */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('landing.workspace.or')}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* 本地上传落区 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:bg-muted/60',
                dragging && 'border-gold bg-gold/5',
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-sm transition-transform group-hover:scale-105">
                <FolderUp className="h-7 w-7 text-gold" />
              </div>
              <div className="text-sm font-semibold">
                {t('landing.workspace.dropTitle')}{' '}
                <span className="text-gold underline-offset-2 group-hover:underline">
                  {t('landing.workspace.dropBrowse')}
                </span>
              </div>
              <p className="max-w-md text-xs text-muted-foreground">{t('landing.workspace.dropHint')}</p>
              <div className="mt-1 flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                <span>{t('landing.workspace.privacy')}</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {/* 能力开关（默认全开，纯展示，降低使用门槛） */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, k }) => (
                <div
                  key={k}
                  className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2.5"
                >
                  <Icon className="h-4 w-4 shrink-0 text-gold" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">{t(`landing.workspace.${k}t`)}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t(`landing.workspace.${k}d`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 客户端下载引导 */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <MonitorDown className="h-4 w-4 text-gold" />
                <span>{t('landing.workspace.clientHint')}</span>
                <Link href="/download" className="font-medium text-gold hover:underline">
                  {t('landing.workspace.clientMac')}
                </Link>
                <span>·</span>
                <Link href="/download" className="font-medium text-gold hover:underline">
                  {t('landing.workspace.clientWin')}
                </Link>
              </div>
              <span className="flex items-center gap-1 text-ai-cyan">
                <Zap className="h-4 w-4" />
                {t('landing.workspace.newUserBonus')}
              </span>
            </div>
          </div>
        </section>

        {/* 3. 场景模板 */}
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-gold">
                {t('landing.presets.kicker')}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t('landing.presets.title')}
              </h2>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">{t('landing.presets.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map(({ href, icon: Icon, tint, k }) => (
              <Link
                key={k}
                href={href}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold/40 hover:bg-card"
              >
                <div className="flex flex-col gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-muted', tint)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-base font-semibold">{t(`landing.presets.${k}t`)}</h3>
                      <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                        {t(`landing.presets.${k}b`)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(`landing.presets.${k}d`)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 text-sm font-medium text-gold">
                  <span>{t('landing.presets.cta')}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 4. 实时渲染对比 */}
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[11px] uppercase tracking-wider text-gold">{t('landing.showcase.kicker')}</span>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t('landing.showcase.title')}</h2>
            <p className="max-w-xl text-sm text-muted-foreground">{t('landing.showcase.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card/60 p-4 shadow-xl backdrop-blur-xl sm:p-6 lg:grid-cols-12">
            {/* 左侧：长视频源 */}
            <div className="flex flex-col justify-between gap-4 rounded-xl bg-muted/40 p-4 lg:col-span-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <PlayCircle className="h-4 w-4 text-muted-foreground" />
                    {t('landing.showcase.source')}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t('landing.showcase.sourceRes')}
                  </span>
                </div>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gradient-to-br from-muted to-card">
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: frameGlow('var(--gold)', 'var(--ai-cyan)') }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent" />
                  {/* 长视频画面示意：双人访谈剪影 + 烧录字幕 */}
                  <div className="absolute inset-2 rounded-md border border-gold/25" />
                  <div className="absolute bottom-0 left-[18%] h-[52%] w-[22%] rounded-t-full bg-foreground/20" />
                  <div className="absolute bottom-0 left-[52%] h-[38%] w-[18%] rounded-t-full bg-foreground/15" />
                  <div className="absolute inset-x-[24%] top-[56%] flex flex-col items-center gap-1.5">
                    <div className="h-1.5 w-3/4 rounded-full bg-foreground/25" />
                    <div className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
                  </div>
                  <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-[11px]">
                    <span className="rounded bg-background/80 px-2 py-1 backdrop-blur">00:18:24 / 00:45:18</span>
                    <span className="rounded bg-gold/20 px-2 py-1 text-gold backdrop-blur">
                      {t('landing.showcase.sourcePeaks')}
                    </span>
                  </div>
                  <span className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 backdrop-blur">
                    <PlayCircle className="h-4 w-4 text-gold" />
                  </span>
                </div>
                <div className="relative h-10 w-full overflow-hidden rounded-md bg-muted">
                  <svg className="h-full w-full text-border" preserveAspectRatio="none" viewBox="0 0 300 32" fill="none">
                    <path
                      d="M0,16 Q5,2 10,16 T20,16 T30,8 T40,24 T50,16 T60,4 T70,28 T80,16 T90,6 T100,26 T110,16 T120,10 T130,22 T140,16 T150,2 T160,30 T170,16 T180,8 T190,24 T200,16 T210,5 T220,27 T230,16 T240,12 T250,20 T260,16 T270,4 T280,28 T290,16 T300,16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute left-1/4 flex h-full w-16 items-center justify-center rounded bg-gold/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  </div>
                </div>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4 text-ai-cyan" />
                {t('landing.showcase.sourceHint')}
              </p>
            </div>

            {/* 右侧：竖屏成片 */}
            <div className="flex flex-col justify-between gap-4 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gold">
                  <Sparkles className="h-4 w-4" />
                  {t('landing.showcase.aiLabel')}
                </span>
                <span className="text-[11px] text-muted-foreground">{t('landing.showcase.aiQuality')}</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="group overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-transform hover:-translate-y-1"
                  >
                    <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-b from-muted to-card">
                      <div
                        className="absolute inset-0"
                        style={{ backgroundImage: frameGlow('var(--gold)', 'var(--ai-cyan)') }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                      {/* 竖屏成片画面示意：主体剪影（人脸追焦居中）+ 卡拉OK花字 */}
                      <div className="absolute inset-3 rounded-lg border border-dashed border-gold/25" />
                      <div className="absolute left-1/2 top-[20%] h-[20%] w-[38%] -translate-x-1/2 rounded-full bg-foreground/20" />
                      <div className="absolute left-1/2 top-[36%] h-[30%] w-[72%] -translate-x-1/2 rounded-t-full bg-foreground/15" />
                      <div className="absolute inset-x-[14%] bottom-[16%] space-y-1.5">
                        <div className="h-2 rounded-full bg-foreground/25" />
                        <div className="h-2 w-2/3 rounded-full bg-gold/60" />
                      </div>
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-gold backdrop-blur">
                        <Flame className="h-3 w-3 fill-current" />
                        {['98%', '95', '92%'][i]}
                      </span>
                      <span className="absolute right-2 top-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] backdrop-blur">
                        {['00:38', '00:46', '00:52'][i]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-medium">
                          {t(`landing.showcase.clip${i + 1}t`)}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {t(`landing.showcase.clip${i + 1}m`)}
                        </span>
                      </div>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-gold">
                        <Download className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t('landing.showcase.generated')}</span>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link href="/shorts">
                    <Download className="h-4 w-4" />
                    {t('landing.showcase.batch')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* 5. 客户端下载 + Pro 转化 */}
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: Apple, titleKey: 'macTitle', descKey: 'macDesc', metaKey: 'macMeta', ctaKey: 'macCta' },
              { icon: Monitor, titleKey: 'winTitle', descKey: 'winDesc', metaKey: 'winMeta', ctaKey: 'winCta' },
            ].map(({ icon: Icon, titleKey, descKey, metaKey, ctaKey }) => (
              <div
                key={titleKey}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/60 p-4 shadow-lg backdrop-blur-xl sm:p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-gold">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-semibold">{t(`landing.download.${titleKey}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`landing.download.${descKey}`)}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      {t(`landing.download.${metaKey}`)}
                    </span>
                  </div>
                </div>
                <Button variant="outline" asChild className="shrink-0 gap-1.5 whitespace-nowrap">
                  <Link href="/download">
                    <Download className="h-4 w-4" />
                    {t(`landing.download.${ctaKey}`)}
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-card via-muted/60 to-card p-6 shadow-xl sm:p-10">
            <div className="relative z-10 flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
              <div className="flex max-w-xl flex-col gap-1">
                <span className="mb-1 inline-flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider text-gold md:justify-start">
                  <Crown className="h-4 w-4" />
                  {t('landing.pro.kicker')}
                </span>
                <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">{t('landing.pro.title')}</h3>
                <p className="text-sm text-muted-foreground">{t('landing.pro.desc')}</p>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2 sm:flex-row">
                <Button
                  asChild
                  className="bg-gradient-to-r from-gold-light via-gold to-gold-dim font-semibold text-black hover:opacity-95"
                >
                  <Link href="/pricing">{t('landing.pro.cta1')}</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/about">{t('landing.pro.cta2')}</Link>
                </Button>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-gold/10 blur-[80px]" />
          </div>
        </section>
      </div>
    </div>
  );
}