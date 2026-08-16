import React from 'react';
import {
  type DrawContext,
  easeOutCubic,
  easeOutBack,
  clamp01,
  stagger,
  fillGradient,
  fillSolid,
  setFont,
  drawCenteredBlock,
  drawWrappedText,
  wrapText,
  fillRoundRect,
  roundRect,
  withAlpha,
  getCachedImage,
  drawImageContain,
} from './canvas-utils';
import { type SceneTheme, resolveSceneTheme } from './scene-theme';

/* ------------------------------------------------------------------ */
/* Shared animation keyframes (for live DOM preview only)             */
/* ------------------------------------------------------------------ */

const ANIMATION_KEYFRAMES = `
  @keyframes vs-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes vs-fade-in-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes vs-fade-in-down { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes vs-scale-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  @keyframes vs-slide-left { from { opacity: 0; transform: translateX(80px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes vs-grow-up { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes vs-grow-width { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes vs-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
  @keyframes vs-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
  @keyframes vs-rotate-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

function AnimationStyles() {
  return <style dangerouslySetInnerHTML={{ __html: ANIMATION_KEYFRAMES }} />;
}

/** #rrggbb + alpha → rgba() 字符串（供 React 内联样式使用） */
function withAlphaCss(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/* Shared palette                                                      */
/* ------------------------------------------------------------------ */

// 所有场景颜色统一走 SceneTheme（见 scene-theme.ts）。
// resolveSceneTheme 在缺省时回退 indigo（与平台 tailwind primary 同步），
// 保证旧调用方（不传 theme）行为不变。

/* ------------------------------------------------------------------ */
/* 1. NewsHeadlineScene                                                */
/* ------------------------------------------------------------------ */

export interface NewsHeadlineSceneProps {
  headline: string;
  source: string;
  date?: string;
  category?: string;
  theme?: SceneTheme;
}

export function NewsHeadlineScene({
  headline,
  source,
  date,
  category,
  theme,
}: NewsHeadlineSceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col justify-center overflow-hidden p-8"
      style={{
        background: `linear-gradient(to bottom, ${th.bgCard}, ${th.bgDark})`,
      }}
    >
      <AnimationStyles />

      <div
        className="absolute left-0 top-0 h-2"
        style={{
          width: '100%',
          backgroundColor: th.primary,
          transformOrigin: 'left',
          animation: 'vs-grow-width 0.6s ease-out both',
        }}
      />

      {category && (
        <div
          className="relative z-10 mb-6"
          style={{ animation: 'vs-fade-in-up 0.6s ease-out both' }}
        >
          <span
            className="inline-block rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: th.primary }}
          >
            {category}
          </span>
        </div>
      )}

      <h1
        className="relative z-10 text-4xl font-bold leading-tight text-white"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {headline}
      </h1>

      <div
        className="relative z-10 mt-8 flex items-center gap-3"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.5s both' }}
      >
        <div
          className="h-8 w-1 rounded-full"
          style={{ backgroundColor: th.primary }}
        />
        <div>
          <p className="text-base font-medium text-white">{source}</p>
          {date && <p className="text-sm" style={{ color: th.textMuted }}>{date}</p>}
        </div>
      </div>
    </div>
  );
}

/** HyperFrames-style deterministic canvas drawing for NewsHeadlineScene */
export function drawNewsHeadline(
  dc: DrawContext,
  props: NewsHeadlineSceneProps,
) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  // Background: vertical gradient (dark → slightly lighter)
  fillGradient(ctx, width, height, [
    { offset: 0, color: th.bgCard },
    { offset: 1, color: th.bgDark },
  ], 'vertical');

  // Top accent bar — grows from left to right over first 40%
  const barProgress = easeOutCubic(stagger(progress, 0, 0.4));
  ctx.fillStyle = th.primary;
  ctx.fillRect(0, 0, width * barProgress, Math.max(6, height * 0.006));

  const padding = width * 0.08;
  const contentW = width - padding * 2;

  // Category badge — fades in over 0 → 0.3
  const badgeT = stagger(progress, 0, 0.3);
  const badgeAlpha = easeOutCubic(badgeT);
  const badgeY = height * 0.32;

  if (props.category) {
    ctx.globalAlpha = badgeAlpha;
    setFont(ctx, { size: width * 0.038, weight: 700 });
    const badgeText = props.category.toUpperCase();
    const badgeMetrics = ctx.measureText(badgeText);
    const badgePadX = width * 0.035;
    const badgePadY = width * 0.018;
    const badgeW = badgeMetrics.width + badgePadX * 2;
    const badgeH = width * 0.038 + badgePadY * 2;
    fillRoundRect(ctx, padding, badgeY, badgeW, badgeH, badgeH / 2, th.primary);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, padding + badgePadX, badgeY + badgeH / 2);
    ctx.globalAlpha = 1;
  }

  // Headline — fade-in-up over 0.15 → 0.7
  const headT = stagger(progress, 0.15, 0.55);
  const headAlpha = easeOutCubic(headT);
  const headTranslate = (1 - easeOutCubic(headT)) * (height * 0.04);

  ctx.globalAlpha = headAlpha;
  setFont(ctx, { size: width * 0.075, weight: 800 });
  ctx.fillStyle = '#ffffff';
  const headY = badgeY + width * 0.14 + headTranslate;
  drawWrappedText(
    ctx,
    props.headline,
    padding,
    headY,
    contentW,
    width * 0.1,
    'left',
    'top',
  );
  ctx.globalAlpha = 1;

  // Source — fade-in-up over 0.5 → 0.9
  const srcT = stagger(progress, 0.5, 0.4);
  const srcAlpha = easeOutCubic(srcT);
  ctx.globalAlpha = srcAlpha;
  // accent bar
  ctx.fillStyle = th.primary;
  ctx.fillRect(padding, height * 0.82, width * 0.012, width * 0.08);
  setFont(ctx, { size: width * 0.042, weight: 600 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(props.source, padding + width * 0.04, height * 0.82);
  if (props.date) {
    setFont(ctx, { size: width * 0.032, weight: 400 });
    ctx.fillStyle = th.textMuted;
    ctx.fillText(props.date, padding + width * 0.04, height * 0.82 + width * 0.052);
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 2. KeyPointScene                                                    */
/* ------------------------------------------------------------------ */

export interface KeyPointSceneProps {
  number: number | string;
  title: string;
  content: string;
  theme?: SceneTheme;
}

export function KeyPointScene({ number, title, content, theme }: KeyPointSceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col justify-center overflow-hidden p-8"
      style={{ backgroundColor: th.bgCard }}
    >
      <AnimationStyles />

      <span
        className="absolute right-4 top-8 select-none text-[200px] font-bold leading-none"
        style={{ color: `${th.primaryLight}0d` }}
      >
        {number}
      </span>

      <div
        className="relative z-10 mb-8"
        style={{ animation: 'vs-scale-in 0.6s ease-out both' }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-4xl font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${th.primaryLight}, ${th.primaryDark})`,
          }}
        >
          {number}
        </div>
      </div>

      <h2
        className="relative z-10 mb-4 text-3xl font-bold text-white"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {title}
      </h2>

      <p
        className="relative z-10 text-lg leading-relaxed"
        style={{ color: th.textBody, animation: 'vs-fade-in-up 0.8s ease-out 0.4s both' }}
      >
        {content}
      </p>

      <div
        className="absolute bottom-8 left-8 right-8 h-1 overflow-hidden rounded-full"
        style={{ backgroundColor: `${th.primary}33` }}
      >
        <div
          className="h-full rounded-full"
          style={{
            backgroundColor: th.primary,
            transformOrigin: 'left',
            animation: 'vs-grow-width 1s ease-out 0.6s both',
          }}
        />
      </div>
    </div>
  );
}

