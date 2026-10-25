'use client';

/**
 * AI 多语转换 — 保留原声音色的多语言配音。
 *
 * Web 端（浏览器）只是功能说明 + 下载入口；真正的处理全部在 Mac 桌面客户端：
 *   yt-dlp 下载 → ffmpeg 抽音轨 → 本地 ASR 识别 → 免费翻译字幕 →
 *   ZipVoice 用原声 3–10s 做 reference 做零样本克隆 → 时间轴对齐 → 烧字幕合成。
 *
 * 付费门控双端一致：桌面端 dub:run 会再校验一次 plan（fail-closed），本页只做展示层引导。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Languages,
  Link2,
  FileVideo,
  FolderOpen,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Download,
  Sparkles,
  Lock,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Play,
  Mic,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 桌面 bridge 类型（仅 Mac 客户端注入 preload-web.js 时存在）          */
/* ------------------------------------------------------------------ */

type DubCapabilities = {
  ffmpeg: boolean;
  ytdlp: boolean;
  cloneEngine: 'zipvoice' | null;
  missingModelFiles: string[];
  languages: { code: string; label: string }[];
  modelReady: boolean;
  modelBytes: number;
  modelMinBytes: number;
  asrReady: boolean;
};

type DubProgress = {
  scope?: 'run' | 'model';
  stage?: string;
  progress?: number;
  pct?: number;
  message?: string;
  file?: string;
  received?: number;
  total?: number;
};

type DubCue = { start: number; end: number; text: string };

type DubResult = {
  ok: boolean;
  code?: string;
  message?: string;
  outputPath?: string;
  outputName?: string;
  cues?: DubCue[];
  sourceLang?: string;
  targetLang?: string;
  videoUrl?: string;
};

type DubBridge = {
  dubCapabilities: () => Promise<DubCapabilities>;
  dubPrepareModel: () => Promise<{ ok?: boolean; results?: unknown[] }>;
  dubRun: (input: Record<string, unknown>) => Promise<DubResult>;
  dubCancel: () => Promise<{ ok: boolean }>;
  dubRevealOutput: (filePath: string) => Promise<{ ok: boolean }>;
  onDubProgress: (cb: (payload: DubProgress) => void) => () => void;
  ahaPickVideo?: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; name?: string }>;
  getAppVersion?: () => Promise<string>;
};

function getBridge(): DubBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { clipopDesktop?: DubBridge; vidshorterDesktop?: DubBridge };
  const b = w.clipopDesktop || w.vidshorterDesktop;
  return b && typeof b.dubCapabilities === 'function' ? b : null;
}

const TARGET_LANGS = [
  { code: 'zh', label: '中文', sub: 'Mandarin Chinese' },
  { code: 'en', label: 'English', sub: '英语' },
] as const;

const STAGE_KEY: Record<string, string> = {
  prepare: 'aiDubbing.stagePrepare',
  download: 'aiDubbing.stageDownload',
  audio: 'aiDubbing.stageAudio',
  asr: 'aiDubbing.stageAsr',
  translate: 'aiDubbing.stageTranslate',
  reference: 'aiDubbing.stageReference',
  tts: 'aiDubbing.stageTts',
  timeline: 'aiDubbing.stageTimeline',
  mux: 'aiDubbing.stageMux',
  done: 'aiDubbing.stageDone',
};

function errorKey(code?: string): string {
  switch (code) {
    case 'DUB_PLAN_REQUIRED':
      return 'aiDubbing.errPlan';
    case 'DUB_MODEL_MISSING':
      return 'aiDubbing.errModel';
    case 'DUB_LANG_UNSUPPORTED':
      return 'aiDubbing.errLang';
    case 'DUB_BUSY':
      return 'aiDubbing.errBusy';
    case 'DUB_CANCELLED':
      return 'aiDubbing.errCancelled';
    default:
      return 'aiDubbing.errGeneric';
  }
}

function mb(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0';
  return (bytes / (1024 * 1024)).toFixed(0);
}

