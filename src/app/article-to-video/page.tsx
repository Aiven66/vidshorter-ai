'use client';

import { useState, useMemo } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TemplateRenderer,
  KeyPointScene,
  QuoteScene,
  NewsHeadlineScene,
  type Scene,
} from '@/components/video-templates';
import {
  FileText, Sparkles, PlayCircle, ChevronLeft, ChevronRight,
  Lightbulb, FlaskConical, MessageSquare, Quote as QuoteIcon,
} from 'lucide-react';

/* --------------------------- Local AI extraction --------------------------- */

interface KeyPoint { title: string; detail: string; }

function extractKeyPoints(title: string, content: string): KeyPoint[] {
  const paragraphs = content.split(/\n\n+|\n+/).filter((p) => p.trim().length > 20);
  const points = paragraphs.map((p) => {
    const sentences = p.split(/[。！？.!?]/).filter((s) => s.trim().length > 5);
    const firstSentence = sentences[0]?.trim() || p.trim().slice(0, 50);
    return {
      title: firstSentence.slice(0, 30) + (firstSentence.length > 30 ? '...' : ''),
      detail: p.trim(),
    };
  });
  return points.slice(0, 8);
}

/* ------------------------------- Templates -------------------------------- */

type TemplateStyle = 'explainer' | 'science' | 'commentary' | 'quote';

interface TemplateOption {
  value: TemplateStyle;
  icon: typeof Lightbulb;
  labelKey: string;
  description: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: 'explainer', icon: Lightbulb, labelKey: 'article.templateExplainer', description: 'Explain concepts step by step' },
  { value: 'science', icon: FlaskConical, labelKey: 'article.templateScience', description: 'Educational tone for science topics' },
  { value: 'commentary', icon: MessageSquare, labelKey: 'article.templateCommentary', description: 'Opinionated commentary style' },
  { value: 'quote', icon: QuoteIcon, labelKey: 'article.templateQuote', description: 'Punchy quote-card format' },
];

const TEMPLATE_CATEGORY: Record<TemplateStyle, string> = {
  explainer: 'Article to Video',
  science: 'Science & Education',
  commentary: 'Commentary',
  quote: 'Quote Cards',
};

/* --------------------------------- Page ----------------------------------- */

