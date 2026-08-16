'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/lib/credits-context';
import {
  TemplateRenderer,
  UrlExtractor,
  DigitalHumanScene,
  drawDigitalHumanScene,
  preloadImage,
  AvatarThumb,
  AVATAR_PRESETS,
  SCENE_THEMES,
  type Scene,
  type SceneTheme,
  type AvatarSpec,
  type AvatarGender,
} from '@/components/video-templates';
import { useLocale } from '@/lib/locale-context';
import {
  Bot,
  Wand2,
  Sparkles,
  Users,
  Link as LinkIcon,
  UserRound,
  User,
} from 'lucide-react';

interface ProductHighlight {
  title: string;
  detail: string;
}

interface ProductApiResponse {
  ok: boolean;
  product?: {
    name: string;
    price?: string;
    originalPrice?: string;
    currency?: string;
    priceDisplay?: string;
    originalPriceDisplay?: string;
    image?: string;
    description?: string;
    brand?: string;
    highlights?: ProductHighlight[];
    rating?: string;
    reviewCount?: string;
  };
  error?: string;
}

/** 精简商品名（视频字幕/卡片用，避免超长） */
function shortProductName(name: string): string {
  const firstSegment = name.split(/\s+[-–|]\s+/)[0].trim();
  const base = firstSegment.length >= 12 ? firstSegment : name.trim();
  return base.length > 60 ? base.slice(0, 60).replace(/\s+\S*$/, '') + '…' : base;
}

