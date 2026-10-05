'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InsufficientCreditsDialog } from '@/components/insufficient-credits-dialog';
import { useLocale } from '@/lib/locale-context';
import { REMIX_COPY, remixLocale } from '@/lib/tiktok-remix-content';
import { AI_VIDEO_COST } from '@/lib/ai-video';
import { AI_VIDEO_TEMPLATES } from '@/lib/ai-video-templates';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';

interface BreakdownPayload {
  derivedTopic: string;
  hook: { type: string; text: string; why: string };
  structure: Array<{ beat: string; role: string }>;
  emotionCurve: Array<{ phase: string; level: number }>;
  remixAngles: Array<{ angle: string; templateId: string; rationale: string }>;
  searchKeywords: string[];
}

interface BreakdownResponse {
  ok: boolean;
  error?: string;
  video: {
    videoId: string;
    canonicalUrl: string;
    title: string;
    authorName: string;
    authorUrl: string;
    thumbnailUrl: string;
  };
  breakdown: BreakdownPayload;
  engine: 'llm' | 'local';
  degraded: boolean;
}

function templateAccent(id: string): string {
  return AI_VIDEO_TEMPLATES.find((t) => t.id === id)?.accent || '#4f8cff';
}

/** 读出服务端错误原因（render_failed 的 detail / error），解析失败返回空串。 */
async function readErrorDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: string; error?: string };
    return String(j?.detail || j?.error || '');
  } catch {
    return '';
  }
}