export function drawKeyPoint(dc: DrawContext, props: KeyPointSceneProps) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  fillSolid(ctx, width, height, th.bgCard);

  // Oversized background number (decorative)
  const decoT = stagger(progress, 0, 0.5);
  ctx.globalAlpha = 0.05 * decoT;
  setFont(ctx, { size: width * 0.55, weight: 900 });
  ctx.fillStyle = th.primaryLight;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(String(props.number), width - width * 0.05, height * 0.04);
  ctx.globalAlpha = 1;

  const padding = width * 0.08;

  // Number badge — scale-in over 0 → 0.4
  const badgeT = stagger(progress, 0, 0.4);
  const scale = easeOutBack(badgeT);
  const badgeSize = width * 0.22;
  const cx = padding + badgeSize / 2;
  const cy = height * 0.28;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  // circle
  const grad = ctx.createLinearGradient(-badgeSize / 2, -badgeSize / 2, badgeSize / 2, badgeSize / 2);
  grad.addColorStop(0, th.primaryLight);
  grad.addColorStop(1, th.primaryDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, badgeSize / 2, 0, Math.PI * 2);
  ctx.fill();
  // number text
  setFont(ctx, { size: badgeSize * 0.42, weight: 800 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(props.number), 0, 0);
  ctx.restore();

  // Title — fade-in-up over 0.2 → 0.7
  const titleT = stagger(progress, 0.2, 0.5);
  const titleAlpha = easeOutCubic(titleT);
  const titleY = height * 0.46 + (1 - easeOutCubic(titleT)) * (height * 0.03);

  ctx.globalAlpha = titleAlpha;
  setFont(ctx, { size: width * 0.062, weight: 800 });
  ctx.fillStyle = '#ffffff';
  drawWrappedText(
    ctx,
    props.title,
    padding,
    titleY,
    width - padding * 2,
    width * 0.085,
    'left',
    'top',
  );
  ctx.globalAlpha = 1;

  // Content — fade-in-up over 0.4 → 0.9
  const bodyT = stagger(progress, 0.4, 0.5);
  const bodyAlpha = easeOutCubic(bodyT);
  ctx.globalAlpha = bodyAlpha;
  setFont(ctx, { size: width * 0.038, weight: 400 });
  ctx.fillStyle = th.textBody;
  // measure title height to position content under it
  setFont(ctx, { size: width * 0.062, weight: 800 });
  const titleLines = wrapText(ctx, props.title, width - padding * 2);
  const contentY = titleY + titleLines.length * width * 0.085 + width * 0.04;
  setFont(ctx, { size: width * 0.038, weight: 400 });
  drawWrappedText(
    ctx,
    props.content,
    padding,
    contentY,
    width - padding * 2,
    width * 0.058,
    'left',
    'top',
  );
  ctx.globalAlpha = 1;

  // Bottom accent line — grows over 0.6 → 1.0
  const lineT = stagger(progress, 0.6, 0.4);
  const lineW = (width - padding * 2) * easeOutCubic(lineT);
  const lineY = height * 0.92;
  // track
  ctx.fillStyle = withAlpha(th.primary, 0.2);
  ctx.fillRect(padding, lineY, width - padding * 2, Math.max(4, width * 0.006));
  // fill
  ctx.fillStyle = th.primary;
  ctx.fillRect(padding, lineY, lineW, Math.max(4, width * 0.006));
}

