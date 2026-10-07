'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/locale-context';
import {
  Cpu,
  Download,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  HardDriveDownload,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* 桌面 bridge 类型（仅 macOS 客户端注入 preload-web.js 时存在）        */
/* ------------------------------------------------------------------ */

interface LocalModelInfo {
  id: string;
  label: string;
  file: string;
  path: string;
  bytes: number;
  minBytes: number;
  ready: boolean;
}

interface LocalEngineInfo {
  available: boolean;
  engine: string;
  binary: string;
  modelId: string | null;
  modelPath: string | null;
}

interface LocalModelsStatus {
  modelsDir: string;
  binDir: string;
  defaultModelId: string;
  models: LocalModelInfo[];
  readyCount: number;
  totalBytes: number;
  engine: LocalEngineInfo;
}

interface LocalModelProgress {
  id?: string;
  stage?: 'downloading' | 'ready';
  pct?: number;
  file?: string;
  received?: number;
  total?: number;
}

interface LocalEngineBridge {
  localModelsStatus: () => Promise<LocalModelsStatus>;
  localModelsPrepare: (ids?: string[]) => Promise<{ ok: boolean }>;
  onLocalModelsProgress: (cb: (p: LocalModelProgress) => void) => () => void;
}

function getDesktopBridge(): LocalEngineBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    clipopDesktop?: Partial<LocalEngineBridge>;
    vidshorterDesktop?: Partial<LocalEngineBridge>;
  };
  const b = w.clipopDesktop || w.vidshorterDesktop;
  return b && typeof b.localModelsStatus === 'function' ? (b as LocalEngineBridge) : null;
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

/* 引擎注册表里带的 label 是构建期固定文案，这里按 id 走 i18n，缺失时再回落。 */
const MODEL_LABEL_KEY: Record<string, string> = {
  'whisper-tiny': 'localEngine.modelTiny',
  'whisper-base': 'localEngine.modelBase',
  'whisper-small': 'localEngine.modelSmall',
};

