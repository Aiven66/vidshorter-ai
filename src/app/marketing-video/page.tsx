'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/lib/credits-context';
import {
  TemplateRenderer,
  UrlExtractor,
  BrandIntroScene,
  ProductShowcaseScene,
  KeyPointScene,
  CTAScene,
  drawBrandIntro,
  drawProductShowcase,
  drawKeyPoint,
  drawCTA,
  preloadImage,
  type Scene,
} from '@/components/video-templates';
import { useLocale } from '@/lib/locale-context';
import {
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Home,
  Cpu,
  ChevronDown,
  ChevronUp,
  Wand2,
  Trash2,
  Star,
  Link as LinkIcon,
} from 'lucide-react';

type TemplateId = 'fashion' | 'beauty' | 'food' | 'home' | 'tech';

interface TemplateOption {
  id: TemplateId;
  nameKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TEMPLATES: TemplateOption[] = [
  { id: 'fashion', nameKey: 'marketing.templateFashion', icon: ShoppingBag },
  { id: 'beauty', nameKey: 'marketing.templateBeauty', icon: Sparkles },
  { id: 'food', nameKey: 'marketing.templateFood', icon: UtensilsCrossed },
  { id: 'home', nameKey: 'marketing.templateHome', icon: Home },
  { id: 'tech', nameKey: 'marketing.templateTech', icon: Cpu },
];

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
    /** 组合好的展示价格，如 "$21.99" / "¥134.21" */
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

/** 精简过长的商品名（Amazon 标题常带 200+ 字符的规格后缀），用于视频画面展示 */
function shortProductName(name: string): string {
  const firstSegment = name.split(/\s+[-–|]\s+/)[0].trim();
  const base = firstSegment.length >= 12 ? firstSegment : name.trim();
  return base.length > 90 ? base.slice(0, 90).replace(/\s+\S*$/, '') + '…' : base;
}

export default function MarketingVideoPage() {
  const { t, locale } = useLocale();
  const { deductCredits } = useCredits();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('fashion');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [promoText, setPromoText] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [highlights, setHighlights] = useState<ProductHighlight[]>([]);
  const [rating, setRating] = useState('');
  const [reviewCount, setReviewCount] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extractKey, setExtractKey] = useState(0);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

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
        // 优先使用后端组合好的展示价格（"$21.99"/"¥134.21"），否则前端拼接
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
        if (p.description) setPromoText(p.description);
        if (p.brand) setBrandName(p.brand);
        if (p.image) {
          setProductImage(p.image);
          // 提前预载商品主图（CORS 模式），导出视频时 canvas 可直接绘制
          void preloadImage(p.image);
        }
        setHighlights(Array.isArray(p.highlights) ? p.highlights : []);
        if (p.rating) setRating(p.rating);
        if (p.reviewCount) setReviewCount(p.reviewCount);
        if (!ctaText) setCtaText(t('marketing.ctaTextPlaceholder'));
        setAutoDetected(true);
        setPreviewReady(true);
        setExtractKey((k) => k + 1);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [t, ctaText, locale],
  );

  const updateHighlight = (idx: number, field: keyof ProductHighlight, value: string) => {
    setHighlights((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  const removeHighlight = (idx: number) => {
    setHighlights((prev) => prev.filter((_, i) => i !== idx));
  };

  const scenes: Scene[] = useMemo(
    () => {
      const introBrand = brandName || tr('marketing.brandName', 'Brand');
      const pName = shortProductName(productName || tr('marketing.productName', 'Product'));
      const ctaBrand = brandName || tr('marketing.brandName', 'Brand');
      const ctaLabel = ctaText || tr('marketing.ctaText', 'Shop Now');

      // 1. 品牌开场
      const sceneList: Scene[] = [
        {
          id: 'intro',
          duration: 3,
          transition: 'fade',
          render: () => <BrandIntroScene brandName={introBrand} tagline="Product Pick" />,
          draw: (dc) => drawBrandIntro(dc, { brandName: introBrand, tagline: 'Product Pick' }),
        },
        // 2. 商品展示（名称 + 价格 + 主图）
        {
          id: 'product',
          duration: 4,
          transition: 'fade',
          render: () => (
            <ProductShowcaseScene
              productName={pName}
              price={productPrice}
              originalPrice={originalPrice || undefined}
              description={promoText}
              imageUrl={productImage}
            />
          ),
          draw: (dc) =>
            drawProductShowcase(dc, {
              productName: pName,
              price: productPrice || '',
              originalPrice: originalPrice || undefined,
              description: promoText,
              imageUrl: productImage,
            }),
          // 导出前确保商品主图已预载（CORS 模式），canvas 才能绘制真实商品图
          prepare: productImage ? () => preloadImage(productImage).then(() => undefined) : undefined,
        },
      ];

      // 3. 卖点逐条展示（种草视频核心内容）
      highlights.forEach((h, i) => {
        sceneList.push({
          id: `highlight-${i}`,
          duration: 4,
          transition: 'slide',
          render: () => <KeyPointScene number={i + 1} title={h.title} content={h.detail} />,
          draw: (dc) => drawKeyPoint(dc, { number: i + 1, title: h.title, content: h.detail }),
        });
      });

      // 4. 评分背书（社交证明）
      if (rating || reviewCount) {
        const starFull = Math.round(parseFloat(rating || '0'));
        const stars = '★'.repeat(Math.min(5, Math.max(0, starFull))) + '☆'.repeat(Math.min(5, Math.max(0, 5 - starFull)));
        const ratingTitle = rating ? `${stars}  ${rating}/5` : tr('marketing.customerLove', 'Loved by Customers');
        const ratingContent = reviewCount
          ? `${reviewCount} global ratings`
          : tr('marketing.ratingContent', 'Verified customer reviews');
        sceneList.push({
          id: 'rating',
          duration: 3,
          transition: 'fade',
          render: () => <KeyPointScene number={highlights.length + 1} title={ratingTitle} content={ratingContent} />,
          draw: (dc) => drawKeyPoint(dc, { number: highlights.length + 1, title: ratingTitle, content: ratingContent }),
        });
      }

      // 5. CTA 收尾
      sceneList.push({
        id: 'cta',
        duration: 3,
        transition: 'slide',
        render: () => <CTAScene ctaText={ctaLabel} brandName={ctaBrand} />,
        draw: (dc) => drawCTA(dc, { ctaText: ctaLabel, brandName: ctaBrand }),
      });

      return sceneList;
    },
    [brandName, productName, productPrice, originalPrice, promoText, productImage, ctaText, highlights, rating, reviewCount, tr],
  );

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
                <Wand2 className="size-3.5" />
                {tr('marketing.badge', 'Marketing Video')}
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {tr('marketing.title', 'Marketing Video Generator')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                {tr('marketing.subtitle', 'Paste a product link — we extract everything and render a branded short video instantly.')}
              </p>
            </div>

            {/* URL 输入栏 */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              <UrlExtractor
                labels={{
                  urlLabel: t('marketing.urlLabel'),
                  urlPlaceholder: t('marketing.urlPlaceholder'),
                  button: t('marketing.autoFillBtn'),
                  fetching: t('marketing.fetching'),
                  failedHint: t('marketing.fetchFailed'),
                }}
                onExtract={handleExtractFromUrl}
              />

              {autoDetected && (
                <div className="mt-3 flex items-center gap-2 text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('marketing.smartDetected')}
                </div>
              )}

              {/* 模板选择 - 内嵌于URL栏下方 */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t('marketing.templateRowLabel')}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {TEMPLATES.map((tpl) => {
                    const Icon = tpl.icon;
                    const selected = selectedTemplate === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="truncate">{tr(tpl.nameKey, tpl.id)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 高级选项 - 折叠 */}
              <div className="mt-4 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <span>{t('marketing.advancedOptions')}</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showAdvanced && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="productName">{t('marketing.productName')}</Label>
                      <Input
                        id="productName"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder={t('marketing.productNamePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="productPrice">{t('marketing.productPrice')}</Label>
                      <Input
                        id="productPrice"
                        value={productPrice}
                        onChange={(e) => setProductPrice(e.target.value)}
                        placeholder={t('marketing.productPricePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="promoText">{t('marketing.promoText')}</Label>
                      <Textarea
                        id="promoText"
                        value={promoText}
                        onChange={(e) => setPromoText(e.target.value)}
                        placeholder={t('marketing.promoTextPlaceholder')}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="brandName">{t('marketing.brandName')}</Label>
                      <Input
                        id="brandName"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder={t('marketing.brandNamePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="productImage">{t('marketing.productImage')}</Label>
                      <Input
                        id="productImage"
                        value={productImage}
                        onChange={(e) => setProductImage(e.target.value)}
                        placeholder={t('marketing.productImagePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="ctaText">{t('marketing.ctaText')}</Label>
                      <Input
                        id="ctaText"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                        placeholder={t('marketing.ctaTextPlaceholder')}
                      />
                    </div>

                    {highlights.length > 0 && (
                      <div className="space-y-2 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            {tr('marketing.highlights', 'Product Highlights')}
                          </Label>
                          <span className="text-xs text-muted-foreground">{highlights.length} scenes</span>
                        </div>
                        <div className="space-y-2">
                          {highlights.map((h, i) => (
                            <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {i + 1}
                                </span>
                                <Input
                                  value={h.title}
                                  onChange={(e) => updateHighlight(i, 'title', e.target.value)}
                                  placeholder="Highlight title"
                                  className="h-8"
                                />
                                <Button variant="ghost" size="icon-sm" onClick={() => removeHighlight(i)} aria-label="Remove highlight">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <Textarea
                                value={h.detail}
                                onChange={(e) => updateHighlight(i, 'detail', e.target.value)}
                                placeholder="Highlight detail"
                                className="min-h-[56px] resize-y text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(rating || reviewCount) && (
                      <div className="grid gap-4 md:grid-cols-2 md:col-span-2">
                        <div className="space-y-2">
                          <Label htmlFor="rating" className="flex items-center gap-1.5">
                            <Star className="h-3.5 w-3.5 text-yellow-500" />
                            {tr('marketing.rating', 'Rating')}
                          </Label>
                          <Input
                            id="rating"
                            value={rating}
                            onChange={(e) => setRating(e.target.value)}
                            placeholder="4.5"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reviewCount">{tr('marketing.reviewCount', 'Review Count')}</Label>
                          <Input
                            id="reviewCount"
                            value={reviewCount}
                            onChange={(e) => setReviewCount(e.target.value)}
                            placeholder="20,324"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* 预览区 */}
            {previewReady && hasAnyContent ? (
              <Card className="p-4 md:p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Wand2 className="h-5 w-5 text-primary" />
                    {t('marketing.preview')}
                  </h2>
                  <p className="text-xs text-muted-foreground">{t('marketing.exportTip')}</p>
                </div>
                <div className="min-h-[500px]">
                  <TemplateRenderer
                    scenes={scenes}
                    resetKey={extractKey}
                    videoTitle={productName || 'Marketing Video'}
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
                  {tr('marketing.urlPlaceholder', 'Paste a product link to start')}
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
