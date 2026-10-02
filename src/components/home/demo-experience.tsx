'use client';

// 免登录"一键体验 Demo"
// 让匿名访客无需注册/无需后端,几秒内看到一条示例视频的高光剪辑片段(可直接播放),
// 从而"跑通核心闭环"并建立首体验价值认知;结果末尾引导注册从而循环使用。
import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Play, Loader2, X, Sparkles, ExternalLink, RotateCcw } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

const SAMPLE_BASE = 'https://samplelib.com/preview/mp4';

interface DemoClip {
  id: string;
  titleKey: string;
  momentKey: string;
  src: string;
  duration: string;
  score: number;
  accent: string;
}

const DEMO_CLIPS: DemoClip[] = [
  { id: 'demo-hook', titleKey: 'home.demo.clip1Title', momentKey: 'home.demo.clip1Moment', src: `${SAMPLE_BASE}/sample-5s.mp4`, duration: '0:05', score: 96, accent: 'from-rose-500 to-orange-500' },
  { id: 'demo-insight', titleKey: 'home.demo.clip2Title', momentKey: 'home.demo.clip2Moment', src: `${SAMPLE_BASE}/sample-10s.mp4`, duration: '0:10', score: 92, accent: 'from-violet-500 to-fuchsia-500' },
  { id: 'demo-money', titleKey: 'home.demo.clip3Title', momentKey: 'home.demo.clip3Moment', src: `${SAMPLE_BASE}/sample-15s.mp4`, duration: '0:15', score: 94, accent: 'from-emerald-500 to-teal-500' },
  { id: 'demo-closer', titleKey: 'home.demo.clip4Title', momentKey: 'home.demo.clip4Moment', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', duration: '0:12', score: 90, accent: 'from-sky-500 to-indigo-500' },
];

const STAGES = ['home.demo.running', 'home.demo.running2', 'home.demo.running3'];

export function HomeDemoExperience() {
  const { t } = useLocale();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState<DemoClip | null>(null);
  const timerRefs = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach((id) => window.clearInterval(id));
    timerRefs.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startDemo = useCallback(() => {
    clearTimers();
    setPhase('running');
    setStageIdx(0);
    setProgress(0);
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    const tick = window.setInterval(() => {
      const pct = Math.min(96, Math.floor(elapsed() / 36)); // ~3.5s to 96%
      setProgress(pct);
      setStageIdx(Math.min(STAGES.length - 1, Math.floor(elapsed() / 1200)));
      if (pct >= 96) {
        window.clearInterval(tick);
        setProgress(100);
        window.setTimeout(() => setPhase('done'), 350);
      }
    }, 120);
    timerRefs.current.push(tick);
  }, [clearTimers]);

  if (phase === 'idle') {
    return (
      <section className="mx-auto my-8 max-w-5xl px-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t('home.demo.badge')}
              </div>
              <h3 className="text-xl font-bold text-foreground sm:text-2xl">{t('home.demo.title')}</h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('home.demo.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={startDemo}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-lg transition hover:scale-[1.03] hover:shadow-xl active:scale-95"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 transition group-hover:scale-110">
                <Play className="h-3.5 w-3.5 fill-current" />
              </span>
              {t('home.demo.cta')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto my-8 max-w-5xl px-4">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
        <div className="border-b border-border/50 p-5 sm:p-6">
          {phase === 'running' ? (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="text-sm font-semibold text-foreground">
                  {t(STAGES[stageIdx])}…
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-chart-3 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">{t('home.demo.done')}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('home.demo.note')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startDemo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('home.demo.replay')}
                </button>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background transition hover:opacity-90"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('home.demo.signup')}
                </Link>
              </div>
            </div>
          )}
        </div>

        {phase === 'done' && (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {DEMO_CLIPS.map((clip) => (
              <button
                key={clip.id}
                type="button"
                onClick={() => setPlaying(clip)}
                className="group overflow-hidden rounded-xl border border-border/60 bg-muted/20 text-left transition hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                  <video
                    className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100"
                    src={clip.src}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/20">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition group-hover:scale-110">
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </span>
                  </div>
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {clip.duration}
                  </span>
                  <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {t(clip.momentKey)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{t(clip.titleKey)}</p>
                    <p className="text-xs text-muted-foreground">{clip.score}% {t('home.demo.engagement')}</p>
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${clip.accent}`} title={t('home.demo.moment')} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {phase === 'done' && playing && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-foreground">{t(playing.titleKey)}</p>
                <p className="text-xs text-muted-foreground">{t(playing.momentKey)} · {playing.duration}</p>
              </div>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={t('home.demo.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-black">
              <video
                className="aspect-video w-full"
                src={playing.src}
                controls
                autoPlay
                playsInline
                poster=""
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}