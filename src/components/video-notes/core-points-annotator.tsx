'use client';

import { useMemo } from 'react';
import type { CorePointAnnotation, AnnotationColor } from '@/app/api/video-notes/[id]/route';

type CorePoint = {
  index: number;
  title: string;
  detail: string;
  sourceTimestamps?: string[];
  weight?: number;
};

type ColorMeta = {
  id: AnnotationColor;
  labelKey:
    | 'corePointColorYellow'
    | 'corePointColorPink'
    | 'corePointColorBlue'
    | 'corePointColorGreen'
    | 'corePointColorPurple';
  /** Tailwind class for background tint in card */
  bgClass: string;
  /** Tailwind class for ring */
  ringClass: string;
  /** Tailwind class for chip (color swatch) */
  dotClass: string;
  /** Print / SVG fill */
  fill: string;
  text: string;
};

export const ANNOTATION_COLORS: ColorMeta[] = [
  {
    id: 'yellow',
    labelKey: 'corePointColorYellow',
    bgClass: 'bg-yellow-50/80 dark:bg-yellow-950/10',
    ringClass: 'ring-2 ring-yellow-300 dark:ring-yellow-600',
    dotClass: 'bg-yellow-400',
    fill: '#FBBF24',
    text: 'text-amber-900 dark:text-amber-300',
  },
  {
    id: 'pink',
    labelKey: 'corePointColorPink',
    bgClass: 'bg-pink-50/80 dark:bg-pink-950/10',
    ringClass: 'ring-2 ring-pink-300 dark:ring-pink-600',
    dotClass: 'bg-pink-400',
    fill: '#F472B6',
    text: 'text-pink-900 dark:text-pink-300',
  },
  {
    id: 'blue',
    labelKey: 'corePointColorBlue',
    bgClass: 'bg-sky-50/80 dark:bg-sky-950/10',
    ringClass: 'ring-2 ring-sky-300 dark:ring-sky-600',
    dotClass: 'bg-sky-400',
    fill: '#38BDF8',
    text: 'text-sky-900 dark:text-sky-300',
  },
  {
    id: 'green',
    labelKey: 'corePointColorGreen',
    bgClass: 'bg-emerald-50/80 dark:bg-emerald-950/10',
    ringClass: 'ring-2 ring-emerald-300 dark:ring-emerald-600',
    dotClass: 'bg-emerald-400',
    fill: '#34D399',
    text: 'text-emerald-900 dark:text-emerald-300',
  },
  {
    id: 'purple',
    labelKey: 'corePointColorPurple',
    bgClass: 'bg-violet-50/80 dark:bg-violet-950/10',
    ringClass: 'ring-2 ring-violet-300 dark:ring-violet-600',
    dotClass: 'bg-violet-400',
    fill: '#A78BFA',
    text: 'text-violet-900 dark:text-violet-300',
  },
];

export function getColorMeta(id: AnnotationColor | null | undefined): ColorMeta | null {
  if (!id) return null;
  return ANNOTATION_COLORS.find(c => c.id === id) || null;
}