export default function DigitalHumanPage() {
  const { t, locale } = useLocale();
  const { deductCredits } = useCredits();
  const [avatar, setAvatar] = useState<AvatarSpec>(AVATAR_PRESETS[0]);
  const [genderFilter, setGenderFilter] = useState<AvatarGender | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<'fashion' | 'beauty' | 'food' | 'home' | 'tech'>('tech');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [highlights, setHighlights] = useState<ProductHighlight[]>([]);
  const [autoDetected, setAutoDetected] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [extractKey, setExtractKey] = useState(0);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

  const isZh = locale === 'zh' || locale === 'zh-Hant' || locale?.startsWith('zh');

  const handleExtractFromUrl = useCallback(
    async (url: string): Promise<{ ok: boolean }> => {
      try {
        const resp = await fetch('/api/extract-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, locale }),
        });
        const data: ProductApiResponse = await resp.json();
        if (!resp.ok || !data.ok || !data.product) {
          return { ok: false };
        }
        const p = data.product;
        if (p.name) setProductName(p.name);
        if (p.priceDisplay) {
          setProductPrice(p.priceDisplay);
        } else if (p.price) {
          const prefix = p.currency && !p.price.startsWith(p.currency) ? p.currency : '';
          setProductPrice(`${prefix}${p.price}`);
        }
        if (p.originalPriceDisplay) {
          setOriginalPrice(p.originalPriceDisplay);
        } else if (p.originalPrice) {
          setOriginalPrice(p.originalPrice);
        }
        if (p.brand) setBrandName(p.brand);
        if (p.image) {
          setProductImage(p.image);
          // 提前预载商品主图（CORS 模式），导出视频时 canvas 可直接绘制
          void preloadImage(p.image);
        }
        setHighlights(Array.isArray(p.highlights) ? p.highlights : []);
        if (!ctaText) setCtaText(tr('digitalHuman.ctaPlaceholder', 'Shop Now'));
        setAutoDetected(true);
        setPreviewReady(true);
        setExtractKey((k) => k + 1);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [t, ctaText, locale, tr],
  );

  const visibleAvatars = useMemo(
    () => (genderFilter === 'all' ? AVATAR_PRESETS : AVATAR_PRESETS.filter((a) => a.gender === genderFilter)),
    [genderFilter],
  );

  const scenes: Scene[] = useMemo(() => {
    const theme: SceneTheme = SCENE_THEMES[selectedTemplate] ?? SCENE_THEMES.tech;
    const pName = shortProductName(productName || tr('digitalHuman.productFallback', 'This amazing product'));
    const brand = brandName || tr('digitalHuman.brandFallback', 'Top Brand');
    const cta = ctaText || tr('digitalHuman.ctaPlaceholder', 'Shop Now');

    // 台词按 locale 生成（种草口播文案）
    const greeting = isZh
      ? `大家好！今天给大家种草 ${brand} 的爆款好物！`
      : `Hi everyone! Today I'm sharing this amazing find from ${brand}!`;
    const priceLine = isZh
      ? `现在下单只要 ${productPrice || '超值价'}，手慢无！`
      : `Now only ${productPrice || 'a great deal'} — don't miss out!`;
    const ctaLine = isZh
      ? `喜欢的宝子点击下方链接，${cta}！`
      : `Love it? Tap the link below and ${cta}!`;

    const baseProps = {
      avatar,
      productName: pName,
      productImage: productImage || undefined,
      theme,
    };

    const sceneList: Scene[] = [
      // 1. 开场问候（挥手）
      {
        id: 'greeting',
        duration: 4,
        transition: 'fade',
        render: () => <DigitalHumanScene {...baseProps} subtitle={greeting} badge={brand} gesture="wave" />,
        draw: (dc) => drawDigitalHumanScene(dc, { ...baseProps, subtitle: greeting, badge: brand, gesture: 'wave' }),
        prepare: productImage ? () => preloadImage(productImage).then(() => undefined) : undefined,
      },
    ];

    // 2. 卖点讲解（指向商品，最多 3 条）
    highlights.slice(0, 3).forEach((h, i) => {
      const line = isZh ? `第${i + 1}个亮点：${h.title}` : `Highlight number ${i + 1}: ${h.title}`;
      const badge = isZh ? `亮点 ${i + 1}` : `Highlight ${i + 1}`;
      sceneList.push({
        id: `feature-${i}`,
        duration: 4,
        transition: 'slide',
        render: () => <DigitalHumanScene {...baseProps} subtitle={line} badge={badge} price={productPrice} gesture="point" />,
        draw: (dc) => drawDigitalHumanScene(dc, { ...baseProps, subtitle: line, badge, price: productPrice, gesture: 'point' }),
        prepare: productImage ? () => preloadImage(productImage).then(() => undefined) : undefined,
      });
    });

    // 3. 价格公布（双手展示）
    sceneList.push({
      id: 'price',
      duration: 4,
      transition: 'fade',
      render: () => (
        <DigitalHumanScene
          {...baseProps}
          subtitle={priceLine}
          badge={isZh ? '限时特惠' : 'Special Price'}
          price={productPrice}
          originalPrice={originalPrice || undefined}
          gesture="present"
        />
      ),
      draw: (dc) =>
        drawDigitalHumanScene(dc, {
          ...baseProps,
          subtitle: priceLine,
          badge: isZh ? '限时特惠' : 'Special Price',
          price: productPrice,
          originalPrice: originalPrice || undefined,
          gesture: 'present',
        }),
      prepare: productImage ? () => preloadImage(productImage).then(() => undefined) : undefined,
    });

    // 4. CTA 收尾（点赞推荐）
    sceneList.push({
      id: 'cta',
      duration: 3,
      transition: 'slide',
      render: () => <DigitalHumanScene {...baseProps} subtitle={ctaLine} badge={cta} price={productPrice} gesture="ok" />,
      draw: (dc) => drawDigitalHumanScene(dc, { ...baseProps, subtitle: ctaLine, badge: cta, price: productPrice, gesture: 'ok' }),
      prepare: productImage ? () => preloadImage(productImage).then(() => undefined) : undefined,
    });

    return sceneList;
  }, [avatar, selectedTemplate, productName, productPrice, originalPrice, brandName, productImage, ctaText, highlights, isZh, tr]);

  /** Deduct 30 credits when a video is successfully exported. */
  const handleExportSuccess = useCallback(() => {
    deductCredits(30);
  }, [deductCredits]);

  const hasAnyContent = productName || productPrice || brandName;

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="mx-auto max-w-6xl">
            {/* Hero */}
            <div className="mb-8 flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Bot className="size-3.5" />
                {tr('digitalHuman.badge', 'AI Avatar Selling')}
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {tr('digitalHuman.title', 'Digital Human Sales Video')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                {tr(
                  'digitalHuman.subtitle',
                  'Pick an AI host, paste a product link, and generate a talking-avatar promo video instantly.',
                )}
              </p>
            </div>

            {/* 主播形象 + 商品链接 */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              {/* 形象选择 */}
              <div className="mb-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    {tr('digitalHuman.chooseAvatar', 'Choose Your Host')}
                  </div>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { key: 'all', label: tr('digitalHuman.all', 'All'), icon: Users },
                        { key: 'female', label: tr('digitalHuman.female', 'Female'), icon: UserRound },
                        { key: 'male', label: tr('digitalHuman.male', 'Male'), icon: User },
                      ] as const
                    ).map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setGenderFilter(key)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          genderFilter === key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {visibleAvatars.map((a) => {
                    const selected = avatar.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAvatar(a)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {/* 头像缩略图（canvas 绘制的形象特写） */}
                        <span
                          className="block rounded-full p-0.5"
                          style={{
                            background: selected
                              ? `linear-gradient(135deg, ${a.outfit}, ${a.outfitAccent})`
                              : 'linear-gradient(135deg, #64748b33, #64748b11)',
                          }}
                        >
                          <AvatarThumb avatar={a} size={56} />
                        </span>
                        <span className="truncate">{a.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {a.flag} {a.countryCode}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 商品链接 */}
              <div className="border-t border-border pt-4">
                <UrlExtractor
                  labels={{
                    urlLabel: tr('digitalHuman.urlLabel', 'Product URL'),
                    urlPlaceholder: tr(
                      'digitalHuman.urlPlaceholder',
                      'Paste a product link (Amazon, Shopify, Taobao, ...)',
                    ),
                    button: tr('digitalHuman.autoFillBtn', 'Auto-Fill from URL'),
                    fetching: tr('digitalHuman.fetching', 'Extracting product info...'),
                    failedHint: tr('digitalHuman.fetchFailed', 'Could not extract product info.'),
                  }}
                  onExtract={handleExtractFromUrl}
                />
                {autoDetected && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    {tr('digitalHuman.smartDetected', 'Smart-detected from URL')}
                  </div>
                )}
              </div>

              {/* 视频风格（主题）选择 */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Wand2 className="h-4 w-4 text-primary" />
                  {tr('digitalHuman.styleLabel', 'Video Style')}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {(['fashion', 'beauty', 'food', 'home', 'tech'] as const).map((id) => {
                    const th = SCENE_THEMES[id];
                    const selected = selectedTemplate === id;
                    const label = tr(`marketing.template${id[0].toUpperCase()}${id.slice(1)}`, id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedTemplate(id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        <span
                          className="h-6 w-6 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${th.primaryLight}, ${th.primaryDark})`,
                          }}
                        />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* 预览区 */}
            {previewReady && hasAnyContent ? (
              <Card className="p-4 md:p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Bot className="h-5 w-5 text-primary" />
                    {tr('digitalHuman.preview', 'Preview')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {tr('digitalHuman.exportTip', 'Rendering uses browser Canvas capture — no upload required.')}
                  </p>
                </div>
                <div className="min-h-[500px]">
                  <TemplateRenderer
                    scenes={scenes}
                    resetKey={extractKey}
                    videoTitle={`${avatar.name} · ${productName || 'Digital Human Video'}`}
                    onExportSuccess={handleExportSuccess}
                  />
                </div>
              </Card>
            ) : (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <LinkIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {tr('digitalHuman.emptyHint', 'Choose a host and paste a product link to start')}
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
