'use client';

/**
 * 批量生产队列 (P0-3) — 一次贴多个视频链接，服务端排队（限并发）出片。
 *
 * 交互：
 *   1) 粘贴多行链接（自动解析/去重/校验，超出上限明文报错，不静默截断）
 *   2) 提交 → 服务端建行 + 排队泵填满并发槽 → 本页每 3s 轮询聚合状态
 *   3) 每条展开可看片段并下载；队列在服务端自续航（关掉本页也会继续跑完）
 *
 * 门控：Starter+ 或 admin（服务端为准，403 batch_requires_paid）。前端仅做展示层引导。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCredits } from '@/lib/credits-context';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BATCH_ERROR_CODES,
  BATCH_MAX_ITEMS,
  normalizeBatchUrls,
  summarizeBatchItems,
  type BatchItem,
  type BatchSummary,
} from '@/lib/video-batch';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  Timer,
  Trash2,
} from 'lucide-react';

const STORAGE_KEY = 'clipop_batch_queue';
const POLL_ACTIVE_MS = 3000;
const POLL_HIDDEN_MS = 10000;

type StoredBatch = {
  batchId: string;
  videoIds: string[];
  concurrency: number;
  createdAt: number;
};

type BatchStatusPayload = {
  queue: { concurrency: number; active: number; pending: number; stalled: string[] };
  summary: BatchSummary;
  items: BatchItem[];
  truncatedIds?: boolean;
};

/** 视频 status → i18n 后缀 */
const STATUS_KEY: Record<string, string> = {
  pending: 'statusPending',
  processing: 'statusProcessing',
  completed: 'statusCompleted',
  partial: 'statusPartial',
  link_only_completed: 'statusLinkOnly',
  failed: 'statusFailed',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  processing: 'bg-primary/15 text-primary',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  link_only_completed: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  failed: 'bg-destructive/15 text-destructive',
};