export default function LocalEnginePage() {
  const { t } = useLocale();
  const tr = useCallback(
    (key: string, fallback?: string) => {
      const s = t(key);
      return s === key ? (fallback ?? '') : s;
    },
    [t],
  );

  const bridgeRef = useRef<LocalEngineBridge | null>(null);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const [status, setStatus] = useState<LocalModelsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [progressById, setProgressById] = useState<Record<string, LocalModelProgress>>({});

  const refresh = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setLoading(true);
    setError('');
    try {
      setStatus(await bridge.localModelsStatus());
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    bridgeRef.current = bridge;
    setBridgeReady(Boolean(bridge));
    if (!bridge) return;

    void refresh();

    const off = bridge.onLocalModelsProgress((p) => {
      if (!p || !p.id) return;
      setProgressById((prev) => ({ ...prev, [p.id as string]: p }));
    });
    return off;
  }, [refresh]);

  const handleDownload = useCallback(
    async (ids: string[], id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge || downloadingId) return;
      setDownloadingId(id);
      setError('');
      setProgressById((prev) => ({ ...prev, [id]: { id, stage: 'downloading', pct: 0 } }));
      try {
        await bridge.localModelsPrepare(ids);
        await refresh();
      } catch (err) {
        setError(String((err as Error)?.message || err));
      } finally {
        setDownloadingId('');
      }
    },
    [downloadingId, refresh],
  );

  const engine = status?.engine;
  const ready = Boolean(engine?.available);

  const activeProgress = useMemo(() => {
    if (!downloadingId) return null;
    return progressById[downloadingId] || null;
  }, [downloadingId, progressById]);

  const pct = Math.round(Math.max(0, Math.min(1, activeProgress?.pct ?? 0)) * 100);

  /* 浏览器（非桌面端）：本地引擎不可用，引导去下载客户端 */
  if (bridgeReady === false) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Cpu className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold text-foreground">
              {tr('localEngine.title', 'Local AI Engine')}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {tr(
                'localEngine.desktopOnly',
                'The local AI engine runs on your own Mac. Open this page inside the Clipop desktop app to download models and transcribe offline.',
              )}
            </p>
            <Link
              href="/download"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <HardDriveDownload className="h-4 w-4" />
              {tr('localEngine.getDesktop', 'Get the desktop app')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-10">
        {/* 标题 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Cpu className="h-6 w-6 text-primary" />
              {tr('localEngine.title', 'Local AI Engine')}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {tr(
                'localEngine.subtitle',
                'Speech recognition and highlight detection run entirely on this Mac. Models download once, then everything works offline with no cloud cost.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {tr('localEngine.refresh', 'Refresh')}
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* 引擎状态 */}
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {tr('localEngine.engineTitle', 'Engine Status')}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {ready
                  ? tr('localEngine.stReady', 'Ready')
                  : tr('localEngine.stNotReady', 'Not ready')}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              whisper.cpp · {tr('localEngine.onDevice', '100% on-device')}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">{tr('localEngine.fEngine', 'ASR engine')}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{engine?.engine || '—'}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <dt className="text-muted-foreground">{tr('localEngine.fModel', 'Active model')}</dt>
              <dd className="mt-0.5 font-mono text-foreground">{engine?.modelId || '—'}</dd>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
              <dt className="text-muted-foreground">{tr('localEngine.fBinary', 'Engine binary')}</dt>
              <dd className="mt-0.5 break-all font-mono text-foreground">
                {engine?.binary || tr('localEngine.notDetected', 'Not detected')}
              </dd>
            </div>
          </dl>

          {!engine?.binary && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {tr(
                'localEngine.binaryMissing',
                'The bundled engine binary was not found. Reinstall the latest desktop app to restore it.',
              )}
            </p>
          )}
        </section>

        {/* 模型列表 */}
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Download className="h-4 w-4 text-primary" />
              {tr('localEngine.modelsTitle', 'Speech Models')}
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {status ? `${status.readyCount}/${status.models.length}` : '—'}
              </span>
            </div>
            {status && status.readyCount === 0 && (
              <button
                type="button"
                onClick={() => void handleDownload([status.defaultModelId], status.defaultModelId)}
                disabled={Boolean(downloadingId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {downloadingId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {tr('localEngine.downloadRecommended', 'Download recommended model')}
              </button>
            )}
          </div>

          {/* 下载进度 */}
          {activeProgress && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {activeProgress.file || ''} · {pct}%
                {activeProgress.total
                  ? ` · ${fmtBytes(activeProgress.received || 0)} / ${fmtBytes(activeProgress.total)}`
                  : ''}
              </p>
            </div>
          )}

          {/* 模型行 */}
          <ul className="mt-4 space-y-2">
            {(status?.models || []).map((m) => {
              const isDownloading = downloadingId === m.id;
              const isDefault = status?.defaultModelId === m.id;
              const label = tr(MODEL_LABEL_KEY[m.id] || '', '') || m.label;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
                      <span className="font-mono">{m.id}</span>
                      {isDefault && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {tr('localEngine.recommended', 'Recommended')}
                        </span>
                      )}
                      {m.ready && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                          {tr('localEngine.installed', 'Installed')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {m.ready ? fmtBytes(m.bytes) : `~${fmtBytes(m.minBytes)}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDownload([m.id], m.id)}
                    disabled={Boolean(downloadingId) || m.ready}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                      m.ready
                        ? 'border border-border bg-background text-muted-foreground'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : m.ready ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isDownloading
                      ? tr('localEngine.downloading', 'Downloading…')
                      : m.ready
                        ? tr('localEngine.installed', 'Installed')
                        : tr('localEngine.download', 'Download')}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[11px] text-muted-foreground">
            {tr(
              'localEngine.modelsHint',
              'Models come from Hugging Face and are verified after download. Once installed, transcription and highlight detection never upload your video.',
            )}
          </p>
          {status?.modelsDir && (
            <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
              {status.modelsDir}
            </p>
          )}
        </section>

        {/* 首启引导 */}
        <section className="mt-6 rounded-xl border border-border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {tr('localEngine.startTitle', 'How it works')}
          </h2>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1.</span>{' '}
              {tr('localEngine.step1', 'Download one speech model above (Base is recommended, about 142 MB).')}
            </li>
            <li>
              <span className="font-semibold text-foreground">2.</span>{' '}
              {tr('localEngine.step2', 'Open Highlight Clips and pick a local video — transcription starts automatically.')}
            </li>
            <li>
              <span className="font-semibold text-foreground">3.</span>{' '}
              {tr('localEngine.step3', 'Everything runs offline; results are cached on disk so repeat runs are instant.')}
            </li>
          </ol>
          {/* 「下载即用」闭环：模型就绪后直接给一个可点的下一步，避免用户看完说明无处可去 */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/video-clips"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tr('localEngine.goClips', 'Open Highlight Clips')}
            </Link>
            {(status?.readyCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tr('localEngine.readyHint', 'Model ready — you can start now')}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {tr('localEngine.notReadyHint', 'Download a model first to unlock offline transcription')}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
