'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useCredits } from '@/lib/credits-context';
import {
  UrlExtractor,
  preloadImage,
  SCENE_THEMES,
} from '@/components/video-templates';
import {
  TalkingVideoRenderer,
  PHOTO_AVATARS,
  pickEdgeVoice,
  computeEnvelope,
  type PhotoAvatarSpec,
  type PhotoAvatarGender,
  type TalkingSceneData,
} from '@/components/video-templates/talking-avatar';
import { SocialShare } from '@/components/video-templates/social-share';
import { useLocale } from '@/lib/locale-context';
import {
  Bot,
  Wand2,
  Sparkles,
  Users,
  Link as LinkIcon,
  UserRound,
  User,
  Mic,
  RefreshCw,
  Loader2,
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

const TAIL_SECONDS = 0.25;
const FPS = 30;

export default function DigitalHumanPage() {
  const { t, locale } = useLocale();
  const { deductCredits } = useCredits();
  /** 视频形式：showcase = 商品种草（默认，无数字人）；avatar = 主播口播 */
  const [videoMode, setVideoMode] = useState<'showcase' | 'avatar'>('showcase');
  const [avatar, setAvatar] = useState<PhotoAvatarSpec>(PHOTO_AVATARS[0]);
  const [genderFilter, setGenderFilter] = useState<PhotoAvatarGender | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<'fashion' | 'beauty' | 'food' | 'home' | 'tech'>('tech');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productImage, setProductImage] = useState('');
  const [rating, setRating] = useState('');
  const [reviewCount, setReviewCount] = useState('');
  const [highlights, setHighlights] = useState<ProductHighlight[]>([]);
  const [autoDetected, setAutoDetected] = useState(false);

  // 语音/场景生成状态
  const [scenes, setScenes] = useState<TalkingSceneData[]>([]);
  const [scenesKey, setScenesKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [genError, setGenError] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [staleVoice, setStaleVoice] = useState(false);
  const [exportedUrl, setExportedUrl] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const genTokenRef = useRef(0);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const val = t(key);
      return val === key ? fallback : val;
    },
    [t],
  );

  const isZh = locale === 'zh' || locale === 'zh-Hant' || locale?.startsWith('zh');

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }, []);

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
        if (p.rating) setRating(p.rating);
        if (p.reviewCount) setReviewCount(p.reviewCount);
        if (p.image) {
          setProductImage(p.image);
          // 提前预载商品主图（CORS 模式），导出视频时 canvas 可直接绘制
          void preloadImage(p.image);
        }
        setHighlights(Array.isArray(p.highlights) ? p.highlights : []);
        setAutoDetected(true);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [locale],
  );

  const visibleAvatars = useMemo(
    () => (genderFilter === 'all' ? PHOTO_AVATARS : PHOTO_AVATARS.filter((a) => a.gender === genderFilter)),
    [genderFilter],
  );

  /** 台词（口播文案，语言跟随 UI locale） */
  const buildLines = useCallback(() => {
    const pName = shortProductName(productName || tr('digitalHuman.productFallback', 'This amazing product'));
    const brand = brandName || tr('digitalHuman.brandFallback', 'Top Brand');
    const price = productPrice || tr('digitalHuman.priceFallback', 'a great price');

    const greeting = isZh
      ? videoMode === 'avatar'
        ? `大家好！今天给大家种草 ${brand} 的爆款好物，${pName}！`
        : `别划走！${brand} 这款 ${pName}，用过就回不去了！`
      : videoMode === 'avatar'
        ? `Hi everyone! Today I'm sharing an amazing find from ${brand} — the ${pName}!`
        : `Stop scrolling! This ${pName} from ${brand} is a total game-changer!`;

    const hl = highlights.slice(0, 3).map((h, i) => {
      const spoken = [h.title, h.detail].filter(Boolean).join('. ').slice(0, 180);
      return {
        kind: 'highlight' as const,
        subtitle: isZh ? `第${i + 1}个亮点：${spoken}` : `Highlight number ${i + 1}: ${spoken}`,
        label: isZh ? `亮点 ${i + 1}` : `Highlight ${i + 1}`,
        highlight: { title: h.title, detail: h.detail },
      };
    });

    const priceLine = originalPrice
      ? isZh
        ? `现在下单只要 ${price}，原价 ${originalPrice}，限时特惠，手慢无！`
        : `Order now for just ${price}, down from ${originalPrice} — limited time offer!`
      : isZh
        ? `现在下单只要 ${price}，手慢无！`
        : `Now only ${price} — don't miss out!`;

    const ctaLine = isZh
      ? '喜欢的宝子点击下方链接，马上把它带回家！'
      : 'Love it? Tap the link below and grab yours now!';

    return [
      { kind: 'greeting' as const, subtitle: greeting, label: isZh ? '爆款好物' : 'Hot Pick' },
      ...hl,
      {
        kind: 'price' as const,
        subtitle: priceLine,
        label: isZh ? '限时特惠' : 'Special Price',
        price: { display: price, original: originalPrice || undefined },
      },
      { kind: 'cta' as const, subtitle: ctaLine, label: isZh ? '立即下单' : 'Shop Now' },
    ];
  }, [productName, brandName, productPrice, originalPrice, highlights, isZh, tr, videoMode]);

  /** 生成场景：逐条合成真人语音 → 解码 → 振幅包络 */
  const generateScenes = useCallback(async () => {
    if (!productName && !productPrice && !brandName) return;
    const token = ++genTokenRef.current;
    setGenerating(true);
    setGenError('');
    setExportedUrl('');
    const lines = buildLines();
    setGenProgress({ done: 0, total: lines.length });

    try {
      // 给旧生成循环 250ms 退出窗口，避免并发 TTS 请求（会触发服务端限流）
      await new Promise((r) => setTimeout(r, 250));
      if (genTokenRef.current !== token) return;
      const voice = pickEdgeVoice(
        videoMode === 'avatar' ? avatar.gender : 'female',
        locale || 'en',
        videoMode === 'avatar' ? avatar.voiceLocale : undefined,
      );
      setVoiceName(voice);
      const audioCtx = getAudioCtx();

      const out: TalkingSceneData[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (genTokenRef.current !== token) return;
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: lines[i].subtitle, voice }),
        });
        if (!resp.ok) throw new Error(`TTS failed (${resp.status})`);
        const mp3Buf = await resp.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(mp3Buf);
        const envelope = computeEnvelope(audioBuffer, FPS);
        out.push({
          ...lines[i],
          id: `${lines[i].kind}-${i}-${Date.now()}`,
          audioBuffer,
          envelope,
          duration: audioBuffer.duration + TAIL_SECONDS,
        });
        setGenProgress({ done: i + 1, total: lines.length });
      }
      if (genTokenRef.current !== token) return;
      setScenes(out);
      setScenesKey((k) => k + 1);
      setStaleVoice(false);
    } catch (err) {
      console.error('[digital-human] generate failed:', err);
      if (genTokenRef.current === token) {
        setGenError(tr('digitalHuman.ttsFailed', 'Voice synthesis failed. Please try again.'));
      }
    } finally {
      if (genTokenRef.current === token) setGenerating(false);
    }
  }, [productName, productPrice, brandName, avatar, videoMode, locale, buildLines, getAudioCtx, tr]);

  // 提取成功后自动生成语音场景（商品指纹变化时仅触发一次，防抖避免并发请求）
  const lastAutoKeyRef = useRef('');
  useEffect(() => {
    if (!autoDetected || (!productName && !productPrice)) return;
    const key = `${productName}|${productPrice}`;
    if (lastAutoKeyRef.current === key) return;
    lastAutoKeyRef.current = key;
    const t = setTimeout(() => void generateScenes(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetected, productName, productPrice]);

  // 切换形象后（声线性别/口音变化）提示重新生成；切换视频形式同理
  useEffect(() => {
    if (scenes.length > 0) setStaleVoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar.id, videoMode]);

  /** Deduct 30 credits when a video is successfully exported. */
  const handleExported = useCallback(() => {
    deductCredits(30);
  }, [deductCredits]);

  const hasAnyContent = productName || productPrice || brandName;
  const productInfo = useMemo(
    () => ({
      name: shortProductName(productName || tr('digitalHuman.productFallback', 'This amazing product')),
      image: productImage || null,
      priceDisplay: productPrice || null,
      originalPrice: originalPrice || null,
      rating: rating || null,
      reviewCount: reviewCount || null,
      brand: brandName || null,
    }),
    [productName, productImage, productPrice, originalPrice, rating, reviewCount, brandName, tr],
  );

  const totalVideoSeconds = scenes.reduce((s, sc) => s + sc.duration, 0);

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
                  'digitalHuman.subtitleReal',
                  'Pick a realistic human host, paste a product link — get a talking promo video with real neural voice.',
                )}
              </p>
            </div>

            {/* 主播形象 + 商品链接 */}
            <Card className="mb-6 p-4 md:p-6 shadow-sm">
              {/* 视频形式：商品种草（默认）/ 主播口播 */}
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {tr('digitalHuman.videoModeLabel', 'Video Format')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        key: 'showcase' as const,
                        icon: Sparkles,
                        label: tr('digitalHuman.modeShowcase', 'Product Showcase'),
                        hint: tr('digitalHuman.modeShowcaseHint', 'Cinematic product shots + voiceover'),
                      },
                      {
                        key: 'avatar' as const,
                        icon: Users,
                        label: tr('digitalHuman.modeAvatar', 'Talking Host'),
                        hint: tr('digitalHuman.modeAvatarHint', 'Human presenter speaks on camera'),
                      },
                    ]
                  ).map(({ key, icon: Icon, label, hint }) => {
                    const selected = videoMode === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVideoMode(key)}
                        className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border bg-card hover:bg-accent'
                        }`}
                      >
                        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>{label}</span>
                          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 形象选择（仅主播口播模式） */}
              {videoMode === 'avatar' && (
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
                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        <span
                          className={`block size-14 overflow-hidden rounded-full border-2 ${selected ? 'border-primary' : 'border-border'}`}
                        >
                          {/* 真人形象照（AI 生成，同源静态资源） */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.photo} alt={a.name} className="size-full object-cover" loading="lazy" />
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
              )}

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

              {/* 声线提示 */}
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Mic className="h-3.5 w-3.5 text-primary" />
                {tr('digitalHuman.voiceNote', 'Host speaks your UI language with a real neural voice.')}
                {voiceName && <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{voiceName}</code>}
              </div>
            </Card>

            {/* 生成按钮 / 进度 */}
            {hasAnyContent && (
              <Card className="mb-6 p-4 md:p-6 shadow-sm">
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void generateScenes()}
                    disabled={generating}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : staleVoice ? <RefreshCw className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {generating
                      ? tr('digitalHuman.generatingVoice', 'Synthesizing real human voice')
                      : staleVoice
                        ? tr('digitalHuman.regenerate', 'Regenerate voice (settings changed)')
                        : videoMode === 'showcase'
                          ? tr('digitalHuman.generateShowcase', 'Generate Showcase Video')
                          : tr('digitalHuman.generate', 'Generate Talking Video')}
                  </button>

                  {generating && (
                    <div className="w-full max-w-sm space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${genProgress.total ? (genProgress.done / genProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-center text-[11px] text-muted-foreground">
                        {tr('digitalHuman.voiceProgress', 'Voice clip')} {genProgress.done}/{genProgress.total}
                      </p>
                    </div>
                  )}
                  {staleVoice && !generating && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {tr('digitalHuman.staleHint', 'Settings changed — regenerate to update the voice.')}
                    </p>
                  )}
                  {genError && <p className="text-xs text-red-500">{genError}</p>}
                  {scenes.length > 0 && !generating && (
                    <p className="text-xs text-muted-foreground">
                      {tr('digitalHuman.scenesReady', 'Scenes ready')}: {scenes.length} · {totalVideoSeconds.toFixed(1)}s
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* 预览 + 导出区 */}
            {scenes.length > 0 && !generating ? (
              <Card className="p-4 md:p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Bot className="h-5 w-5 text-primary" />
                    {tr('digitalHuman.preview', 'Preview')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {tr('digitalHuman.exportTipVoice', 'Exports MP4 with real human voice track.')}
                  </p>
                </div>
                <div className="min-h-[500px]">
                  <TalkingVideoRenderer
                    key={`${scenesKey}-${videoMode}`}
                    scenes={scenes}
                    avatar={avatar}
                    themeId={selectedTemplate}
                    product={productInfo}
                    tr={tr}
                    mode={videoMode}
                    isZh={isZh}
                    onExported={(_blob, url) => {
                      setExportedUrl(url);
                      handleExported();
                    }}
                  />
                </div>
                {exportedUrl && (
                  <div className="mt-6 border-t border-border pt-4">
                    <SocialShare
                      videoUrl={exportedUrl}
                      videoTitle={productName || tr('digitalHuman.title', 'Digital Human Sales Video')}
                    />
                  </div>
                )}
              </Card>
            ) : hasAnyContent ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Mic className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {generating
                    ? tr('digitalHuman.generatingVoice', 'Synthesizing real human voice')
                    : tr('digitalHuman.emptyHintVoice', 'Click "Generate Talking Video" to synthesize the host voice and preview.')}
                </p>
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