export default function BatchQueuePage() {
  const { user, accessToken, loading } = useAuth();
  const { plan, loading: creditsLoading, refreshCredits } = useCredits();
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
  const trRef = useRef(tr);
  useEffect(() => {
    trRef.current = tr;
  }, [tr]);

  const isPaid = plan === 'starter' || plan === 'pro' || user?.role === 'admin';
  const gated = !loading && !creditsLoading && !!user && !isPaid;

  const [input, setInput] = useState('');
  const parsed = useMemo(() => normalizeBatchUrls(input), [input]);

  const [batch, setBatch] = useState<StoredBatch | null>(null);
  const [status, setStatus] = useState<BatchStatusPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [finishedNote, setFinishedNote] = useState('');

  // 恢复上次批次（刷新页面后继续看队列）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setBatch(JSON.parse(raw) as StoredBatch);
    } catch {
      /* 损坏的缓存忽略即可 */
    }
  }, []);

  const idsParam = batch?.videoIds.join(',') || '';

  // 轮询聚合状态（页面隐藏时降频，减少无谓的 pump 压力）
  useEffect(() => {
    if (!idsParam || !accessToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/videos/batch/status?ids=${encodeURIComponent(idsParam)}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          if (!cancelled) setError(trRef.current('video.batch.sessionExpired'));
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BatchStatusPayload;
        if (cancelled) return;
        setStatus(json);
        setError('');
        if (json.summary.done) setFinishedNote(trRef.current('video.batch.queueDrained'));
      } catch {
        if (!cancelled) setError(trRef.current('video.batch.pollFailed'));
      }
      if (!cancelled) {
        const hidden = typeof document !== 'undefined' && document.hidden;
        timer = setTimeout(tick, hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [idsParam, accessToken]);

  const mapError = useCallback(
    (code: string | undefined, payload?: Record<string, unknown>): string => {
      switch (code) {
        case BATCH_ERROR_CODES.requiresPaid:
          return tr('video.batch.upgradeTitle');
        case BATCH_ERROR_CODES.unauthorized:
          return tr('video.batch.sessionExpired');
        case BATCH_ERROR_CODES.invalidRequest:
          return tr('video.batch.invalidRequest', { max: BATCH_MAX_ITEMS });
        case BATCH_ERROR_CODES.insufficientCredits:
          return tr('video.batch.insufficientCredits', { required: Number(payload?.required ?? 0) });
        case BATCH_ERROR_CODES.quotaExceeded:
          return tr('video.batch.quotaExceeded', {
            requested: Number(payload?.requested ?? 0),
            affordable: Number(payload?.affordable ?? 0),
          });
        default:
          return tr('video.batch.requestFailed');
      }
    },
    [tr],
  );

  const handleSubmit = async () => {
    if (!user) return;
    setError('');
    setFinishedNote('');
    if (!parsed.ok) {
      setError(mapError(parsed.code));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/videos/batch/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ urls: parsed.urls, userId: user.id, plan }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(mapError(typeof json.error === 'string' ? json.error : undefined, json));
        return;
      }
      const next: StoredBatch = {
        batchId: String(json.batchId || ''),
        videoIds: Array.isArray(json.videoIds) ? (json.videoIds as string[]) : [],
        concurrency: Number(json.concurrency || 0),
        createdAt: Date.now(),
      };
      if (next.videoIds.length === 0) {
        setError(tr('video.batch.requestFailed'));
        return;
      }
      setBatch(next);
      setStatus(null);
      setInput('');
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 隐私模式下写入失败不影响本次会话 */
      }
      void refreshCredits?.();
    } catch {
      setError(tr('video.batch.requestFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const clearBatch = () => {
    setBatch(null);
    setStatus(null);
    setFinishedNote('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const summary = status?.summary ?? summarizeBatchItems([]);
  const canSubmit = !!user && parsed.ok && !submitting;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <Badge variant="secondary" className="mb-3">
          <Layers className="mr-1 h-3 w-3" />
          {tr('video.batch.badge')}
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">{tr('video.batch.heroTitle')}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{tr('video.batch.heroSubtitle')}</p>
      </div>

      {!loading && !user && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {tr('video.batch.loginRequired')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">{tr('video.batch.loginCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {gated && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {tr('video.batch.upgradeTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{tr('video.batch.upgradeDesc')}</p>
            <Button asChild>
              <Link href="/pricing">{tr('video.batch.upgradeCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!!user && !gated && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{tr('video.batch.formTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={tr('video.batch.placeholder')}
                rows={6}
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{tr('video.batch.parsedCount', { n: parsed.urls.length, max: BATCH_MAX_ITEMS })}</span>
                {parsed.invalidCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {tr('video.batch.invalidCount', { n: parsed.invalidCount })}
                  </span>
                )}
                {parsed.duplicateCount > 0 && (
                  <span>{tr('video.batch.duplicateCount', { n: parsed.duplicateCount })}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tr('video.batch.costNote')}</p>
              <div className="flex items-center gap-3">
                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                  {submitting ? tr('video.batch.submitting') : tr('video.batch.submit')}
                </Button>
                {batch && (
                  <Button variant="outline" onClick={clearBatch}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tr('video.batch.clearQueue')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {batch && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span>{tr('video.batch.queueTitle')}</span>
                  <Badge variant="outline">{tr('video.batch.concurrency', { n: status?.queue.concurrency ?? batch.concurrency })}</Badge>
                  {!!status && <Badge variant="outline">{tr('video.batch.activeSlots', { n: status.queue.active })}</Badge>}
                  {!!status && status.queue.pending > 0 && (
                    <Badge variant="outline">{tr('video.batch.pendingSlots', { n: status.queue.pending })}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {tr('video.batch.progressLabel', { done: summary.finished, total: summary.total })}
                    </span>
                    <span className="text-muted-foreground">
                      {tr('video.batch.clipsTotal', { n: summary.clipsGenerated })}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${summary.percent}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{tr('video.batch.countCompleted', { n: summary.completed })}</span>
                    <span>{tr('video.batch.countPartial', { n: summary.partial })}</span>
                    <span>{tr('video.batch.countLinkOnly', { n: summary.linkOnly })}</span>
                    <span>{tr('video.batch.countFailed', { n: summary.failed })}</span>
                  </div>
                </div>

                {finishedNote && (
                  <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {finishedNote}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">{tr('video.batch.drainHint')}</p>

                <div className="space-y-3">
                  {(status?.items ?? []).map((item) => (
                    <BatchItemRow key={item.videoId} item={item} tr={tr} />
                  ))}
                  {!status && (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tr('video.batch.loadingQueue')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function BatchItemRow({
  item,
  tr,
}: {
  item: BatchItem;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const statusKey = STATUS_KEY[item.status] || 'statusProcessing';
  const playable = item.clips.filter((c) => c.status === 'completed');

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.url}>
            {item.title || item.url}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.url}>
            {item.url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {item.stalled && (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
              <Timer className="mr-1 h-3 w-3" />
              {tr('video.batch.stalledBadge')}
            </Badge>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[item.status] || STATUS_TONE.processing}`}>
            {tr(`video.batch.${statusKey}`)}
          </span>
        </div>
      </div>

      {!['completed', 'partial', 'link_only_completed', 'failed'].includes(item.status) && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr('video.batch.itemStage', { stage: tr(`video.batch.stage_${item.stage}`), n: item.progress })}
          </p>
        </div>
      )}

      {item.stalled && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{tr('video.batch.stalledHint')}</p>}

      {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}

      {item.clips.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {tr('video.batch.clipsOf', { n: item.clips.length, playable: playable.length })}
          </p>
          {item.clips.map((clip) => (
            <div key={clip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs">
                {clip.title || `${Math.round(clip.startTime)}s – ${Math.round(clip.endTime)}s`}
              </span>
              {clip.status === 'completed' ? (
                <a
                  href={clip.videoUrl}
                  download
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Download className="h-3 w-3" />
                  {tr('video.batch.downloadClip')}
                </a>
              ) : clip.status === 'link_only' ? (
                <a
                  href={clip.linkOnlyUrl || clip.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  {tr('video.batch.openOnYouTube')}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{tr('video.batch.clipUnavailable')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}