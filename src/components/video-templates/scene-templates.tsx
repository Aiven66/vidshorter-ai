import React from 'react';

/* ------------------------------------------------------------------ */
/* Shared animation keyframes                                          */
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

/* ------------------------------------------------------------------ */
/* 1. BrandIntroScene                                                  */
/* ------------------------------------------------------------------ */

export interface BrandIntroSceneProps {
  brandName: string;
  tagline?: string;
  logoText?: string;
}

export function BrandIntroScene({
  brandName,
  tagline,
  logoText,
}: BrandIntroSceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-background to-primary/10">
      <AnimationStyles />

      {/* Decorative floating orbs */}
      <div
        className="absolute left-1/4 top-1/4 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        style={{ animation: 'vs-float 4s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 h-32 w-32 rounded-full bg-primary/20 blur-2xl"
        style={{ animation: 'vs-float 3s ease-in-out infinite reverse' }}
      />

      {/* Logo block */}
      <div
        className="relative z-10 mb-8"
        style={{ animation: 'vs-scale-in 0.8s ease-out both' }}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground shadow-xl">
          {logoText ?? brandName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Brand name */}
      <h1
        className="relative z-10 px-8 text-center text-4xl font-bold text-foreground"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
      >
        {brandName}
      </h1>

      {/* Tagline */}
      {tagline && (
        <p
          className="relative z-10 mt-4 px-8 text-center text-lg text-muted-foreground"
          style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.6s both' }}
        >
          {tagline}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. ProductShowcaseScene                                             */
/* ------------------------------------------------------------------ */

export interface ProductShowcaseSceneProps {
  productName: string;
  price: string;
  originalPrice?: string;
  description?: string;
  imageUrl?: string;
}

export function ProductShowcaseScene({
  productName,
  price,
  originalPrice,
  description,
  imageUrl,
}: ProductShowcaseSceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <AnimationStyles />

      {/* Gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent" />

      {/* Product image */}
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
          <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/40 to-primary/10">
            <span className="text-6xl">📦</span>
          </div>
        )}
      </div>

      {/* Info section */}
      <div
        className="relative space-y-3 p-8"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
      >
        <h2 className="text-3xl font-bold text-foreground">{productName}</h2>
        {description && (
          <p className="text-base text-muted-foreground">{description}</p>
        )}
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-primary">{price}</span>
          {originalPrice && (
            <span className="text-lg text-muted-foreground line-through">
              {originalPrice}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. CTAScene                                                         */
/* ------------------------------------------------------------------ */

export interface CTASceneProps {
  ctaText: string;
  brandName: string;
  subtitle?: string;
}

export function CTAScene({ ctaText, brandName, subtitle }: CTASceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary to-primary/70">
      <AnimationStyles />

      {/* Decorative shapes */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-foreground/10" />
      <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-primary-foreground/10" />

      {/* CTA text */}
      <h1
        className="relative z-10 px-8 text-center text-5xl font-bold text-primary-foreground"
        style={{ animation: 'vs-pulse 2s ease-in-out infinite' }}
      >
        {ctaText}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p
          className="relative z-10 mt-6 px-8 text-center text-xl text-primary-foreground/80"
          style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.3s both' }}
        >
          {subtitle}
        </p>
      )}

      {/* Brand name footer */}
      <div
        className="absolute bottom-12 z-10"
        style={{ animation: 'vs-fade-in 0.8s ease-out 0.6s both' }}
      >
        <p className="text-sm uppercase tracking-widest text-primary-foreground/60">
          {brandName}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. DataChartScene                                                   */
/* ------------------------------------------------------------------ */

export interface DataChartSceneProps {
  title: string;
  data: Array<{ label: string; value: number; color?: string }>;
  unit?: string;
}

export function DataChartScene({ title, data, unit }: DataChartSceneProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background p-8">
      <AnimationStyles />

      {/* Background decoration */}
      <div className="absolute right-0 top-0 h-1/2 w-1/2 rounded-bl-full bg-primary/5" />

      {/* Title */}
      <h2
        className="relative z-10 mt-12 mb-12 text-center text-3xl font-bold text-foreground"
        style={{ animation: 'vs-fade-in-down 0.8s ease-out both' }}
      >
        {title}
      </h2>

      {/* Chart */}
      <div className="relative z-10 flex flex-1 items-end justify-center gap-4 pb-16">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="flex max-w-[120px] flex-1 flex-col items-center gap-2"
          >
            <span
              className="text-2xl font-bold text-foreground"
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
                backgroundColor: item.color ?? 'var(--primary)',
                transformOrigin: 'bottom',
                animation: `vs-grow-up 0.8s ease-out ${0.3 + idx * 0.15}s both`,
              }}
            />
            <span
              className="text-center text-sm text-muted-foreground"
              style={{
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

/* ------------------------------------------------------------------ */
/* 5. NewsHeadlineScene                                                */
/* ------------------------------------------------------------------ */

export interface NewsHeadlineSceneProps {
  headline: string;
  source: string;
  date?: string;
  category?: string;
}

export function NewsHeadlineScene({
  headline,
  source,
  date,
  category,
}: NewsHeadlineSceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-gradient-to-b from-background to-muted p-8">
      <AnimationStyles />

      {/* Top accent bar */}
      <div
        className="absolute left-0 top-0 h-2 bg-primary"
        style={{
          width: '100%',
          transformOrigin: 'left',
          animation: 'vs-grow-width 0.6s ease-out both',
        }}
      />

      {/* Category badge */}
      {category && (
        <div
          className="relative z-10 mb-6"
          style={{ animation: 'vs-fade-in-up 0.6s ease-out both' }}
        >
          <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary-foreground">
            {category}
          </span>
        </div>
      )}

      {/* Headline */}
      <h1
        className="relative z-10 text-4xl font-bold leading-tight text-foreground"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {headline}
      </h1>

      {/* Source */}
      <div
        className="relative z-10 mt-8 flex items-center gap-3"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.5s both' }}
      >
        <div className="h-8 w-1 rounded-full bg-primary" />
        <div>
          <p className="text-base font-medium text-foreground">{source}</p>
          {date && <p className="text-sm text-muted-foreground">{date}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. KeyPointScene                                                    */
/* ------------------------------------------------------------------ */

export interface KeyPointSceneProps {
  number: number | string;
  title: string;
  content: string;
}

export function KeyPointScene({ number, title, content }: KeyPointSceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-background p-8">
      <AnimationStyles />

      {/* Oversized background number */}
      <span className="absolute right-4 top-8 select-none text-[200px] font-bold leading-none text-primary/5">
        {number}
      </span>

      {/* Number badge */}
      <div
        className="relative z-10 mb-8"
        style={{ animation: 'vs-scale-in 0.6s ease-out both' }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-4xl font-bold text-primary-foreground">
          {number}
        </div>
      </div>

      {/* Title */}
      <h2
        className="relative z-10 mb-4 text-3xl font-bold text-foreground"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {title}
      </h2>

      {/* Content */}
      <p
        className="relative z-10 text-lg leading-relaxed text-muted-foreground"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.4s both' }}
      >
        {content}
      </p>

      {/* Bottom accent line */}
      <div className="absolute bottom-8 left-8 right-8 h-1 overflow-hidden rounded-full bg-primary/20">
        <div
          className="h-full rounded-full bg-primary"
          style={{
            transformOrigin: 'left',
            animation: 'vs-grow-width 1s ease-out 0.6s both',
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. QuoteScene                                                       */
/* ------------------------------------------------------------------ */

export interface QuoteSceneProps {
  quote: string;
  author?: string;
  role?: string;
}

export function QuoteScene({ quote, author, role }: QuoteSceneProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-background p-10">
      <AnimationStyles />

      {/* Decorative quotation marks */}
      <span
        className="absolute left-6 top-8 select-none font-serif text-[180px] leading-none text-primary/20"
        style={{ animation: 'vs-fade-in 1s ease-out both' }}
      >
        &ldquo;
      </span>
      <span
        className="absolute bottom-8 right-6 rotate-180 select-none font-serif text-[180px] leading-none text-primary/20"
        style={{ animation: 'vs-fade-in 1s ease-out 0.3s both' }}
      >
        &ldquo;
      </span>

      {/* Quote text */}
      <p
        className="relative z-10 text-center text-3xl font-bold leading-snug text-foreground"
        style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.2s both' }}
      >
        {quote}
      </p>

      {/* Author */}
      {author && (
        <div
          className="relative z-10 mt-8 flex flex-col items-center gap-1"
          style={{ animation: 'vs-fade-in-up 0.8s ease-out 0.5s both' }}
        >
          <div className="mb-2 h-0.5 w-12 rounded-full bg-primary" />
          <p className="text-lg font-semibold text-foreground">{author}</p>
          {role && <p className="text-sm text-muted-foreground">{role}</p>}
        </div>
      )}
    </div>
  );
}
