'use client';

import { useState, useMemo, useCallback } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  TemplateRenderer,
  KeyPointScene,
  QuoteScene,
  NewsHeadlineScene,
  UrlExtractor,
  type Scene,
} from '@/components/video-templates';
import {
  FileText, Sparkles, PlayCircle, ChevronDown, ChevronUp,
  Lightbulb, FlaskConical, MessageSquare, Quote as QuoteIcon,
  Trash2, RefreshCw, Link as LinkIcon,
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
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: 'explainer', icon: Lightbulb, labelKey: 'article.templateExplainer' },
  { value: 'science', icon: FlaskConical, labelKey: 'article.templateScience' },
  { value: 'commentary', icon: MessageSquare, labelKey: 'article.templateCommentary' },
  { value: 'quote', icon: QuoteIcon, labelKey: 'article.templateQuote' },
];

const TEMPLATE_CATEGORY: Record<TemplateStyle, string> = {
  explainer: 'Article to Video',
  science: 'Science & Education',
  commentary: 'Commentary',
  quote: 'Quote Cards',
};

/* --------------------------------- Page ----------------------------------- */

interface ArticleApiResponse {
  ok: boolean;
  article?: { title: string; content: string; source: string; image?: string; description?: string };
  error?: string;
}

export default function ArticleToVideoPage() {
  const { t } = useLocale();
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [template, setTemplate] = useState<TemplateStyle>('explainer');
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showPointEditor, setShowPointEditor] = useState(false);
  const [autoExtracted, setAutoExtracted] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  const wordCount = useMemo(() => {
    const trimmed = pasteContent.trim();
    if (!trimmed) return 0;
    const cjk = (trimmed.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const latin = (trimmed.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/\b[\w-]+\b/g) || []).length;
    return cjk + latin;
  }, [pasteContent]);

  const canExtractFromText = pasteTitle.trim().length > 0 && pasteContent.trim().length > 20;

  const runLocalExtract = useCallback(() => {
    setExtracting(true);
    // 模拟异步，让用户感知到"AI 正在工作"
    setTimeout(() => {
      setKeyPoints(extractKeyPoints(pasteTitle, pasteContent));
      setExtracting(false);
      setPreviewReady(true);
    }, 500);
  }, [pasteTitle, pasteContent]);

  const handleExtractFromUrl = useCallback(
    async (inputUrl: string): Promise<{ ok: boolean }> => {
      try {
        const resp = await fetch('/api/extract-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: inputUrl }),
        });
        const data: ArticleApiResponse = await resp.json();
        if (!resp.ok || !data.ok || !data.article) {
          return { ok: false };
        }
        setPasteTitle(data.article.title);
        setPasteContent(data.article.content);
        setKeyPoints(extractKeyPoints(data.article.title, data.article.content));
        setAutoExtracted(true);
        setPreviewReady(true);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [],
  );

  const updatePoint = (idx: number, field: keyof KeyPoint, value: string) => {
    setKeyPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const removePoint = (idx: number) => {
    setKeyPoints((prev) => prev.filter((_, i) => i !== idx));
  };

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

  const handleExport = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `article-${pasteTitle.slice(0, 20) || 'video'}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
  };

  /* ------------------------------- Render -------------------------------- */

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <div className="mb-8 text-center md:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FileText className="h-3.5 w-3.5" />
            {t('article.badge')}
          </div>
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            {t('article.title')}
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            {t('article.subtitle')}
          </p>
        </div>

        {/* URL 输入栏 — 核心入口 */}
        <Card className="mb-6 p-4 md:p-6 shadow-sm">
          <UrlExtractor
            labels={{
              urlLabel: t('article.urlLabel'),
              urlPlaceholder: t('article.urlPlaceholder'),
              button: t('article.autoFillBtn'),
              fetching: t('article.fetching'),
              failedHint: t('article.fetchFailed'),
            }}
            onExtract={handleExtractFromUrl}
          />

          {/* 智能识别标识 */}
          {autoExtracted && (
            <div className="mt-3 flex items-center gap-2 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t('article.smartDetected')}
            </div>
          )}

          {/* 或粘贴文本 - 折叠区域 */}
          <div className="mt-4 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowTextEditor((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('article.orPasteText')}
              </span>
              {showTextEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showTextEditor && (
              <div className="mt-4 space-y-3">
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
                    className="min-h-[160px] resize-y"
                  />
                </div>
                <Button onClick={runLocalExtract} disabled={extracting || !canExtractFromText} className="w-full">
                  {extracting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {t('article.extracting')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {t('article.extractBtn')}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* 模板选择 - 紧凑横排 */}
        {keyPoints.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {tr('article.templateRowLabel', 'Template')}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TEMPLATE_OPTIONS.map(({ value, icon: Icon, labelKey }) => {
                const active = template === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTemplate(value)}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                      active
                        ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 预览 + 编辑要点 */}
        {previewReady && keyPoints.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* 预览区 */}
            <Card className="p-4 md:p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  {t('article.preview')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t('article.pointCount').replace('{n}', String(keyPoints.length))}
                </span>
              </div>
              <TemplateRenderer scenes={scenes} onExport={handleExport} />
            </Card>

            {/* 要点编辑 - 侧栏折叠 */}
            <Card className="p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setShowPointEditor((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-foreground"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t('article.advancedOptions')}
                </span>
                {showPointEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showPointEditor && (
                <div className="mt-4 space-y-3">
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
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={kp.detail}
                        onChange={(e) => updatePoint(i, 'detail', e.target.value)}
                        placeholder="Point detail"
                        className="min-h-[60px] resize-y text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {!showPointEditor && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('article.pointCount').replace('{n}', String(keyPoints.length))} · {t('article.smartDetected')}
                </p>
              )}
            </Card>
          </div>
        )}

        {/* 空状态提示 */}
        {!previewReady && (
          <Card className="border-dashed p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('article.noPoints')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