/* ------------------------------------------------------------------ */
/* 3. QuoteScene                                                       */
/* ------------------------------------------------------------------ */

export interface QuoteSceneProps {
  quote: string;
  author?: string;
  role?: string;
  theme?: SceneTheme;
}

export function QuoteScene({ quote, author, role, theme }: QuoteSceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-10"
      style={{
        background: `linear-gradient(to bottom right, ${th.bgCard}, ${th.bgDark})`,
      }}
    >
      <AnimationStyles />

      <span
        className="absolute left-6 top-8 select-none font-serif text-[180px] leading-none"
        style={{ color: `${th.primaryLight}38`, animation: 'vs-fade-in 1s ease-out both' }}
      >
        &ldquo;
      </span>
      <span
        className="absolute bottom-8 right-6 rotate-180 select-none font-serif text-[180px] leading-none"
        style={{ color: `${th.primaryLight}38`, animation: 'vs-fade-in 1s ease-out 0.3s both' }}
      >
        &ldquo;
      </span>

      <p
        className="relative z-10 text-center text-3xl font-bold leading-snug text-white"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {quote}
      </p>

      {author && (
        <div
          className="relative z-10 mt-8 flex flex-col items-center gap-1"
          style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.5s both' }}
        >
          <div
            className="mb-2 h-0.5 w-12 rounded-full"
            style={{ backgroundColor: th.primary }}
          />
          <p className="text-lg font-semibold text-white">{author}</p>
          {role && <p className="text-sm" style={{ color: th.textMuted }}>{role}</p>}
        </div>
      )}
    </div>
  );
}

