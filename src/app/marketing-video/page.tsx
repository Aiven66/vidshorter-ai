'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  TemplateRenderer,
  UrlExtractor,
  BrandIntroScene,
  ProductShowcaseScene,
  CTAScene,
  drawBrandIntro,
  drawProductShowcase,
  drawCTA,
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

interface ProductApiResponse {
  ok: boolean;
  product?: {
    name: string;
    price?: string;
    currency?: string;
    image?: string;
    description?: string;
    brand?: string;
  };
  error?: string;
}

export default function MarketingVideoPage() {
  const { t } = useLocale();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('fashion');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [promoText, setPromoText] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          body: JSON.stringify({ url }),
        });
        const data: ProductApiResponse = await resp.json();
        if (!resp.ok || !data.ok || !data.product) {
          return { ok: false };
        }
        const p = data.product;
        if (p.name) setProductName(p.name);
        if (p.price) {
          const prefix = p.currency && !p.price.startsWith(p.currency) ? p.currency : '';
          setProductPrice(`${prefix}${p.price}`);
        }
        if (p.description) setPromoText(p.description);
        if (p.brand) setBrandName(p.brand);
        if (p.image) setProductImage(p.image);
        if (!ctaText) setCtaText(t('marketing.ctaTextPlaceholder'));
        setAutoDetected(true);
        setPreviewReady(true);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [t, ctaText],
  );

  const scenes: Scene[] = useMemo(
    () => {
      const introBrand = brandName || tr('marketing.brandName', 'Brand');
      const pName = productName || tr('marketing.productName', 'Product');
      const ctaBrand = brandName || tr('marketing.brandName', 'Brand');
      const ctaLabel = ctaText || tr('marketing.ctaText', 'Shop Now');
      return [
        {
          id: 'intro',
          duration: 2,
          transition: 'fade',
          render: () => <BrandIntroScene brandName={introBrand} />,
          draw: (dc) => drawBrandIntro(dc, { brandName: introBrand }),
        },
        {
          id: 'product',
          duration: 3,
          transition: 'fade',
          render: () => (
            <ProductShowcaseScene
              productName={pName}
              price={productPrice}
              description={promoText}
              imageUrl={productImage}
            />
          ),
          draw: (dc) =>
            drawProductShowcase(dc, {
              productName: pName,
              price: productPrice || '',
              description: promoText,
              imageUrl: productImage,
            }),
        },
        {
          id: 'cta',
          duration: 2,
          transition: 'slide',
          render: () => (
            <CTAScene ctaText={ctaLabel} brandName={ctaBrand} />
          ),
          draw: (dc) => drawCTA(dc, { ctaText: ctaLabel, brandName: ctaBrand }),
        },
      ];
    },
    [brandName, productName, productPrice, promoText, productImage, ctaText, tr],
  );

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
                  <TemplateRenderer scenes={scenes} />
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
