'use client';

/**
 * Recap Studio (P0-2) — 解说成片引擎。
 *
 * 两步交互：
 *   1) 出解说稿（AI 生成 / 本地启发式草稿，始终显示 engine 徽章）→ 可编辑
 *   2) 按稿渲染成片（配音 + 字幕 + 原声 ducking + BGM）→ 预览 + 下载 MP4
 *
 * 门控：Pro 会员（服务端为准，403 recap_requires_pro）。前端仅做展示层引导。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Clapperboard,
  Loader2,
  Sparkles,
  Download,
  Plus,
  Trash2,
  Lock,
  AlertCircle,
  Wand2,
} from 'lucide-react';
import {
  RECAP_ERROR_CODES,
  RECAP_MAX_CHAPTERS,
  RECAP_TARGET_SECS,
  type RecapChapter,
  type RecapScript,
} from '@/lib/recap';
import {
  RecapApiError,
  extractYouTubeVideoId,
  generateRecapScriptApi,
  renderRecapFilmApi,
} from '@/lib/youtube-clip-download';

/** 复用既有 videoover 声线译名（video.voiceover.voices.*） */
const VOICE_IDS = [
  'zh-CN-YunxiNeural',
  'zh-CN-XiaoxiaoNeural',
  'en-US-GuyNeural',
  'en-US-JennyNeural',
];

const BGM_MOODS = ['calm', 'energetic', 'warm'] as const;