type Props = {
  corePoints: CorePoint[];
  annotations: CorePointAnnotation[];
  onAnnotationChange: (annotations: CorePointAnnotation[]) => void;
  onJumpTimestamp?: (ts: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Note id - when set, enables a Save to server button with auto-save debounce */
  noteId?: string | null;
  accessToken?: string | null;
  onSaved?: () => void;
};

export default function CorePointsAnnotator({
  corePoints,
  annotations,
  onAnnotationChange,
  onJumpTimestamp,
  t,
  noteId,
  accessToken,
  onSaved,
}: Props) {
  const byIndex = useMemo(() => {
    const map = new Map<number, CorePointAnnotation>();
    for (const a of annotations) {
      if (a && typeof a.index === 'number') map.set(a.index, a);
    }
    return map;
  }, [annotations]);

  function updateFor(index: number, patch: Partial<CorePointAnnotation>) {
    const existing = byIndex.get(index);
    const next: CorePointAnnotation = { ...(existing || { index }), ...patch, index };
    const all = annotations.filter(a => a.index !== index);
    all.push(next);
    onAnnotationChange(all);
  }

  async function handleSaveAll() {
    if (!noteId || !accessToken) return;
    try {
      const res = await fetch(`/api/video-notes/${encodeURIComponent(noteId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ annotations }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved?.();
    } catch (e: any) {
      // surface to caller via toast later; here just do nothing
      console.warn('[CorePointsAnnotator] save failed:', e);
    }
  }

  if (!corePoints || corePoints.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            🧭
            <span>{t('notes.sectionCorePoints')}</span>
            <span className="text-xs text-muted-foreground/60 ml-1">({corePoints.length})</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
            {t('notes.corePointsSubtitle')}
          </p>
        </div>
        {noteId && (
          <button
            onClick={handleSaveAll}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition"
          >
            ✓ {t('notes.corePointSaveNote')}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {corePoints.map((point) => {
          const ann = byIndex.get(point.index);
          const color = ann?.color || null;
          const noteText = ann?.note || '';
          const colorMeta = getColorMeta(color);
          const bg = colorMeta ? colorMeta.bgClass : 'bg-card dark:bg-card/50';
          const ring = colorMeta ? colorMeta.ringClass : '';
          const text = colorMeta ? colorMeta.text : 'text-foreground';

          return (
            <div
              key={point.index}
              className={
                'rounded-xl border border-border/70 p-4 transition-shadow ' +
                `${bg} ${ring}`
              }
            >
              <div className="flex items-start gap-3">
                <IndexBadge index={point.index} />
                <div className="flex-1 min-w-0">
                  <div className={'font-semibold text-[14px] leading-snug mb-1.5 ' + text}>
                    {point.title}
                  </div>
                  <p className={'text-[13px] leading-relaxed opacity-90 ' + text}>
                    {point.detail}
                  </p>

                  {point.sourceTimestamps && point.sourceTimestamps.length > 0 && onJumpTimestamp && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground mr-1">
                        {t('notes.corePointSourceLabel')}
                      </span>
                      {point.sourceTimestamps.map((ts, i) => (
                        <button
                          key={i}
                          onClick={() => onJumpTimestamp(ts)}
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-background/70 hover:bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition"
                        >
                          {ts}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Color selector */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ANNOTATION_COLORS.map((c) => {
                      const selected = color === c.id;
                      return (
                        <button
                          key={c.id}
                          aria-label={t('notes.' + c.labelKey)}
                          title={t('notes.' + c.labelKey)}
                          onClick={() => updateFor(point.index, { color: selected ? null : c.id })}
                          className={
                            'w-7 h-7 rounded-full border border-black/10 transition-transform active:scale-90 ' +
                            c.dotClass +
                            (selected ? ' ring-2 ring-offset-2 ring-foreground/70 scale-110' : '')
                          }
                        />
                      );
                    })}
                    {color && (
                      <button
                        onClick={() => updateFor(point.index, { color: null })}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1"
                      >
                        {t('notes.corePointClearColor')}
                      </button>
                    )}
                  </div>

                  {/* Text note */}
                  <div className="mt-3">
                    <textarea
                      value={noteText}
                      onChange={(e) => updateFor(point.index, { note: e.target.value })}
                      placeholder={t('notes.corePointNotePlaceholder')}
                      rows={noteText ? Math.min(5, Math.max(2, Math.ceil(noteText.length / 60) + 1)) : 2}
                      className="w-full resize-none text-[13px] rounded-lg border border-border/70 bg-background/70 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 px-3 py-2 placeholder:text-muted-foreground/60"
                    />
                    {!noteText && !color && (
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {t('notes.corePointNoAnnotation')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IndexBadge({ index }: { index: number }) {
  // Use zh circled numbers when index is in 1..10, else plain digit
  const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  const label = index >= 1 && index <= 10 ? circled[index - 1] : String(index);
  return (
    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-base font-bold shadow-sm select-none">
      {label}
    </div>
  );
}