export default function AiDubbingPage() {
  const { user, loading } = useAuth();
  const { plan, loading: creditsLoading } = useCredits();
  const { t } = useLocale();

  const tr = useMemo(
    () => (key: string, vars?: Record<string, string | number>) => {
      let s = t(key);
      if (s === key) return key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [t],
  );

  const isPaid = plan === 'starter' || plan === 'pro' || user?.role === 'admin';
  const gated = !loading && !creditsLoading && !isPaid;

  const [bridge, setBridge] = useState<DubBridge | null>(null);
  const [caps, setCaps] = useState<DubCapabilities | null>(null);
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [targetLang, setTargetLang] = useState<'zh' | 'en'>('en');
  const [keepOriginalAudio, setKeepOriginalAudio] = useState(true);
  const [burnSubtitles, setBurnSubtitles] = useState(true);

  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [stageDetail, setStageDetail] = useState('');

  const [modelBusy, setModelBusy] = useState(false);
  const [modelPct, setModelPct] = useState(0);
  const [modelPhase, setModelPhase] = useState<'downloading' | 'extracting' | 'ready' | ''>('');

  const [result, setResult] = useState<DubResult | null>(null);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');

  const bridgeRef = useRef<DubBridge | null>(null);
  bridgeRef.current = bridge;

  const source = mode === 'link' ? url.trim() : filePath;

  const refreshCaps = useCallback(async () => {
    const b = bridgeRef.current;
    if (!b) return;
    try {
      const next = await b.dubCapabilities();
      setCaps(next);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  }, []);

  useEffect(() => {
    const b = getBridge();
    setBridge(b);
    if (!b) return;
    void refreshCaps();
    const off = b.onDubProgress((payload) => {
      if (payload.scope === 'model') {
        if (typeof payload.pct === 'number') setModelPct(Math.max(0, Math.min(1, payload.pct)));
        if (payload.stage === 'extracting') setModelPhase('extracting');
        else if (payload.stage === 'ready') setModelPhase('ready');
        else setModelPhase('downloading');
        return;
      }
      if (payload.stage) setStage(payload.stage);
      if (typeof payload.progress === 'number') setProgress(Math.max(0, Math.min(1, payload.progress)));
      if (payload.message) setStageDetail(payload.message);
    });
    return off;
  }, [refreshCaps]);

  const prepareModel = async () => {
    const b = bridgeRef.current;
    if (!b || modelBusy) return;
    setError('');
    setErrorDetail('');
    setModelBusy(true);
    setModelPct(0);
    setModelPhase('downloading');
    try {
      await b.dubPrepareModel();
      setModelPhase('ready');
      setModelPct(1);
      await refreshCaps();
    } catch (e) {
      setModelPhase('');
      setError(tr('aiDubbing.errGeneric'));
      setErrorDetail(String((e as Error)?.message || e));
    } finally {
      setModelBusy(false);
    }
  };

  const pickFile = async () => {
    const b = bridgeRef.current;
    if (!b?.ahaPickVideo) return;
    try {
      const r = await b.ahaPickVideo();
      if (r?.ok && r.path) {
        setFilePath(r.path);
        setFileName(r.name || r.path);
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  const start = async () => {
    const b = bridgeRef.current;
    if (!b || running) return;
    if (!source) return;
    if (mode === 'link' && !/^https?:\/\//i.test(source)) {
      setError(tr('aiDubbing.errGeneric'));
      setErrorDetail('URL must start with http:// or https://');
      return;
    }
    setError('');
    setErrorDetail('');
    setResult(null);
    setRunning(true);
    setCancelling(false);
    setStage('prepare');
    setProgress(0.01);
    setStageDetail('');
    try {
      const res = await b.dubRun({
        source,
        targetLang,
        plan: user?.role === 'admin' ? 'admin' : plan,
        keepOriginalAudio,
        burnSubtitles,
      });
      if (res?.ok) {
        setResult(res);
        setStage('done');
        setProgress(1);
      } else {
        setError(tr(errorKey(res?.code)));
        setErrorDetail(res?.message || '');
        setProgress(0);
        setStage('');
        if (res?.code === 'DUB_MODEL_MISSING') void refreshCaps();
      }
    } catch (e) {
      setError(tr('aiDubbing.errGeneric'));
      setErrorDetail(String((e as Error)?.message || e));
      setProgress(0);
      setStage('');
    } finally {
      setRunning(false);
      setCancelling(false);
    }
  };

  const cancel = async () => {
    const b = bridgeRef.current;
    if (!b || !running) return;
    setCancelling(true);
    try {
      await b.dubCancel();
    } catch {
      /* 忽略：任务仍会被后端标记取消 */
    }
  };

  const reset = () => {
    setResult(null);
    setError('');
    setErrorDetail('');
    setStage('');
    setProgress(0);
  };

  const envMissing = caps
    ? !caps.ffmpeg ||
      !caps.ytdlp ||
      caps.missingModelFiles.includes('ttsBin') ||
      caps.missingModelFiles.includes('dataDir')
    : false;
  const canRun = Boolean(bridge && caps?.cloneEngine === 'zipvoice' && caps?.asrReady && isPaid && source && !running);

  const stageLabel = stage ? STAGE_KEY[stage] : '';
  const label = stage === 'translate' || stage === 'tts' ? stageDetail : '';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
      {/* 标题 */}
      <header className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {tr('aiDubbing.eyebrow')}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            100% on-device
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{tr('aiDubbing.title')}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          {tr('aiDubbing.subtitle')}
        </p>
      </header>

      {!bridge ? (
        /* ---------------- 浏览器端：说明 + 下载 ---------------- */
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Languages className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{tr('aiDubbing.desktopOnlyTitle')}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {tr('aiDubbing.desktopOnlyBody')}
                </p>
              </div>
              <Button asChild className="flex-shrink-0">
                <Link href="/download">
                  <Download className="mr-2 h-4 w-4" />
                  {tr('aiDubbing.getDesktop')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tr('aiDubbing.howTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="rounded-lg border border-border bg-muted/30 p-4">
                    <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {n}
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {tr(`aiDubbing.step${n}`)}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {tr('aiDubbing.privacy')}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ---------------- 桌面端：实际工作台 ---------------- */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-5">
            {/* 源视频 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('aiDubbing.sourceTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setMode('link')}
                    className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      mode === 'link' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    <Link2 className="h-4 w-4" />
                    {tr('aiDubbing.tabLink')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('file')}
                    className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      mode === 'file' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    <FileVideo className="h-4 w-4" />
                    {tr('aiDubbing.tabFile')}
                  </button>
                </div>

                {mode === 'link' ? (
                  <div className="space-y-2">
                    <Label htmlFor="dub-url">{tr('aiDubbing.linkLabel')}</Label>
                    <Input
                      id="dub-url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={tr('aiDubbing.linkPlaceholder')}
                      inputMode="url"
                      disabled={running}
                    />
                    <p className="text-xs text-muted-foreground">YouTube · Bilibili · 抖音 · 直接链接</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                      <FileVideo className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {fileName || tr('aiDubbing.noFile')}
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={pickFile} disabled={running}>
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        {fileName ? tr('aiDubbing.changeFile') : tr('aiDubbing.pickFile')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 目标语言 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('aiDubbing.langTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {TARGET_LANGS.map((lang) => {
                    const active = targetLang === lang.code;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setTargetLang(lang.code)}
                        disabled={running}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">{lang.label}</span>
                          <span className="block text-xs text-muted-foreground">{lang.sub}</span>
                        </span>
                        {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Mic className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {tr('aiDubbing.langHint')}
                </p>
              </CardContent>
            </Card>

            {/* 选项 */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{tr('aiDubbing.optKeepOriginal')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tr('aiDubbing.optKeepOriginalHint')}</p>
                  </div>
                  <Switch
                    checked={keepOriginalAudio}
                    onCheckedChange={setKeepOriginalAudio}
                    disabled={running}
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium">{tr('aiDubbing.optBurnSubtitles')}</p>
                  <Switch checked={burnSubtitles} onCheckedChange={setBurnSubtitles} disabled={running} />
                </div>
              </CardContent>
            </Card>

            {/* 操作 */}
            <div className="flex flex-wrap items-center gap-3">
              {running ? (
                <>
                  <Button variant="outline" onClick={cancel} disabled={cancelling}>
                    {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    {cancelling ? tr('aiDubbing.cancelling') : tr('aiDubbing.cancel')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {stageLabel ? tr(stageLabel) : tr('aiDubbing.runningTitle')}
                    {label ? ` · ${label}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Button onClick={start} disabled={!canRun}>
                    <Play className="mr-2 h-4 w-4" />
                    {tr('aiDubbing.start')}
                  </Button>
                  {gated && (
                    <Button variant="outline" asChild>
                      <Link href="/pricing">
                        <Lock className="mr-2 h-4 w-4" />
                        {tr('aiDubbing.gateCta')}
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                  {result && (
                    <Button variant="ghost" onClick={reset}>
                      {tr('aiDubbing.again')}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* 进度 */}
            {(running || (progress > 0 && !result)) && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{tr('aiDubbing.runningTitle')}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(progress * 100)}%</span>
                  </div>
                  <Progress value={Math.round(progress * 100)} />
                  <p className="text-xs text-muted-foreground">
                    {stageLabel ? tr(stageLabel) : ''}
                    {label ? ` · ${label}` : ''}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* 结果 */}
            {result?.ok && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {tr('aiDubbing.resultTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.videoUrl ? (
                    <video
                      src={result.videoUrl}
                      controls
                      className="w-full rounded-lg border border-border bg-black"
                    />
                  ) : (
                    <p className="break-all rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
                      {result.outputPath}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {result.videoUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={result.videoUrl} target="_blank" rel="noreferrer">
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          {tr('aiDubbing.openVideo')}
                        </a>
                      </Button>
                    )}
                    {result.outputPath && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void bridgeRef.current?.dubRevealOutput(result.outputPath as string)}
                      >
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        {tr('aiDubbing.reveal')}
                      </Button>
                    )}
                  </div>
                  {result.cues && result.cues.length > 0 && (
                    <details className="rounded-lg border border-border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        {result.cues.length} cues · {result.sourceLang || 'auto'} → {result.targetLang}
                      </summary>
                      <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                        {result.cues.slice(0, 40).map((c, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            <span className="mr-2 tabular-nums opacity-60">{c.start.toFixed(1)}s</span>
                            {c.text}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                  <p className="text-xs text-muted-foreground">{tr('aiDubbing.note')}</p>
                </CardContent>
              </Card>
            )}

            {/* 错误 */}
            {error && (
              <Card className="border-destructive/40">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{tr('aiDubbing.errorTitle')}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{error}</p>
                    {errorDetail && (
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/70">{errorDetail}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右栏：模型 / 付费 / 隐私 */}
          <aside className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tr('aiDubbing.modelTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">{tr('aiDubbing.modelBody')}</p>

                {caps?.modelReady ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span className="font-medium">{tr('aiDubbing.modelReady')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {tr('aiDubbing.modelSize', { size: mb(caps.modelBytes) })}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {modelPhase === 'extracting'
                          ? tr('aiDubbing.modelExtracting')
                          : modelBusy
                            ? tr('aiDubbing.modelPreparing')
                            : ''}
                      </span>
                      {modelBusy && <span className="tabular-nums">{Math.round(modelPct * 100)}%</span>}
                    </div>
                    {modelBusy && <Progress value={Math.round(modelPct * 100)} />}
                    <Button className="w-full" onClick={prepareModel} disabled={modelBusy}>
                      {modelBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {tr('aiDubbing.modelDownload')}
                    </Button>
                  </>
                )}

                {caps && !caps.asrReady && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                      {tr('aiDubbing.asrMissing')}
                    </p>
                    <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" asChild>
                      <Link href="/local-engine">{tr('aiDubbing.openLocalEngine')}</Link>
                    </Button>
                  </div>
                )}

                {envMissing && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                    <p className="text-xs leading-relaxed text-destructive">{tr('aiDubbing.envMissing')}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {gated && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">{tr('aiDubbing.gateTitle')}</p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{tr('aiDubbing.gateBody')}</p>
                  <Button className="w-full" asChild>
                    <Link href="/pricing">
                      {tr('aiDubbing.gateCta')}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="flex items-start gap-2 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">{tr('aiDubbing.privacy')}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