/** 管理员在后台配置的 AI 密钥（与既有视频管线同一通道，生产恒为 null） */
function getAdminAiConfig(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('clipop_ai_config');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function emptyChapter(index: number): RecapChapter {
  return { index, title: '', narration: '' };
}

export default function RecapStudioPage() {
  const { user, accessToken, loading } = useAuth();
  const { plan, loading: creditsLoading } = useCredits();
  const { t, locale } = useLocale();

  const tr = useMemo(
    () => (key: string, vars?: Record<string, string | number>) => {
      let s = t(key);
      if (s === key) return key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [t],
  );

  const isPro = plan === 'pro' || user?.role === 'admin';
  const gated = !loading && !creditsLoading && !!user && !isPro;

  const [url, setUrl] = useState('');
  const [targetDurationSec, setTargetDurationSec] = useState(120);

  const [scriptLoading, setScriptLoading] = useState(false);
  const [engine, setEngine] = useState<'llm' | 'local' | null>(null);
  const [hook, setHook] = useState('');
  const [title, setTitle] = useState('');
  const [chapters, setChapters] = useState<RecapChapter[]>([]);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [renderError, setRenderError] = useState('');

  const [orientation, setOrientation] = useState<'landscape' | 'vertical'>('landscape');
  const [voice, setVoice] = useState('');
  const [bgmMood, setBgmMood] = useState<'' | (typeof BGM_MOODS)[number]>('');
  const [originalVolume, setOriginalVolume] = useState(20);

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState('');
  const [filmUrl, setFilmUrl] = useState<string | null>(null);
  const filmUrlRef = useRef<string | null>(null);

  useEffect(() => {
    filmUrlRef.current = filmUrl;
  }, [filmUrl]);

  // 卸载时释放预览 object URL
  useEffect(() => () => {
    if (filmUrlRef.current) URL.revokeObjectURL(filmUrlRef.current);
  }, []);

  const videoId = useMemo(() => extractYouTubeVideoId(url) || '', [url]);
  const hasScript = chapters.length > 0;

  function releaseFilm() {
    if (filmUrlRef.current) {
      URL.revokeObjectURL(filmUrlRef.current);
      filmUrlRef.current = null;
    }
    setFilmUrl(null);
  }

  function handleError(e: unknown, fallback: string, where: 'script' | 'render') {
    if (e instanceof RecapApiError && e.status === 403) {
      toast.error(tr('video.recap.notProTitle'));
      return;
    }
    const aiMissing = e instanceof RecapApiError && e.code === RECAP_ERROR_CODES.aiUnavailable;
    const noCues = e instanceof RecapApiError && e.code === RECAP_ERROR_CODES.transcriptUnavailable;
    const msg = aiMissing
      ? tr('video.recap.aiUnavailable')
      : noCues
        ? tr('video.recap.noTranscript')
        : e instanceof Error
          ? e.message
          : fallback;

    if (where === 'script') setScriptError(msg);
    else setRenderError(msg);
    if (aiMissing) setAiUnavailable(true);
    else toast.error(msg);
  }

  async function handleGenerate(allowLocalDraft = false) {
    if (!videoId) {
      toast.error(tr('video.recap.urlRequired'));
      return;
    }
    setScriptLoading(true);
    setScriptError('');
    if (!allowLocalDraft) setAiUnavailable(false);
    try {
      const res = await generateRecapScriptApi({
        videoId,
        targetDurationSec,
        locale,
        aiConfig: getAdminAiConfig(),
        allowLocalDraft,
        exportPlan: plan,
        accessToken,
      });
      releaseFilm();
      setHook(res.script.hook || '');
      setTitle(res.script.title || '');
      setChapters(res.script.chapters.map((c, i) => ({ ...c, index: i + 1 })));
      setEngine(res.engine);
      setSourceDuration(res.sourceDuration || 0);
      setAiUnavailable(false);
      toast.success(res.engine === 'local' ? tr('video.recap.engineLocal') : tr('video.recap.engineLlm'));
    } catch (e) {
      handleError(e, 'Failed to generate the recap script.', 'script');
    } finally {
      setScriptLoading(false);
    }
  }

  function updateChapter(index: number, patch: Partial<RecapChapter>) {
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addChapter() {
    if (chapters.length >= RECAP_MAX_CHAPTERS) return;
    setChapters((prev) => [...prev, emptyChapter(prev.length + 1)]);
  }

  function removeChapter(index: number) {
    if (chapters.length <= 1) return;
    setChapters((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, index: i + 1 })));
  }

  async function handleRender() {
    if (!videoId || !hasScript) return;
    releaseFilm();
    setRendering(true);
    setRenderError('');
    setProgress(tr('video.recap.rendering'));
    try {
      const script: RecapScript = {
        hook,
        title,
        chapters: chapters.map((c, i) => ({ ...c, index: i + 1 })),
        targetDurationSec,
        engine: engine === 'local' ? 'local' : 'llm',
      };
      const blob = await renderRecapFilmApi({
        videoId,
        script,
        sourceDuration,
        locale,
        orientation,
        voice: voice || undefined,
        originalVolume,
        bgmMood: bgmMood || null,
        exportPlan: plan,
        accessToken,
        onProgress: setProgress,
      });
      const objUrl = URL.createObjectURL(blob);
      filmUrlRef.current = objUrl;
      setFilmUrl(objUrl);
      toast.success(tr('video.recap.resultTitle'));
    } catch (e) {
      handleError(e, 'Failed to render the recap film.', 'render');
    } finally {
      setRendering(false);
      setProgress('');
    }
  }

  function handleDownload() {
    if (!filmUrl) return;
    const a = document.createElement('a');
    a.href = filmUrl;
    a.download = `recap-${videoId || 'film'}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── 未登录 ────────────────────────────────────────────────────────────────
  if (!loading && !user) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-primary" />
              {tr('video.recap.badge')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{tr('video.recap.loginRequired')}</p>
            <Button asChild className="w-full">
              <Link href="/login">{tr('video.recap.loginCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── 非 Pro ───────────────────────────────────────────────────────────────
  if (gated) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              {tr('video.recap.upgradeTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{tr('video.recap.upgradeDesc')}</p>
            <Button asChild className="w-full">
              <Link href="/pricing">
                <Sparkles className="h-4 w-4 mr-2" />
                {tr('video.recap.upgradeCta')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── 主流程 ───────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2">
          <Clapperboard className="h-3.5 w-3.5" />
          {tr('video.recap.badge')}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{tr('video.recap.heroTitle')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{tr('video.recap.heroSubtitle')}</p>
      </div>

      {/* Step 1 — 出稿 */}
      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tr('video.recap.step1')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tr('video.recap.placeholder')}
              className="flex-1"
            />
            <Button onClick={() => handleGenerate(false)} disabled={scriptLoading || !videoId}>
              {scriptLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              {scriptLoading ? tr('video.recap.generating') : tr('video.recap.generate')}
            </Button>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{tr('video.recap.durationLabel')}</Label>
            <div className="flex items-center gap-2 mt-2">
              {RECAP_TARGET_SECS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => setTargetDurationSec(sec)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    targetDurationSec === sec
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {tr(`video.recap.duration${sec}`)}
                </button>
              ))}
            </div>
          </div>

          {scriptError && (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{scriptError}</span>
            </div>
          )}

          {aiUnavailable && (
            <Button variant="outline" size="sm" onClick={() => handleGenerate(true)} disabled={scriptLoading}>
              <Sparkles className="h-4 w-4 mr-2" />
              {tr('video.recap.localDraftCta')}
            </Button>
          )}

          {engine && (
            <Badge variant={engine === 'llm' ? 'default' : 'secondary'} className="text-[11px]">
              {engine === 'llm' ? tr('video.recap.engineLlm') : tr('video.recap.engineLocal')}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* 解说稿编辑 */}
      {hasScript && (
        <Card className="mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('video.recap.step1')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recap-hook" className="text-xs">{tr('video.recap.hookLabel')}</Label>
              <Input
                id="recap-hook"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recap-title" className="text-xs">{tr('video.recap.titleLabel')}</Label>
              <Input id="recap-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-3">
              {chapters.map((c, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {tr('video.recap.chapterLabel', { n: i + 1 })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeChapter(i)}
                      disabled={chapters.length <= 1}
                      aria-label={tr('video.recap.removeChapter')}
                      className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={c.title || ''}
                    onChange={(e) => updateChapter(i, { title: e.target.value })}
                    placeholder={tr('video.recap.chapterLabel', { n: i + 1 })}
                    className="h-8 text-sm"
                  />
                  <Textarea
                    value={c.narration}
                    onChange={(e) => updateChapter(i, { narration: e.target.value })}
                    placeholder={tr('video.recap.narrationLabel')}
                    maxLength={400}
                    rows={3}
                    className="text-sm"
                  />
                  <Input
                    value={c.keyQuote || ''}
                    onChange={(e) => updateChapter(i, { keyQuote: e.target.value })}
                    placeholder={tr('video.recap.keyQuoteLabel')}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={addChapter}
              disabled={chapters.length >= RECAP_MAX_CHAPTERS}
            >
              <Plus className="h-4 w-4 mr-2" />
              {tr('video.recap.addChapter')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — 成片 */}
      {hasScript && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('video.recap.step2')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{tr('video.recap.orientationLabel')}</Label>
                <div className="flex items-center gap-2">
                  {(['landscape', 'vertical'] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOrientation(o)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        orientation === o
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {o === 'landscape'
                        ? tr('video.recap.orientationLandscape')
                        : tr('video.recap.orientationVertical')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recap-voice" className="text-xs">{tr('video.recap.voiceLabel')}</Label>
                <select
                  id="recap-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{tr('video.recap.voiceAuto')}</option>
                  {VOICE_IDS.map((v) => (
                    <option key={v} value={v}>
                      {tr(`video.voiceover.voices.${v}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recap-bgm" className="text-xs">{tr('video.recap.bgmLabel')}</Label>
                <select
                  id="recap-bgm"
                  value={bgmMood}
                  onChange={(e) => setBgmMood(e.target.value as '' | (typeof BGM_MOODS)[number])}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">{tr('video.recap.bgmNone')}</option>
                  {BGM_MOODS.map((m) => (
                    <option key={m} value={m}>
                      {tr(`video.recap.bgm${m.charAt(0).toUpperCase()}${m.slice(1)}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recap-vol" className="text-xs">
                  {tr('video.recap.originalVolumeLabel')} · {originalVolume}%
                </Label>
                <input
                  id="recap-vol"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={originalVolume}
                  onChange={(e) => setOriginalVolume(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{tr('video.recap.renderHint')}</p>

            {renderError && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{renderError}</span>
              </div>
            )}

            <Button onClick={handleRender} disabled={rendering} className="w-full sm:w-auto">
              {rendering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Clapperboard className="h-4 w-4 mr-2" />
              )}
              {rendering ? progress || tr('video.recap.rendering') : tr('video.recap.render')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 成片结果 */}
      {filmUrl && (
        <Card className="mt-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr('video.recap.resultTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <video src={filmUrl} controls className="w-full rounded-lg bg-black" />
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              {tr('video.recap.download')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}