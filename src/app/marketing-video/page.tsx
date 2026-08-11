'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TemplateRenderer } from '@/components/video-templates';
import {
  BrandIntroScene,
  ProductShowcaseScene,
  CTAScene,
} from '@/components/video-templates';
import type { Scene } from '@/components/video-templates';
import { useLocale } from '@/lib/locale-context';
import {
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Home,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Download,
  Wand2,
} from 'lucide-react';

type TemplateId = 'fashion' | 'beauty' | 'food' | 'home' | 'tech';

interface TemplateOption {
  id: TemplateId;
  nameKey: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

const TEMPLATES: TemplateOption[] = [
  { id: 'fashion', nameKey: 'marketing.templateFashion', icon: ShoppingBag, gradient: 'from-primary/30 to-primary/5' },
  { id: 'beauty', nameKey: 'marketing.templateBeauty', icon: Sparkles, gradient: 'from-primary/25 to-primary/10' },
  { id: 'food', nameKey: 'marketing.templateFood', icon: UtensilsCrossed, gradient: 'from-primary/20 to-primary/8' },
  { id: 'home', nameKey: 'marketing.templateHome', icon: Home, gradient: 'from-primary/30 to-primary/15' },
  { id: 'tech', nameKey: 'marketing.templateTech', icon: Cpu, gradient: 'from-primary/15 to-primary/5' },
];

const TOTAL_STEPS = 3;

export default function MarketingVideoPage() {
  const { t } = useLocale();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [promoText, setPromoText] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [ctaText, setCtaText] = useState('');

  // Translation helper with fallback when key is missing (t returns the key).
  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

  const scenes: Scene[] = useMemo(
    () => [
      {
        id: 'intro',
        duration: 2,
        transition: 'fade',
        render: () => (
          <BrandIntroScene brandName={brandName || tr('marketing.brandName', 'Brand')} />
        ),
      },
      {
        id: 'product',
        duration: 3,
        transition: 'fade',
        render: () => (
          <ProductShowcaseScene
            productName={productName || tr('marketing.productName', 'Product')}
            price={productPrice}
            description={promoText}
            imageUrl={productImage}
          />
        ),
      },
      {
        id: 'cta',
        duration: 2,
        transition: 'slide',
        render: () => (
          <CTAScene
            ctaText={ctaText || tr('marketing.ctaText', 'Shop Now')}
            brandName={brandName || tr('marketing.brandName', 'Brand')}
          />
        ),
      },
    ],
    [brandName, productName, productPrice, promoText, productImage, ctaText, tr],
  );

  const canProceed = useCallback(() => {
    if (step === 1) return selectedTemplate !== null;
    return true;
  }, [step, selectedTemplate]);

  const handleNext = useCallback(() => {
    setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  }, []);

  const handlePrev = useCallback(() => {
    setStep((prev) => Math.max(1, prev - 1));
  }, []);

  const steps = [
    { num: 1, label: tr('marketing.step1', 'Choose Template') },
    { num: 2, label: tr('marketing.step2', 'Product Info') },
    { num: 3, label: tr('marketing.step3', 'Preview & Export') },
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30">
        <div className="container mx-auto px-4 py-10 md:py-16">
          <div className="mx-auto max-w-5xl">
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
                {tr(
                  'marketing.subtitle',
                  'Batch-generate branded short videos for e-commerce, local businesses, and multi-account matrices.',
                )}
              </p>
            </div>

            {/* Step indicator */}
            <div className="mb-8 flex items-center justify-center gap-2 md:gap-4">
              {steps.map((s, idx) => (
                <div key={s.num} className="flex items-center gap-2 md:gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                        step === s.num
                          ? 'border-primary bg-primary text-primary-foreground'
                          : step > s.num
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {s.num}
                    </div>
                    <span
                      className={`hidden text-sm font-medium md:inline ${
                        step === s.num ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`h-px w-8 md:w-12 ${step > s.num ? 'bg-primary' : 'bg-border'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <div className="rounded-xl border border-border bg-card p-4 md:p-6">
              {/* Step 1: Templates */}
              {step === 1 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                  {TEMPLATES.map((tpl) => {
                    const Icon = tpl.icon;
                    const selected = selectedTemplate === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border p-6 transition-all hover:shadow-md ${
                          selected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${tpl.gradient} opacity-60 transition-opacity group-hover:opacity-100`}
                        />
                        <div className="relative z-10 flex flex-col items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 text-primary shadow-sm backdrop-blur">
                            <Icon className="size-7" />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {tr(tpl.nameKey, tpl.id)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Step 2: Product info form */}
              {step === 2 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="productName">
                      {tr('marketing.productName', 'Product Name')}
                    </Label>
                    <Input
                      id="productName"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder={tr('marketing.productNamePlaceholder', 'e.g., Premium Cotton T-Shirt')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="productPrice">
                      {tr('marketing.productPrice', 'Price')}
                    </Label>
                    <Input
                      id="productPrice"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      placeholder={tr('marketing.productPricePlaceholder', 'e.g., ¥99')}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="promoText">
                      {tr('marketing.promoText', 'Promo Copy')}
                    </Label>
                    <Textarea
                      id="promoText"
                      value={promoText}
                      onChange={(e) => setPromoText(e.target.value)}
                      placeholder={tr('marketing.promoTextPlaceholder', 'e.g., Limited time offer - 30% off today only!')}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brandName">
                      {tr('marketing.brandName', 'Brand Name')}
                    </Label>
                    <Input
                      id="brandName"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder={tr('marketing.brandNamePlaceholder', 'e.g., YourBrand')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="productImage">
                      {tr('marketing.productImage', 'Product Image URL')}
                    </Label>
                    <Input
                      id="productImage"
                      value={productImage}
                      onChange={(e) => setProductImage(e.target.value)}
                      placeholder={tr('marketing.productImagePlaceholder', 'https://...')}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="ctaText">
                      {tr('marketing.ctaText', 'Call to Action')}
                    </Label>
                    <Input
                      id="ctaText"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder={tr('marketing.ctaTextPlaceholder', 'e.g., Shop Now')}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Preview & Export */}
              {step === 3 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {tr('marketing.preview', 'Preview')}
                    </h3>
                    <div className="min-h-[500px]">
                      <TemplateRenderer scenes={scenes} />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      {tr('marketing.export', 'Export Video')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'marketing.exportTip',
                        'Rendering uses browser Canvas capture — no upload required.',
                      )}
                    </p>
                    <Button className="w-full" size="lg">
                      <Download className="size-4" />
                      {tr('marketing.export', 'Export Video')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Nav buttons */}
            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={handlePrev} disabled={step === 1}>
                <ChevronLeft className="size-4" />
                {tr('common.back', 'Back')}
              </Button>
              {step < TOTAL_STEPS ? (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {tr('common.next', 'Next')}
                  <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button disabled>
                  {tr('marketing.generate', 'Generate Video')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
