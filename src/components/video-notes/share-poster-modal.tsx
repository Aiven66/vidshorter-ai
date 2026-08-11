'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Link2,
  Loader2,
  X,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CorePointAnnotation, AnnotationColor } from '@/app/api/video-notes/[id]/route';
import { ANNOTATION_COLORS, getColorMeta } from './core-points-annotator';

type CorePoint = {
  index: number;
  title: string;
  detail: string;
  sourceTimestamps?: string[];
  weight?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  videoTitle: string;
  sourceType: string;
  videoUrl: string;
  summary: string;
  corePoints: CorePoint[];
  annotations: CorePointAnnotation[];
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Optional: share link URL to attach (pointing to note detail) */
  shareUrl?: string;
};

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1334; // 9:16 ratio for mobile share
const BRAND = 'Clipop AI';

/**
 * 海报组件：
 * - 通过原生 SVG 绘制微信读书书签风格海报
 * - 带 Canvas 导出 PNG（自动探测 svg2canvas，如不行则提示用户长按保存）
 */
export default function SharePosterModal({
  open,
  onClose,
  videoTitle,
  sourceType,
  videoUrl,
  summary,
  corePoints,
  annotations,
  t,
  shareUrl,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const annByIndex = useMemo(() => {
    const m = new Map<number, CorePointAnnotation>();
    for (const a of annotations) if (a && typeof a.index === 'number') m.set(a.index, a);
    return m;
  }, [annotations]);

  // 展示用：取前 4 个核心要点，保证海报排版
  const displayPoints = useMemo(() => {
    if (!corePoints || corePoints.length === 0) return [];
    const sortable = corePoints.map(p => ({
      ...p,
      score: typeof p.weight === 'number' ? p.weight : 1 / p.index,
    }));
    sortable.sort((a, b) => b.score - a.score);
    return sortable.slice(0, 4).sort((a, b) => a.index - b.index);
  }, [corePoints]);

  // SVG 依赖组件挂载，这里仅在 open 时生成
  useEffect(() => {
    if (!open) return;
    setDownloadUrl(null);
  }, [open]);

  if (!open) return null;

  // === SVG 排版参数 ===
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;
  const padding = 48;
  const usableW = W - padding * 2;

  const headerH = 140;
  const summaryH = 200;
  const dividerH = 24;
  const pointsAreaH = 780;
  const footerH = 150;
  const pointCardGap = 20;
  const cards = displayPoints.length;
  const pointCardH = cards > 0
    ? (pointsAreaH - pointCardGap * (cards + 1)) / cards
    : 100;

  const gradientId = 'poster-bg-grad';
  const cardGradId = 'poster-card-grad';
  const accent = '#6D28D9'; // violet-700
  const accent2 = '#EC4899'; // pink-600
  const bg1 = '#F5F3FF';
  const bg2 = '#FFF1F2';

  // 文本处理
  const shortTitle = truncate(videoTitle || 'Untitled Video', 70);
  const shortSummary = truncate(summary || 'AI generated video lecture notes with key highlights.', 140);

  function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
    if (!text) return [];
    const textClean = String(text).replace(/\s+/g, ' ').trim();
    const lines: string[] = [];
    let current = '';
    const chars = Array.from(textClean); // 支持 emoji / CJK
    for (const c of chars) {
      const width = charWidth(c);
      const curWidth = lineWidth(current);
      if (curWidth + width > maxChars) {
        lines.push(current);
        current = c;
      } else {
        current += c;
      }
    }
    if (current) lines.push(current);
    if (lines.length > maxLines) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = truncate(last, Math.max(6, last.length - 1)) + '…';
    }
    return lines.slice(0, maxLines);
  }

  // 粗略字符宽度（CJK 2，其他 1）
  function charWidth(c: string): number {
    if (!c) return 0;
    const code = c.codePointAt(0) || 0;
    if (code > 0x2E7F) return 2;
    return 1;
  }
  function lineWidth(line: string): number {
    let sum = 0;
    for (const c of Array.from(line)) sum += charWidth(c);
    return sum;
  }

  async function exportPNG() {
    if (!svgRef.current) return;
    setRendering(true);
    try {
      const dataUrl = await svgToPng(svgRef.current, W, H);
      setDownloadUrl(dataUrl);
      toast.success(t('notes.posterGenerated'));
    } catch (e) {
      console.error(e);
      toast.error('Failed to render poster');
    } finally {
      setRendering(false);
    }
  }

  function copyShareLink() {
    const url = shareUrl || (typeof window !== 'undefined' ? window.location.href : '');
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied'),
      () => toast.error('Copy failed'),
    );
  }

  function downloadCurrent() {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${safeFilename(videoTitle) || 'clipop-poster'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ===== Render =====
  const content = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ClipopAI video notes share poster"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={bg1} />
          <stop offset="60%" stopColor={bg2} />
          <stop offset="100%" stopColor="#EEF2FF" />
        </linearGradient>
        <linearGradient id={cardGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accent2} />
        </linearGradient>
      </defs>

      {/* 背景 */}
      <rect x={0} y={0} width={W} height={H} fill={`url(#${gradientId})`} />

      {/* 装饰圆 */}
      <circle cx={W - 80} cy={80} r={140} fill="#ffffff" opacity={0.25} />
      <circle cx={80} cy={H - 200} r={180} fill="#ffffff" opacity={0.18} />

      {/* ===== Header ===== */}
      <g>
        {/* 品牌 logo 区 */}
        <rect x={padding} y={padding} width={usableW} height={headerH - padding} rx={20} fill="#ffffff" opacity={0.95} />
        {/* 品牌左侧彩色条 */}
        <rect x={padding} y={padding} width={8} height={headerH - padding} rx={4} fill={`url(#${cardGradId})`} />
        <text
          x={padding + 28}
          y={padding + 44}
          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          fontSize={30}
          fontWeight="800"
          fill={accent}
        >
          {BRAND}
        </text>
        <text
          x={padding + 28}
          y={padding + 78}
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize={18}
          fill="#64748B"
        >
          {t('notes.posterSubtitle')}
        </text>
        {/* 来源小标 */}
        <g>
          <rect x={W - padding - 140} y={padding + 20} width={124} height={28} rx={14} fill={accent} opacity={0.1} />
          <text
            x={W - padding - 140 + 14}
            y={padding + 40}
            fontFamily="ui-sans-serif, system-ui"
            fontSize={14}
            fontWeight="700"
            fill={accent}
          >
            {sourceType === 'bilibili' ? 'B 站' : sourceType === 'youtube' ? 'YouTube' : 'VIDEO'} · 视频笔记
          </text>
        </g>
      </g>

      {/* ===== 标题 ===== */}
      <g>
        const titleLines = {wrapLines(shortTitle, 34, 3)};
        {titleLines.map((line, i) => (
          <text
            key={`tl-${i}`}
            x={padding}
            y={headerH + 50 + i * 40}
            fontFamily="ui-sans-serif, system-ui, -apple-system, PingFang SC, Hiragino Sans GB"
            fontSize={32}
            fontWeight="800"
            fill="#0F172A"
          >
            {line}
          </text>
        ))}
      </g>

      {/* ===== Summary card ===== */}
      <g>
        const summaryTop = headerH + 170;
        <rect x={padding} y={summaryTop} width={usableW} height={summaryH} rx={22} fill="#ffffff" opacity={0.96} />
        <rect x={padding} y={summaryTop} width={6} height={summaryH} rx={3} fill="#F59E0B" />
        <text
          x={padding + 24}
          y={summaryTop + 42}
          fontFamily="ui-sans-serif, system-ui"
          fontSize={18}
          fontWeight="800"
          fill="#92400E"
        >
          📋 Overview
        </text>
        const summaryLines = wrapLines(shortSummary, 42, 5);
        {summaryLines.map((line, i) => (
          <text
            key={`sl-${i}`}
            x={padding + 24}
            y={summaryTop + 80 + i * 28}
            fontFamily="ui-sans-serif, system-ui, PingFang SC"
            fontSize={20}
            fill="#334155"
          >
            {line}
          </text>
        ))}
      </g>

      {/* ===== Divider + label ===== */}
      <g>
        const dTop = headerH + summaryH + 180;
        <text x={padding} y={dTop} fontFamily="ui-sans-serif, system-ui" fontSize={20} fontWeight="800" fill="#4C1D95">
          ✨ {t('notes.posterCorePointsLabel')}
        </text>
        <line x1={padding} y1={dTop + 10} x2={W - padding} y2={dTop + 10} stroke="#C4B5FD" strokeWidth={2} />
      </g>

      {/* ===== Point cards ===== */}
      {(() => {
        const areaTop = headerH + summaryH + 210;
        const elems: JSX.Element[] = [];
        for (let i = 0; i < displayPoints.length; i++) {
          const p = displayPoints[i];
          const y = areaTop + i * (pointCardH + pointCardGap);
          const ann = annByIndex.get(p.index);
          const colorMeta = getColorMeta((ann?.color as AnnotationColor | undefined) || null);
          const bg = colorMeta?.fill || '#FFFFFF';
          const txtColor = '#0F172A';

          elems.push(
            <g key={`pc-${i}`}>
              <rect x={padding} y={y} width={usableW} height={pointCardH} rx={22} fill="#FFFFFF" opacity={0.98} />
              {/* Color side stripe */}
              <rect x={padding} y={y} width={10} height={pointCardH} rx={5} fill={bg} opacity={0.95} />
              {/* Index badge */}
              <rect x={padding + 24} y={y + 20} width={44} height={44} rx={22} fill={accent} />
              <text
                x={padding + 46}
                y={y + 50}
                textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui"
                fontSize={22}
                fontWeight="800"
                fill="#ffffff"
              >
                {p.index}
              </text>
              {/* Title */}
              {(() => {
                const titleLines = wrapLines(truncate(p.title, 55), 34, 2);
                return titleLines.map((line, li) => (
                  <text
                    key={`pt-${i}-${li}`}
                    x={padding + 84}
                    y={y + 38 + li * 26}
                    fontFamily="ui-sans-serif, system-ui, PingFang SC"
                    fontSize={20}
                    fontWeight="800"
                    fill={txtColor}
                  >
                    {line}
                  </text>
                ));
              })()}
              {/* Detail */}
              {(() => {
                const maxDetailChars = 38;
                const maxDetailLines = Math.max(2, Math.floor((pointCardH - 80) / 24));
                const dLines = wrapLines(truncate(p.detail, 110), maxDetailChars, maxDetailLines);
                return dLines.map((line, di) => (
                  <text
                    key={`pd-${i}-${di}`}
                    x={padding + 24}
                    y={y + 86 + di * 24}
                    fontFamily="ui-sans-serif, system-ui, PingFang SC"
                    fontSize={17}
                    fill="#334155"
                  >
                    {line}
                  </text>
                ));
              })()}
              {/* Annotation note */}
              {ann?.note ? (
                <g>
                  <rect x={padding + 24} y={y + pointCardH - 50} width={usableW - 48} height={32} rx={8} fill={colorMeta?.fill || '#FEF3C7'} opacity={0.35} />
                  {wrapLines(truncate(ann.note, 50), 40, 1).map((line, ai) => (
                    <text
                      key={`pa-${i}-${ai}`}
                      x={padding + 36}
                      y={y + pointCardH - 28}
                      fontFamily="ui-sans-serif, system-ui, PingFang SC"
                      fontSize={15}
                      fill="#78350F"
                    >
                      ✎ {line}
                    </text>
                  ))}
                </g>
              ) : null}
              {/* Timestamp chips */}
              {p.sourceTimestamps && p.sourceTimestamps.length > 0 ? (
                <g>
                  {p.sourceTimestamps.slice(0, 2).map((ts, ti) => {
                    const chipX = W - padding - (ti * (80 + 10)) - 80;
                    return (
                      <g key={`ts-${i}-${ti}`}>
                        <rect x={chipX} y={y + pointCardH - 40} width={76} height={26} rx={13} fill="#111827" opacity={0.82} />
                        <text
                          x={chipX + 38}
                          y={y + pointCardH - 22}
                          textAnchor="middle"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          fontSize={14}
                          fontWeight="700"
                          fill="#ffffff"
                        >
                          {ts}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ) : null}
            </g>
          );
        }
        return elems;
      })()}

      {/* ===== Footer ===== */}
      <g>
        const fTop = H - footerH;
        <rect x={0} y={fTop} width={W} height={footerH} fill="#0B1120" />
        {/* Brand text */}
        <text x={padding} y={fTop + 54} fontFamily="ui-sans-serif, system-ui" fontSize={32} fontWeight="900" fill="#ffffff">
          {BRAND}
        </text>
        <text x={padding} y={fTop + 86} fontFamily="ui-sans-serif, system-ui" fontSize={16} fill="#CBD5E1">
          {t('notes.posterGeneratedBy')}
        </text>
        <text x={padding} y={fTop + 112} fontFamily="ui-sans-serif, system-ui" fontSize={15} fill="#A78BFA">
          🔗 {t('notes.posterCta')}
        </text>
        {/* Brand symbol */}
        <g transform={`translate(${W - padding - 100}, ${fTop + 28})`}>
          <circle cx={50} cy={50} r={48} fill="none" stroke="#A78BFA" strokeWidth={3} />
          <circle cx={50} cy={50} r={36} fill="none" stroke="#EC4899" strokeWidth={3} strokeDasharray="6 8" />
          <text x={50} y={60} textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize={34} fontWeight="900" fill="#ffffff">C</text>
        </g>
      </g>
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] md:max-w-[520px] max-h-[92vh] flex flex-col bg-background rounded-2xl shadow-2xl overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">{t('notes.sharePoster')}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/70">
          {t('notes.sharePosterDesc')} · <span className="text-foreground/80">{t('notes.posterShareHint')}</span>
        </div>

        {/* Poster preview area */}
        <div className="flex-1 overflow-y-auto bg-black/5 px-4 py-4">
          <div className="mx-auto rounded-2xl overflow-hidden shadow-xl max-w-[360px] ring-1 ring-black/5 bg-white">
            {content}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-between px-4 py-3 border-t border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <button
              onClick={copyShareLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background hover:bg-muted border border-border text-sm transition"
            >
              <Link2 className="h-3.5 w-3.5" />
              {t('notes.posterCopy')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {downloadUrl && (
              <button
                onClick={downloadCurrent}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm transition"
              >
                <Download className="h-3.5 w-3.5" />
                {t('notes.posterDownload')}
              </button>
            )}
            <button
              onClick={exportPNG}
              disabled={rendering}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary hover:opacity-90 disabled:opacity-60 text-primary-foreground text-sm transition"
            >
              {rendering ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('notes.posterGenerating')}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {t('notes.posterDownload')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function safeFilename(name?: string): string {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
}

/** Convert an inline SVG element to PNG data URL using canvas */
async function svgToPng(svg: SVGSVGElement, width: number, height: number): Promise<string> {
  // 1. Serialize SVG
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.hasAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  // 2. Load into image
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = (e) => reject(new Error('SVG load failed: ' + String(e)));
    image.src = svg64;
  });

  // 3. Use canvas for 2x DPR rendering
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/png', 0.92);
}
