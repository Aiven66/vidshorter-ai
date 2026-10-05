'use client';

/**
 * 意图可控高光 · 规则面板（P0-2 T2.4）
 *
 * 仅在桌面客户端（本地引擎）下渲染：把「必须保留 / 必须删除」的关键词与
 * 片段偏好写到本地 highlight-rules.json，供 media server 规划高光时使用。
 *
 * 规则结构与 local-highlight-scorer.js 的 normalizeRules 对齐；本面板只编辑
 * keyword 规则，加载时保留其它类型（timeRange/speaker）以免误删用户数据。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal, Loader2, Check, AlertCircle } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';

export interface HighlightRuleKeyword {
  kind: 'keyword';
  text: string;
}

export type HighlightRule = HighlightRuleKeyword | { kind: string; [k: string]: unknown };

export interface HighlightPrefs {
  clipCount: 'auto' | number;
  minLen: number;
  maxLen: number;
  keepPunchlines: boolean;
  stripFillers: boolean;
}

export interface HighlightRules {
  keep: HighlightRule[];
  drop: HighlightRule[];
  prefs: HighlightPrefs;
}

export const DEFAULT_HIGHLIGHT_PREFS: HighlightPrefs = {
  clipCount: 'auto',
  minLen: 20,
  maxLen: 60,
  keepPunchlines: true,
  stripFillers: true,
};

export interface HighlightRulesBridge {
  localHighlightRulesLoad?: (profileId?: string) => Promise<unknown>;
  localHighlightRulesSave?: (rules: HighlightRules) => Promise<{ ok?: boolean }>;
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function keywordText(raw: unknown, side: 'keep' | 'drop'): string {
  const arr = asArray((raw as Record<string, unknown> | null)?.[side]);
  return arr
    .filter((r) => r && r.kind === 'keyword' && typeof r.text === 'string')
    .map((r) => String(r.text))
    .join(', ');
}

function otherRules(raw: unknown, side: 'keep' | 'drop'): HighlightRule[] {
  return asArray((raw as Record<string, unknown> | null)?.[side]).filter(
    (r) => r && r.kind && r.kind !== 'keyword',
  ) as HighlightRule[];
}

function parseKeywords(text: string): HighlightRuleKeyword[] {
  const seen = new Set<string>();
  const out: HighlightRuleKeyword[] = [];
  for (const piece of text.split(/[,，;\n]/)) {
    const t = piece.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'keyword', text: t });
    if (out.length >= 40) break;
  }
  return out;
}

function normalizePrefs(raw: unknown): HighlightPrefs {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = src.clipCount;
  const clipCount =
    count === 'auto' || typeof count !== 'number' || !Number.isFinite(count)
      ? 'auto'
      : Math.max(1, Math.min(12, Math.round(count)));
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const minLen = Math.max(5, Math.min(300, num(src.minLen, DEFAULT_HIGHLIGHT_PREFS.minLen)));
  const maxLen = Math.max(minLen, Math.min(600, num(src.maxLen, DEFAULT_HIGHLIGHT_PREFS.maxLen)));
  return {
    clipCount,
    minLen,
    maxLen,
    keepPunchlines: src.keepPunchlines !== false,
    stripFillers: src.stripFillers !== false,
  };
}

export default function HighlightRulesPanel({
  bridge,
  onRulesChange,
}: {
  bridge: HighlightRulesBridge;
  onRulesChange: (rules: HighlightRules) => void;
}) {
  const { t } = useLocale();
  const tr = useCallback(
    (key: string, fallback: string) => {
      const s = t(key);
      return s === key ? fallback : s;
    },
    [t],
  );

  const [open, setOpen] = useState(false);
  const [keepText, setKeepText] = useState('');
  const [dropText, setDropText] = useState('');
  const [prefs, setPrefs] = useState<HighlightPrefs>(DEFAULT_HIGHLIGHT_PREFS);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const extrasRef = useRef<{ keep: HighlightRule[]; drop: HighlightRule[] }>({ keep: [], drop: [] });

  const buildRules = useCallback(
    (k: string, d: string, p: HighlightPrefs): HighlightRules => ({
      keep: [...extrasRef.current.keep, ...parseKeywords(k)],
      drop: [...extrasRef.current.drop, ...parseKeywords(d)],
      prefs: p,
    }),
    [],
  );

  /* 首次挂载：读取本地规则 → 回填表单并同步给父组件（生成时直接使用） */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let raw: unknown = null;
      try {
        raw = await bridge.localHighlightRulesLoad?.();
      } catch {
        raw = null;
      }
      if (cancelled) return;
      const k = keywordText(raw, 'keep');
      const d = keywordText(raw, 'drop');
      const p = normalizePrefs((raw as Record<string, unknown> | null)?.prefs);
      extrasRef.current = { keep: otherRules(raw, 'keep'), drop: otherRules(raw, 'drop') };
      setKeepText(k);
      setDropText(d);
      setPrefs(p);
      onRulesChange(buildRules(k, d, p));
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, buildRules, onRulesChange]);

  const update = useCallback(
    (k: string, d: string, p: HighlightPrefs) => {
      setKeepText(k);
      setDropText(d);
      setPrefs(p);
      onRulesChange(buildRules(k, d, p));
    },
    [buildRules, onRulesChange],
  );

  const handleSave = useCallback(async () => {
    if (!bridge.localHighlightRulesSave || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await bridge.localHighlightRulesSave(buildRules(keepText, dropText, prefs));
      if (res && res.ok === false) throw new Error('save failed');
      setSavedTick(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [bridge, buildRules, keepText, dropText, prefs, saving]);

  const inputClass =
    'mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50';

  return (
    <div className="rounded-lg border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {tr('highlightRules.title', 'Highlight Rules')}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <p className="text-[11px] text-muted-foreground">
            {tr('highlightRules.subtitle', 'Tell the engine what must stay and what must go before generating.')}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              {tr('highlightRules.keepLabel', 'Must keep')}
              <input
                type="text"
                value={keepText}
                onChange={(e) => update(e.target.value, dropText, prefs)}
                placeholder={tr('highlightRules.keepPlaceholder', 'Keywords to always include, comma separated')}
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {tr('highlightRules.dropLabel', 'Must delete')}
              <input
                type="text"
                value={dropText}
                onChange={(e) => update(keepText, e.target.value, prefs)}
                placeholder={tr('highlightRules.dropPlaceholder', 'Keywords to always cut, comma separated')}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-muted-foreground">
              {tr('highlightRules.countLabel', 'Clip count')}
              <select
                value={prefs.clipCount === 'auto' ? 'auto' : String(prefs.clipCount)}
                onChange={(e) => {
                  const v = e.target.value;
                  update(keepText, dropText, { ...prefs, clipCount: v === 'auto' ? 'auto' : Number(v) });
                }}
                className={inputClass}
              >
                <option value="auto">{tr('highlightRules.countAuto', 'Auto')}</option>
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              {tr('highlightRules.minLen', 'Min length (s)')}
              <input
                type="number"
                min={5}
                max={300}
                value={prefs.minLen}
                onChange={(e) => update(keepText, dropText, { ...prefs, minLen: Number(e.target.value) || prefs.minLen })}
                className={inputClass}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {tr('highlightRules.maxLen', 'Max length (s)')}
              <input
                type="number"
                min={5}
                max={600}
                value={prefs.maxLen}
                onChange={(e) => update(keepText, dropText, { ...prefs, maxLen: Number(e.target.value) || prefs.maxLen })}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={prefs.keepPunchlines}
                onChange={(e) => update(keepText, dropText, { ...prefs, keepPunchlines: e.target.checked })}
              />
              {tr('highlightRules.keepPunchlines', 'Prefer punchlines')}
            </label>
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={prefs.stripFillers}
                onChange={(e) => update(keepText, dropText, { ...prefs, stripFillers: e.target.checked })}
              />
              {tr('highlightRules.stripFillers', 'Drop filler words')}
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {tr(
              'highlightRules.keywordHint',
              'Case-insensitive match on the transcript. Without a transcript the engine falls back to even sampling.',
            )}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {tr('highlightRules.save', 'Save rules')}
            </button>
            {failed && (
              <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                {tr('highlightRules.saveFailed', 'Could not save rules')}
              </span>
            )}
            {!failed && savedTick > 0 && (
              <span className="text-[11px] text-primary">{tr('highlightRules.saved', 'Saved')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