export function drawQuote(dc: DrawContext, props: QuoteSceneProps) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  // Background: diagonal gradient
  fillGradient(ctx, width, height, [
    { offset: 0, color: th.bgCard },
    { offset: 1, color: th.bgDark },
  ], 'diagonal');

  const padding = width * 0.1;

  // Decorative quotation marks — fade in
  const mark1T = easeOutCubic(stagger(progress, 0, 0.4));
  const mark2T = easeOutCubic(stagger(progress, 0.2, 0.4));

  ctx.fillStyle = withAlpha(th.primaryLight, 0.22);
  setFont(ctx, { size: width * 0.32, weight: 700, family: 'Georgia, serif' });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha = mark1T;
  ctx.fillText('\u201C', padding, height * 0.06);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = mark2T;
  ctx.fillText('\u201D', width - padding, height * 0.94);
  ctx.globalAlpha = 1;

  // Quote text — fade-in-up over 0.2 → 0.75
  const qT = stagger(progress, 0.2, 0.55);
  const qAlpha = easeOutCubic(qT);
  const qTranslate = (1 - easeOutCubic(qT)) * (height * 0.04);

  ctx.globalAlpha = qAlpha;
  setFont(ctx, { size: width * 0.062, weight: 700 });
  ctx.fillStyle = '#ffffff';
  drawCenteredBlock(
    ctx,
    props.quote,
    width / 2,
    height * 0.5 + qTranslate,
    width - padding * 2,
    width * 0.09,
  );
  ctx.globalAlpha = 1;

  // Author — fade-in-up over 0.5 → 0.95
  if (props.author) {
    const aT = stagger(progress, 0.5, 0.4);
    const aAlpha = easeOutCubic(aT);
    ctx.globalAlpha = aAlpha;
    // accent line
    ctx.fillStyle = th.primary;
    ctx.fillRect(width / 2 - width * 0.04, height * 0.78, width * 0.08, 3);
    // author
    setFont(ctx, { size: width * 0.044, weight: 600 });
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(props.author, width / 2, height * 0.78 + width * 0.05);
    if (props.role) {
      setFont(ctx, { size: width * 0.032, weight: 400 });
      ctx.fillStyle = th.textMuted;
      ctx.fillText(props.role, width / 2, height * 0.78 + width * 0.105);
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */
/* 4. BrandIntroScene                                                  */
/* ------------------------------------------------------------------ */

export interface BrandIntroSceneProps {
  brandName: string;
  tagline?: string;
  logoText?: string;
  theme?: SceneTheme;
}

export function BrandIntroScene({
  brandName,
  tagline,
  logoText,
  theme,
}: BrandIntroSceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(to bottom right, ${withAlphaCss(th.primary, 0.22)}, ${th.bgDark} 50%, ${withAlphaCss(th.primary, 0.12)})`,
      }}
    >
      <AnimationStyles />

      <div
        className="absolute left-1/4 top-1/4 h-48 w-48 rounded-full blur-3xl"
        style={{ backgroundColor: withAlphaCss(th.primary, 0.1), animation: 'vs-float 4s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 h-32 w-32 rounded-full blur-2xl"
        style={{ backgroundColor: withAlphaCss(th.primary, 0.2), animation: 'vs-float 3s ease-in-out infinite reverse' }}
      />

      <div
        className="relative z-10 mb-8"
        style={{ animation: 'vs-scale-in 0.8s ease-out both' }}
      >
        <div
          className="flex h-24 w-24 items-center justify-center rounded-2xl text-3xl font-bold text-white shadow-xl"
          style={{
            background: `linear-gradient(135deg, ${th.primaryLight}, ${th.primaryDark})`,
          }}
        >
          {logoText ?? brandName.charAt(0).toUpperCase()}
        </div>
      </div>

      <h1
        className="relative z-10 px-8 text-center text-4xl font-bold text-white"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
      >
        {brandName}
      </h1>

      {tagline && (
        <p
          className="relative z-10 mt-4 px-8 text-center text-lg"
          style={{ color: th.textMuted, animation: 'vs-fade-in-up 0.8s ease-out 0.6s both' }}
        >
          {tagline}
        </p>
      )}
    </div>
  );
}

export function drawBrandIntro(dc: DrawContext, props: BrandIntroSceneProps) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  fillGradient(ctx, width, height, [
    { offset: 0, color: withAlpha(th.primary, 0.22) },
    { offset: 0.5, color: th.bgDark },
    { offset: 1, color: withAlpha(th.primary, 0.12) },
  ], 'diagonal');

  // Floating orbs (static positions, alpha driven by progress)
  ctx.globalAlpha = 0.12 * clamp01(progress * 2);
  ctx.fillStyle = th.primaryLight;
  ctx.beginPath();
  ctx.arc(width * 0.28, height * 0.3, width * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.2 * clamp01(progress * 2);
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.7, width * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Logo block — scale-in over 0 → 0.5
  const logoT = stagger(progress, 0, 0.5);
  const scale = easeOutBack(logoT);
  const logoSize = width * 0.28;
  const cx = width / 2;
  const cy = height * 0.4;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(-logoSize / 2, -logoSize / 2, logoSize / 2, logoSize / 2);
  grad.addColorStop(0, th.primaryLight);
  grad.addColorStop(1, th.primaryDark);
  ctx.fillStyle = grad;
  const r = width * 0.04;
  ctx.beginPath();
  ctx.roundRect(-logoSize / 2, -logoSize / 2, logoSize, logoSize, r);
  ctx.fill();
  setFont(ctx, { size: logoSize * 0.4, weight: 800 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(props.logoText ?? props.brandName.charAt(0).toUpperCase(), 0, 0);
  ctx.restore();

  // Brand name — fade-in-up over 0.3 → 0.8
  const nameT = stagger(progress, 0.3, 0.5);
  ctx.globalAlpha = easeOutCubic(nameT);
  setFont(ctx, { size: width * 0.082, weight: 800 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(props.brandName, width / 2, height * 0.58);
  ctx.globalAlpha = 1;

  // Tagline — fade-in-up over 0.6 → 1.0
  if (props.tagline) {
    const tagT = stagger(progress, 0.6, 0.4);
    ctx.globalAlpha = easeOutCubic(tagT);
    setFont(ctx, { size: width * 0.042, weight: 400 });
    ctx.fillStyle = '#9ca3af';
    drawCenteredBlock(
      ctx,
      props.tagline,
      width / 2,
      height * 0.7,
      width - width * 0.2,
      width * 0.06,
    );
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */
/* 5. ProductShowcaseScene                                             */
/* ------------------------------------------------------------------ */

export interface ProductShowcaseSceneProps {
  productName: string;
  price: string;
  originalPrice?: string;
  description?: string;
  imageUrl?: string;
  theme?: SceneTheme;
}

export function ProductShowcaseScene({
  productName,
  price,
  originalPrice,
  description,
  imageUrl,
  theme,
}: ProductShowcaseSceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: th.bgDark }}
    >
      <AnimationStyles />

      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${withAlphaCss(th.primary, 0.18)}, transparent)`,
        }}
      />

      <div
        className="relative flex flex-1 items-center justify-center p-8"
        style={{ animation: 'vs-scale-in 0.8s ease-out both' }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={productName}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          />
        ) : (
          <div
            className="flex h-48 w-48 items-center justify-center rounded-2xl"
            style={{
              background: `linear-gradient(to bottom right, ${withAlphaCss(th.primary, 0.4)}, ${withAlphaCss(th.primary, 0.1)})`,
            }}
          >
            <span className="text-6xl">📦</span>
          </div>
        )}
      </div>

      <div
        className="relative space-y-3 p-8"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
      >
        <h2 className="text-3xl font-bold text-white">{productName}</h2>
        {description && (
          <p className="text-base" style={{ color: th.textBody }}>{description}</p>
        )}
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold" style={{ color: th.primaryLight }}>{price}</span>
          {originalPrice && (
            <span className="text-lg line-through" style={{ color: th.textMuted }}>
              {originalPrice}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function drawProductShowcase(
  dc: DrawContext,
  props: ProductShowcaseSceneProps,
) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  fillGradient(ctx, width, height, [
    { offset: 0, color: withAlpha(th.primary, 0.18) },
    { offset: 0.5, color: th.bgDark },
    { offset: 1, color: th.bgDark },
  ], 'vertical');

  const padding = width * 0.08;

  // Product image / placeholder block (top half) — scale-in
  const phT = stagger(progress, 0, 0.5);
  const scale = easeOutBack(phT);
  const phW = width * 0.6;
  const phH = width * 0.6;
  const phX = (width - phW) / 2;
  const phY = height * 0.1;

  const img = getCachedImage(props.imageUrl);

  ctx.save();
  ctx.translate(width / 2, phY + phH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(phX + phW / 2), -(phY + phH / 2));

  if (img) {
    // 白色圆角卡片衬托商品主图（多数电商图为白底，深色视频背景下卡片观感更好）
    const cardPad = width * 0.02;
    fillRoundRect(
      ctx,
      phX - cardPad,
      phY - cardPad,
      phW + cardPad * 2,
      phH + cardPad * 2,
      width * 0.035,
      '#ffffff',
    );
    // 圆角裁剪 + contain 绘制
    ctx.save();
    roundRect(ctx, phX - cardPad, phY - cardPad, phW + cardPad * 2, phH + cardPad * 2, width * 0.035);
    ctx.clip();
    drawImageContain(ctx, img, phX, phY, phW, phH);
    ctx.restore();
  } else {
    const grad = ctx.createLinearGradient(phX, phY, phX + phW, phY + phH);
    grad.addColorStop(0, withAlpha(th.primary, 0.4));
    grad.addColorStop(1, withAlpha(th.primary, 0.1));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(phX, phY, phW, phW, width * 0.04);
    ctx.fill();
    // emoji placeholder
    setFont(ctx, { size: width * 0.18 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCE6', phX + phW / 2, phY + phH / 2);
  }
  ctx.restore();

  // Info section — fade-in-up over 0.3 → 0.8
  const infoT = stagger(progress, 0.3, 0.5);
  ctx.globalAlpha = easeOutCubic(infoT);
  const infoY = height * 0.6;

  // 商品名（最多 2 行，超出截断）— 换行绘制避免溢出画布
  setFont(ctx, { size: width * 0.062, weight: 800 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const nameLines = wrapText(ctx, props.productName, width - padding * 2).slice(0, 2);
  let cursorY = infoY;
  for (const line of nameLines) {
    ctx.fillText(line, padding, cursorY);
    cursorY += width * 0.085;
  }

  if (props.description) {
    setFont(ctx, { size: width * 0.034, weight: 400 });
    ctx.fillStyle = th.textBody;
    const descLines = wrapText(ctx, props.description, width - padding * 2).slice(0, 3);
    cursorY += width * 0.015;
    for (const line of descLines) {
      ctx.fillText(line, padding, cursorY);
      cursorY += width * 0.052;
    }
  }

  cursorY += width * 0.03;

  // Price
  setFont(ctx, { size: width * 0.085, weight: 800 });
  ctx.fillStyle = th.primaryLight;
  ctx.fillText(props.price, padding, cursorY);

  if (props.originalPrice) {
    const priceW = ctx.measureText(props.price).width;
    setFont(ctx, { size: width * 0.045, weight: 400 });
    ctx.fillStyle = th.textMuted;
    const opX = padding + priceW + width * 0.04;
    const opY = cursorY + width * 0.04;
    ctx.fillText(props.originalPrice, opX, opY);
    // strikethrough
    const opW = ctx.measureText(props.originalPrice).width;
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(opX, opY + width * 0.025);
    ctx.lineTo(opX + opW, opY + width * 0.025);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 6. CTAScene                                                         */
/* ------------------------------------------------------------------ */

export interface CTASceneProps {
  ctaText: string;
  brandName: string;
  subtitle?: string;
  theme?: SceneTheme;
}

export function CTAScene({ ctaText, brandName, subtitle, theme }: CTASceneProps) {
  const th = resolveSceneTheme(theme);
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(to bottom right, ${th.primaryLight}, ${th.primaryDark})`,
      }}
    >
      <AnimationStyles />

      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
      <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-white/10" />

      <h1
        className="relative z-10 px-8 text-center text-5xl font-bold text-white"
        style={{ animation: 'vs-pulse 2s ease-in-out infinite' }}
      >
        {ctaText}
      </h1>

      {subtitle && (
        <p
          className="relative z-10 mt-6 px-8 text-center text-xl text-white/80"
          style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
        >
          {subtitle}
        </p>
      )}

      <div
        className="absolute bottom-12 z-10"
        style={{ animation: 'vs-fade-in 0.8s ease-out 0.6s both' }}
      >
        <p className="text-sm uppercase tracking-widest text-white/60">
          {brandName}
        </p>
      </div>
    </div>
  );
}

export function drawCTA(dc: DrawContext, props: CTASceneProps) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  // Background: primary gradient
  fillGradient(ctx, width, height, [
    { offset: 0, color: th.primaryLight },
    { offset: 1, color: th.primaryDark },
  ], 'diagonal');

  // Decorative circles
  ctx.fillStyle = withAlpha('#ffffff', 0.08);
  ctx.beginPath();
  ctx.arc(width * 1.1, height * -0.1, width * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * -0.1, height * 1.1, width * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // CTA text — pulse (scale oscillation)
  const pulseT = stagger(progress, 0, 0.4);
  const pulse = 1 + 0.04 * Math.sin(progress * Math.PI * 4) * easeOutCubic(pulseT);
  ctx.save();
  ctx.translate(width / 2, height * 0.45);
  ctx.scale(pulse, pulse);
  setFont(ctx, { size: width * 0.1, weight: 900 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCenteredBlock(
    ctx,
    props.ctaText,
    0,
    0,
    width * 0.84,
    width * 0.14,
  );
  ctx.restore();

  // Subtitle — fade-in-up
  if (props.subtitle) {
    const subT = stagger(progress, 0.3, 0.5);
    ctx.globalAlpha = easeOutCubic(subT) * 0.85;
    setFont(ctx, { size: width * 0.05, weight: 500 });
    ctx.fillStyle = '#ffffff';
    drawCenteredBlock(
      ctx,
      props.subtitle,
      width / 2,
      height * 0.62,
      width * 0.84,
      width * 0.07,
    );
    ctx.globalAlpha = 1;
  }

  // Brand name footer — fade in
  const footT = stagger(progress, 0.6, 0.4);
  ctx.globalAlpha = easeOutCubic(footT) * 0.7;
  setFont(ctx, { size: width * 0.034, weight: 600 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // letter-spacing simulation: spaces between chars
  const brandUpper = props.brandName.toUpperCase();
  const spaced = brandUpper.split('').join(' ');
  ctx.fillText(spaced, width / 2, height * 0.9);
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 7. DataChartScene                                                   */
/* ------------------------------------------------------------------ */

export interface DataChartSceneProps {
  title: string;
  data: Array<{ label: string; value: number; color?: string }>;
  unit?: string;
  theme?: SceneTheme;
}

export function DataChartScene({ title, data, unit, theme }: DataChartSceneProps) {
  const th = resolveSceneTheme(theme);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden p-8"
      style={{ backgroundColor: th.bgDark }}
    >
      <AnimationStyles />

      <div
        className="absolute right-0 top-0 h-1/2 w-1/2 rounded-bl-full"
        style={{ backgroundColor: withAlphaCss(th.primary, 0.05) }}
      />

      <h2
        className="relative z-10 mt-12 mb-12 text-center text-3xl font-bold text-white"
        style={{ animation: 'vs-fade-in-down 0.8s ease-out both' }}
      >
        {title}
      </h2>

      <div className="relative z-10 flex flex-1 items-end justify-center gap-4 pb-16">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="flex max-w-[120px] flex-1 flex-col items-center gap-2"
          >
            <span
              className="text-2xl font-bold text-white"
              style={{
                animation: `vs-fade-in-up 0.5s ease-out ${0.3 + idx * 0.15}s both`,
              }}
            >
              {item.value}
              {unit}
            </span>
            <div
              className="w-full rounded-t-lg"
              style={{
                height: `${(item.value / maxValue) * 100}%`,
                minHeight: '20px',
                backgroundColor: item.color ?? th.primary,
                transformOrigin: 'bottom',
                animation: `vs-grow-up 0.8s ease-out ${0.3 + idx * 0.15}s both`,
              }}
            />
            <span
              className="text-center text-sm"
              style={{
                color: th.textMuted,
                animation: `vs-fade-in-up 0.5s ease-out ${0.5 + idx * 0.15}s both`,
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function drawDataChart(dc: DrawContext, props: DataChartSceneProps) {
  const { ctx, progress, width, height } = dc;
  const th = resolveSceneTheme(props.theme);

  fillSolid(ctx, width, height, th.bgDark);

  // Decorative quarter circle (top-right)
  ctx.fillStyle = withAlpha(th.primary, 0.06);
  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.arc(width, 0, width * 0.5, Math.PI * 0.5, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  const padding = width * 0.08;

  // Title — fade-in-down over 0 → 0.5
  const titleT = stagger(progress, 0, 0.5);
  ctx.globalAlpha = easeOutCubic(titleT);
  setFont(ctx, { size: width * 0.06, weight: 800 });
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  drawCenteredBlock(
    ctx,
    props.title,
    width / 2,
    height * 0.14,
    width - padding * 2,
    width * 0.08,
  );
  ctx.globalAlpha = 1;

  // Chart area
  const chartTop = height * 0.32;
  const chartBottom = height * 0.82;
  const chartH = chartBottom - chartTop;
  const maxValue = Math.max(...props.data.map((d) => d.value), 1);
  const barW = (width - padding * 2) / props.data.length * 0.6;
  const gapW = (width - padding * 2) / props.data.length * 0.4;
  const slotW = barW + gapW;

  props.data.forEach((item, idx) => {
    const cx = padding + slotW * idx + slotW / 2;
    const fullBarH = (item.value / maxValue) * chartH;
    const barT = stagger(progress, 0.3 + idx * 0.1, 0.5);
    const barH = fullBarH * easeOutCubic(barT);
    const barX = cx - barW / 2;
    const barY = chartBottom - barH;

    // value (top)
    const valT = stagger(progress, 0.3 + idx * 0.1, 0.4);
    ctx.globalAlpha = easeOutCubic(valT);
    setFont(ctx, { size: width * 0.05, weight: 800 });
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${item.value}${props.unit ?? ''}`, cx, barY - width * 0.02);
    ctx.globalAlpha = 1;

    // bar
    ctx.fillStyle = item.color ?? th.primaryLight;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, Math.max(barH, 4), [width * 0.02, width * 0.02, 0, 0]);
    ctx.fill();

    // label (bottom)
    const labT = stagger(progress, 0.5 + idx * 0.1, 0.4);
    ctx.globalAlpha = easeOutCubic(labT);
    setFont(ctx, { size: width * 0.032, weight: 500 });
    ctx.fillStyle = th.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(item.label, cx, chartBottom + width * 0.03);
    ctx.globalAlpha = 1;
  });
}