export default function ArticleToVideoPage() {
  const { t } = useLocale();
  const [step, setStep] = useState<number>(1);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [template, setTemplate] = useState<TemplateStyle>('explainer');

  const wordCount = useMemo(() => {
    const trimmed = pasteContent.trim();
    if (!trimmed) return 0;
    const cjk = (trimmed.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const latin = (trimmed.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/\b[\w-]+\b/g) || []).length;
    return cjk + latin;
  }, [pasteContent]);

  const handleExtract = async () => {
    setExtracting(true);
    await new Promise((r) => setTimeout(r, 600));
    setKeyPoints(extractKeyPoints(pasteTitle, pasteContent));
    setExtracting(false);
  };

  const updatePoint = (idx: number, field: keyof KeyPoint, value: string) => {
    setKeyPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const removePoint = (idx: number) => {
    setKeyPoints((prev) => prev.filter((_, i) => i !== idx));
  };

  const canGoStep2 = pasteTitle.trim().length > 0 && pasteContent.trim().length > 20;
  const canGoStep3 = keyPoints.length > 0;

  const scenes: Scene[] = useMemo(() => {
    if (keyPoints.length === 0) return [];
    const category = TEMPLATE_CATEGORY[template];
    const headline = pasteTitle.trim() || 'Untitled Article';

    const titleScene: Scene = {
      id: 'title', duration: 2, transition: 'fade',
      render: () => <NewsHeadlineScene headline={headline} source="Clipop AI" category={category} />,
    };

    const pointScenes: Scene[] = keyPoints.map((kp, i) => {
      if (template === 'quote') {
        return {
          id: `point-${i}`, duration: 3, transition: 'fade' as const,
          render: () => <QuoteScene quote={kp.title} author={`Point ${i + 1}`} />,
        };
      }
      return {
        id: `point-${i}`, duration: 3, transition: 'slide' as const,
        render: () => <KeyPointScene number={i + 1} title={kp.title} content={kp.detail} />,
      };
    });

    const closingScene: Scene = {
      id: 'quote', duration: 2, transition: 'fade',
      render: () => <QuoteScene quote={keyPoints[0]?.title || headline} author="Clipop AI" />,
    };

    return [titleScene, ...pointScenes, closingScene];
  }, [keyPoints, template, pasteTitle]);

  /* ------------------------------- Render -------------------------------- */

  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4">
          <FileText className="h-3.5 w-3.5" />
          {t('article.badge')}
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
          {t('article.title')}
        </h1>
        <p className="text-muted-foreground text-base md:text-lg">{t('article.subtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className="mx-auto max-w-3xl mb-10">
        <div className="flex items-center justify-between gap-2">
          {([
            { n: 1, label: t('article.step1'), icon: FileText },
            { n: 2, label: t('article.step2'), icon: Sparkles },
            { n: 3, label: t('article.step3'), icon: PlayCircle },
          ] as const).map(({ n, label, icon: Icon }, idx) => {
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    active ? 'border-primary bg-primary text-primary-foreground'
                      : done ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`hidden sm:inline text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
                {idx < 2 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="mx-auto max-w-3xl">
        {/* Step 1: Paste Article */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {t('article.step1')}
              </CardTitle>
              <CardDescription>{t('article.pasteContentPlaceholder')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t('article.pasteTitle')}</label>
                <Input
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder={t('article.pasteTitlePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">{t('article.pasteContent')}</label>
                  <span className="text-xs text-muted-foreground">
                    {t('article.wordCount').replace('{n}', String(wordCount))}
                  </span>
                </div>
                <Textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder={t('article.pasteContentPlaceholder')}
                  className="min-h-[200px] resize-y"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: AI Extraction */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('article.step2')}
              </CardTitle>
              <CardDescription>{t('article.extractedPoints')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleExtract} disabled={extracting} className="w-full">
                <Sparkles className={`h-4 w-4 ${extracting ? 'animate-spin' : ''}`} />
                {extracting ? t('article.extracting') : t('article.extractBtn')}
              </Button>

              {keyPoints.length === 0 && !extracting && (
                <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  {t('article.noPoints')}
                </div>
              )}

              {keyPoints.length > 0 && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {t('article.pointCount').replace('{n}', String(keyPoints.length))}
                  </div>
                  {keyPoints.map((kp, i) => (
                    <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {i + 1}
                        </span>
                        <Input
                          value={kp.title}
                          onChange={(e) => updatePoint(i, 'title', e.target.value)}
                          placeholder="Point title"
                          className="h-8"
                        />
                        <Button variant="ghost" size="icon-sm" onClick={() => removePoint(i)} aria-label="Remove point">
                          ×
                        </Button>
                      </div>
                      <Textarea
                        value={kp.detail}
                        onChange={(e) => updatePoint(i, 'detail', e.target.value)}
                        placeholder="Point detail"
                        className="min-h-[80px] resize-y text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview & Export */}
        {step === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  {t('article.step3')}
                </CardTitle>
                <CardDescription>
                  {t('article.pointCount').replace('{n}', String(keyPoints.length))}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {TEMPLATE_OPTIONS.map(({ value, icon: Icon, labelKey, description }) => {
                    const active = template === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTemplate(value)}
                        className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                          active ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border bg-card hover:bg-accent'
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="text-sm font-medium text-foreground">{t(labelKey)}</div>
                        <div className="text-xs text-muted-foreground leading-snug">{description}</div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('article.preview')}</CardTitle>
              </CardHeader>
              <CardContent>
                {scenes.length > 0 ? (
                  <TemplateRenderer scenes={scenes} />
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    {t('article.noPoints')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bottom navigation */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          {step === 1 && (
            <Button onClick={() => setStep(2)} disabled={!canGoStep2}>
              {t('article.extractBtn')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canGoStep3}>
              {t('article.preview')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button variant="outline" onClick={() => setStep(1)}>Start Over</Button>
          )}
        </div>
      </div>
    </div>
  );
}