export function TiktokRemixStudio({ defaultTemplate }: { defaultTemplate?: string }) {
  const { locale } = useLocale();
  const copy = REMIX_COPY[remixLocale(locale)];

  const [url, setUrl] = useState('');
  const [topicHint, setTopicHint] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<BreakdownResponse | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<string>(defaultTemplate || '');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const videoUrlRef = useRef('');

  /** 释放上一条成片的 blob URL（切换/卸载时），避免内存泄漏。 */
  const releaseVideo = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = '';
    }
    setVideoUrl('');
  }, []);

  useEffect(() => releaseVideo, [releaseVideo]);

  const activeTemplate = useMemo(() => {
    if (selectedTemplate) return selectedTemplate;
    return data?.breakdown.remixAngles[0]?.templateId || defaultTemplate || 'deep-thinking';
  }, [selectedTemplate, data, defaultTemplate]);

  const handleAnalyze = useCallback(async () => {
    setError('');
    setGenerateError('');
    if (!url.trim()) {
      setError(copy.result.errorInvalid);
      return;
    }
    setAnalyzing(true);
    setData(null);
    releaseVideo();
    try {
      const res = await fetch('/api/tiktok-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), locale, topicHint: topicHint.trim() || undefined }),
      });
      if (res.status === 429) {
        setError(copy.result.errorRate);
        return;
      }
      const json = (await res.json().catch(() => null)) as BreakdownResponse | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error === 'invalid_tiktok_url' ? copy.result.errorInvalid : copy.result.errorGeneric);
        return;
      }
      setData(json);
      setSelectedTemplate(json.breakdown.remixAngles[0]?.templateId || defaultTemplate || '');
    } catch {
      setError(copy.result.errorGeneric);
    } finally {
      setAnalyzing(false);
    }
  }, [url, locale, topicHint, copy, defaultTemplate, releaseVideo]);

  const handleGenerate = useCallback(async () => {
    if (!data) return;
    setGenerateError('');
    setGenerating(true);
    releaseVideo();
    try {
      const res = await fetch('/api/ai-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: data.breakdown.derivedTopic,
          locale,
          template: activeTemplate,
        }),
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.status === 402) {
        const j = (await res.json().catch(() => ({}))) as { balance?: number };
        setBalance(j.balance ?? 0);
        setInsufficientOpen(true);
        return;
      }
      if (!res.ok) {
        // 带出服务端真实原因（render_failed / detail），避免只显示「出错了」而无从定位
        const detail = await readErrorDetail(res);
        setGenerateError(detail ? `${copy.result.errorGeneric} (${detail})` : copy.result.errorGeneric);
        return;
      }

      // 上游若把错误包装成 200（非视频响应），这里必须拦下，否则会存成一个坏文件
      if (!(res.headers.get('content-type') || '').includes('video/')) {
        const detail = await readErrorDetail(res);
        setGenerateError(detail ? `${copy.result.errorGeneric} (${detail})` : copy.result.errorGeneric);
        return;
      }

      const blob = await res.blob();
      if (!blob.size) {
        setGenerateError(copy.result.errorGeneric);
        return;
      }
      // 只在页面内预览（不自动触发下载）：自动下载会被浏览器按弹窗/下载策略静默拦截，
      // 用户看不到任何结果便误判为「生成失败」。
      const objectUrl = URL.createObjectURL(blob);
      videoUrlRef.current = objectUrl;
      setVideoUrl(objectUrl);
    } catch {
      setGenerateError(copy.result.errorGeneric);
    } finally {
      setGenerating(false);
    }
  }, [data, locale, activeTemplate, copy, releaseVideo]);

  /** 下载必须由用户手势触发（Safari/Chrome 会拦截异步等待后的自动下载）。 */
  const handleDownloadVideo = useCallback(() => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `clipop-tiktok-remix-${activeTemplate}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [videoUrl, activeTemplate]);

  return (
    <div className="space-y-6">
      {/* 输入区 */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !analyzing) handleAnalyze();
                }}
                placeholder={copy.hero.inputPlaceholder}
                className="h-12 pl-9"
                inputMode="url"
                autoComplete="off"
              />
            </div>
            <Button
              className="h-12 shrink-0 gap-2 px-6"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {copy.hero.analyzing}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {copy.hero.analyzeCta}
                </>
              )}
            </Button>
          </div>

          <Input
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder={copy.hero.topicHintPlaceholder}
            className="h-11"
          />

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{copy.complianceInput}</span>
          </p>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 结果区 */}
      {data && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{copy.result.title}</h2>
              <Badge variant="secondary">
                {data.engine === 'llm' ? copy.result.engineLlm : copy.result.engineLocal}
              </Badge>
            </div>

            {/* 原视频署名 + 回链（合规要求） */}
            {data.video.thumbnailUrl && (
              <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.video.thumbnailUrl}
                  alt=""
                  className="h-20 w-14 shrink-0 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  {data.video.authorUrl ? (
                    <a
                      href={data.video.authorUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                    >
                      @{data.video.authorName || 'creator'}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      @{data.video.authorName || 'creator'}
                    </span>
                  )}
                  {data.video.title && (
                    <p className="truncate text-xs text-muted-foreground">{data.video.title}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {copy.result.attribution}
                    {' · '}
                    <a
                      href={data.video.canonicalUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {copy.result.originalVideo}
                    </a>
                  </p>
                </div>
              </div>
            )}

            {data.degraded && (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{copy.result.degradedNote}</span>
              </p>
            )}

            {/* 派生选题 */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.result.topicLabel}
              </p>
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-base font-medium text-foreground">
                {data.breakdown.derivedTopic}
              </p>
            </div>

            {/* 钩子 */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.result.hookLabel}
              </p>
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Badge variant="outline">{data.breakdown.hook.type}</Badge>
                <p className="text-sm font-medium text-foreground">{data.breakdown.hook.text}</p>
                {data.breakdown.hook.why && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{data.breakdown.hook.why}</p>
                )}
              </div>
            </div>

            {/* 叙事结构 */}
            {data.breakdown.structure.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.result.structureLabel}
                </p>
                <ol className="space-y-2">
                  {data.breakdown.structure.map((s, i) => (
                    <li key={`${s.beat}-${i}`} className="flex gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{s.beat}</span>
                        {s.role && <span className="text-muted-foreground"> — {s.role}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* 情绪曲线 */}
            {data.breakdown.emotionCurve.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.result.emotionLabel}
                </p>
                <div className="space-y-1.5">
                  {data.breakdown.emotionCurve.map((e, i) => (
                    <div key={`${e.phase}-${i}`} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{e.phase}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${e.level}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {e.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 二创角度 */}
            {data.breakdown.remixAngles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.result.anglesLabel}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.breakdown.remixAngles.map((a) => {
                    const active = activeTemplate === a.templateId;
                    return (
                      <button
                        key={`${a.templateId}-${a.angle}`}
                        type="button"
                        onClick={() => setSelectedTemplate(a.templateId)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          active
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/40'
                        }`}
                      >
                        <span className="mb-1.5 flex items-center gap-2">
                          <span
                            className="block h-1.5 w-4 rounded-full"
                            style={{ background: templateAccent(a.templateId) }}
                          />
                          <Badge variant="outline" className="text-[10px]">
                            {a.templateId}
                          </Badge>
                        </span>
                        <span className="block text-sm font-medium text-foreground">{a.angle}</span>
                        {a.rationale && (
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {a.rationale}
                          </span>
                        )}
                        {active && (
                          <span className="mt-2 block text-[11px] font-medium text-primary">
                            {copy.result.useCta}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 相关搜索词 */}
            {data.breakdown.searchKeywords.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.result.keywordsLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.breakdown.searchKeywords.map((k) => (
                    <Badge key={k} variant="secondary" className="font-normal">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">{copy.complianceResult}</p>

            {/* 转化 CTA */}
            <div className="space-y-2 border-t border-border pt-4">
              <Button
                className="h-12 w-full gap-2 text-base"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {copy.result.generatingCta}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    {copy.result.generateCta}
                  </>
                )}
              </Button>
              {generating && (
                <p className="text-center text-xs text-muted-foreground">
                  <Download className="mr-1 inline h-3 w-3" />
                  {AI_VIDEO_COST} credits · 9:16 vertical MP4
                </p>
              )}
              {generateError && (
                <p className="flex items-center justify-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {generateError}
                </p>
              )}
            </div>

            {/* 成片预览 + 下载：把结果显性化，确保「生成成功」可被用户看到并经手势下载 */}
            {videoUrl && (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{copy.result.videoReadyLabel}</p>
                <div className="mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-muted">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={videoUrl} controls autoPlay loop playsInline className="h-full w-full object-contain" />
                </div>
                <Button variant="secondary" className="w-full gap-2" onClick={handleDownloadVideo}>
                  <Download className="h-4 w-4" />
                  {copy.result.downloadCta}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        currentBalance={balance}
        requiredCredits={AI_VIDEO_COST}
      />
    </div>
  );
}