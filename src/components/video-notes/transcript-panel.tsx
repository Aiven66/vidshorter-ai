'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/locale-context';
import { Languages, Loader2, PlayCircle, RotateCcw, Eye, EyeOff } from 'lucide-react';

export type TranscriptSegmentLite = {
  start: number;
  duration: number;
  text: string;
  /** 该行是否为译文（翻译后返回） */
  translated?: boolean;
};

/** 可选目标语言（与 /api/video-notes/translate 白名单保持一致） */
const TARGET_LANGS: Array<{ code: string; label: string }> = [
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
];

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** 二分查找当前播放时间命中的逐字稿行（segments 按 start 升序） */
function findActiveIndex(list: TranscriptSegmentLite[], time: number): number {
  if (list.length === 0) return -1;
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= time) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return -1;
  const seg = list[ans];
  const end = seg.start + (seg.duration || 0);
  // 只在当前行时间窗内（或最后一行）高亮，避免长时间停在上一行
  if (seg.duration > 0 && time > end + 1.5) return -1;
  return ans;
}

export default function TranscriptPanel({
  segments,
  truncated,
  activeTime,
  onJump,
  accessToken,
  emptyHint,
}: {
  segments: TranscriptSegmentLite[];
  truncated?: boolean;
  activeTime: number;
  onJump: (seconds: number) => void;
  accessToken: string | null;
  /** 空态下的补充原因（如上游字幕源被限制），避免静默失败 */
  emptyHint?: string | null;
}) {
  const { t: translate, locale } = useLocale();
  /** 扁平 key + {var} 插值（与页面内 tr 行为一致） */
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = translate(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      }
      return s;
    },
    [translate],
  );

  // 默认把目标语言选成"与界面语言不同"的那一个，减少一次手动切换
  const defaultTarget = locale.toLowerCase().startsWith('zh') ? 'en' : 'zh-Hans';
  const [targetLang, setTargetLang] = useState(defaultTarget);
  const [translated, setTranslated] = useState<TranscriptSegmentLite[] | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [untranslated, setUntranslated] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);

  const display = translated ?? segments;
  const activeIndex = useMemo(() => findActiveIndex(display, activeTime), [display, activeTime]);

  const handleTranslate = useCallback(async () => {
    if (!accessToken) {
      setError(t('notes.errorLoginRequired'));
      return;
    }
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch('/api/video-notes/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ segments, targetLang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || t('notes.translateFailed'));
      }
      const list: TranscriptSegmentLite[] = Array.isArray(data?.segments) ? data.segments : [];
      if (list.length === 0) throw new Error(t('notes.translateFailed'));
      setTranslated(list);
      setUntranslated(typeof data?.untranslated === 'number' ? data.untranslated : 0);
    } catch (e: any) {
      setError(e?.message || t('notes.translateFailed'));
    } finally {
      setTranslating(false);
    }
  }, [accessToken, segments, targetLang, t]);

  const handleRestore = useCallback(() => {
    setTranslated(null);
    setUntranslated(0);
    setError(null);
    setShowOriginal(false);
  }, []);

  if (segments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <Languages className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>{t('notes.transcriptEmpty')}</p>
        {emptyHint ? (
          <p className="mt-2 text-xs text-destructive/80 max-w-md mx-auto">{emptyHint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {/* 工具栏：目标语言 + 翻译/恢复 + 双语开关 */}
      <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-border">
        <Languages className="h-4 w-4 text-muted-foreground shrink-0" />
        <label className="text-xs text-muted-foreground" htmlFor="transcript-target-lang">
          {t('notes.translateTo')}
        </label>
        <select
          id="transcript-target-lang"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          disabled={translating}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          {TARGET_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={handleTranslate} disabled={translating} className="h-8">
          {translating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {t('notes.translating')}
            </>
          ) : (
            <>
              <Languages className="h-3.5 w-3.5 mr-1.5" />
              {translated ? t('notes.translateAgain') : t('notes.translate')}
            </>
          )}
        </Button>
        {translated && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowOriginal((v) => !v)}
              className="h-8"
            >
              {showOriginal ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                  {t('notes.hideOriginal')}
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  {t('notes.showOriginal')}
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRestore} className="h-8">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {t('notes.restoreOriginal')}
            </Button>
          </>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {t('notes.transcriptCount', { n: segments.length })}
        </span>
      </div>

      {/* 明文状态提示：翻译失败 / 部分未翻译 / 逐字稿被截断 */}
      {error && (
        <p className="text-xs text-destructive mb-3 px-2 py-1.5 rounded bg-destructive/10">{error}</p>
      )}
      {untranslated > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          {t('notes.translatePartial', { n: untranslated })}
        </p>
      )}
      {truncated && (
        <p className="text-xs text-muted-foreground mb-3">{t('notes.transcriptTruncatedHint')}</p>
      )}

      {/* 逐字稿列表 */}
      <div className="space-y-1">
        {display.map((seg, i) => {
          const original = segments[i];
          const isActive = i === activeIndex;
          return (
            <div
              key={`${seg.start}-${i}`}
              className={
                'group flex gap-2.5 px-2 py-1.5 rounded-md transition-colors ' +
                (isActive ? 'bg-primary/10' : 'hover:bg-muted/60')
              }
            >
              <button
                type="button"
                onClick={() => onJump(seg.start)}
                title={t('notes.playAt', { t: formatClock(seg.start) })}
                className={
                  'shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded font-mono text-[11px] tabular-nums transition-colors ' +
                  (isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary')
                }
              >
                <PlayCircle className="h-3 w-3" />
                {formatClock(seg.start)}
              </button>
              <div className="flex-1 min-w-0">
                <p className={'text-sm leading-relaxed ' + (isActive ? 'text-foreground' : 'text-foreground/90')}>
                  {seg.text}
                </p>
                {showOriginal && translated && original && original.text !== seg.text && (
                  <p className="text-xs leading-relaxed text-muted-foreground mt-0.5">{original.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}