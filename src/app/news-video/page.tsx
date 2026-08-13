'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocale } from '@/lib/locale-context';
import {
  TemplateRenderer,
  UrlExtractor,
  DataChartScene,
  NewsHeadlineScene,
  KeyPointScene,
  drawDataChart,
  drawNewsHeadline,
  drawKeyPoint,
  type Scene,
} from '@/components/video-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  BarChart3,
  Cpu,
  Newspaper,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  type LucideIcon,
} from 'lucide-react';

interface DataPoint {
  label: string;
  value: string;
}

interface NewsApiResponse {
  ok: boolean;
  news?: {
    headline: string;
    source: string;
    content: string;
    dataPoints: Array<{ label: string; value: string }>;
    image?: string;
    publishedAt?: string;
  };
  error?: string;
}

interface StyleOption {
  id: string;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
}

const STYLE_OPTIONS: StyleOption[] = [
  { id: 'styleReport', labelKey: 'news.styleReport', descKey: 'news.styleReportDesc', icon: BarChart3 },
  { id: 'styleRanking', labelKey: 'news.styleRanking', descKey: 'news.styleRankingDesc', icon: Trophy },
  { id: 'styleFinance', labelKey: 'news.styleFinance', descKey: 'news.styleFinanceDesc', icon: TrendingUp },
  { id: 'styleTech', labelKey: 'news.styleTech', descKey: 'news.styleTechDesc', icon: Cpu },
];

const MAX_DATA_POINTS = 10;

export default function NewsVideoPage() {
  const { t } = useLocale();

  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<string>('styleReport');
  const [headline, setHeadline] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([{ label: '', value: '' }]);
  const [summary, setSummary] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extractKey, setExtractKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  const styleLabel = useMemo(() => {
    const opt = STYLE_OPTIONS.find((o) => o.id === style);
    return opt ? t(opt.labelKey) : '';
  }, [style, t]);

  const handleExtractFromUrl = useCallback(
    async (url: string): Promise<{ ok: boolean }> => {
      try {
        const resp = await fetch('/api/extract-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data: NewsApiResponse = await resp.json();
        if (!resp.ok || !data.ok || !data.news) {
          return { ok: false };
        }
        const n = data.news;
        setHeadline(n.headline);
        setDataSource(n.source);
        if (n.dataPoints.length > 0) {
          setDataPoints(n.dataPoints.slice(0, MAX_DATA_POINTS));
        }
        // 摘要：取正文前 200 字作为默认摘要
        if (n.content) {
          setSummary(n.content.slice(0, 200));
        }
        setAutoDetected(true);
        setPreviewReady(true);
        setExtractKey((k) => k + 1);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [],
  );

  const scenes: Scene[] = useMemo(() => {
    if (!headline.trim()) return [];
    const chartData = dataPoints
      .map((d) => ({ label: d.label, value: parseFloat(d.value) }))
      .filter((d) => !Number.isNaN(d.value) && d.label.trim() !== '');
    const headlineSource = dataSource || t('news.defaultSource');
    const summaryText = summary || t('news.summaryPlaceholder');
    const summaryTitle = t('news.summary');
    return [
      {
        id: 'headline',
        duration: 2.5,
        transition: 'fade',
        render: () => (
          <NewsHeadlineScene
            headline={headline}
            source={headlineSource}
            category={styleLabel}
          />
        ),
        draw: (dc) =>
          drawNewsHeadline(dc, {
            headline,
            source: headlineSource,
            category: styleLabel,
          }),
      },
      ...(chartData.length > 0
        ? [{
            id: 'chart',
            duration: 3,
            transition: 'slide' as const,
            render: () => <DataChartScene title={headline} data={chartData} />,
            draw: (dc) => drawDataChart(dc, { title: headline, data: chartData }),
          }]
        : []),
      {
        id: 'summary',
        duration: 2.5,
        transition: 'fade',
        render: () => (
          <KeyPointScene number={1} title={summaryTitle} content={summaryText} />
        ),
        draw: (dc) =>
          drawKeyPoint(dc, { number: 1, title: summaryTitle, content: summaryText }),
      },
    ];
  }, [headline, dataSource, dataPoints, summary, styleLabel, t]);

  const addDataPoint = () => {
    if (dataPoints.length >= MAX_DATA_POINTS) return;
    setDataPoints([...dataPoints, { label: '', value: '' }]);
  };

  const removeDataPoint = (idx: number) => {
    setDataPoints(dataPoints.filter((_, i) => i !== idx));
  };

  const updateDataPoint = (idx: number, field: 'label' | 'value', val: string) => {
    const next = [...dataPoints];
    next[idx] = { ...next[idx], [field]: val };
    setDataPoints(next);
  };

  if (!mounted) {
    return <div className="container mx-auto min-h-[60vh] px-4 py-8 md:py-12" />;
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <div className="mb-8 text-center md:mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t('news.badge')}
          </div>
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            {t('news.title')}
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            {t('news.subtitle')}
          </p>
        </div>

        {/* URL 输入栏 */}
        <Card className="mb-6 p-4 md:p-6 shadow-sm">
          <UrlExtractor
            labels={{
              urlLabel: t('news.urlLabel'),
              urlPlaceholder: t('news.urlPlaceholder'),
              button: t('news.autoFillBtn'),
              fetching: t('news.fetching'),
              failedHint: t('news.fetchFailed'),
            }}
            onExtract={handleExtractFromUrl}
          />

          {autoDetected && (
            <div className="mt-3 flex items-center gap-2 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t('news.smartDetected')}
            </div>
          )}

          {/* 风格选择 - 紧凑横排 */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-sm font-medium text-foreground">{t('news.step1Title')}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = style === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(opt.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                      selected
                        ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="truncate">{t(opt.labelKey)}</span>
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
              <span>{t('news.advancedOptions')}</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="headline">{t('news.headline')}</Label>
                  <Input
                    id="headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder={t('news.headlinePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataSource">
                    {t('news.dataSource')}{' '}
                    <span className="font-normal text-muted-foreground">({t('news.optional')})</span>
                  </Label>
                  <Input
                    id="dataSource"
                    value={dataSource}
                    onChange={(e) => setDataSource(e.target.value)}
                    placeholder={t('news.dataSourcePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('news.dataPoints')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {dataPoints.length}/{MAX_DATA_POINTS}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dataPoints.map((dp, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={dp.label}
                          onChange={(e) => updateDataPoint(idx, 'label', e.target.value)}
                          placeholder={t('news.dataPointLabelPlaceholder')}
                          className="flex-1"
                        />
                        <Input
                          value={dp.value}
                          onChange={(e) => updateDataPoint(idx, 'value', e.target.value)}
                          placeholder={t('news.dataPointValuePlaceholder')}
                          className="w-24 sm:w-28"
                          inputMode="decimal"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDataPoint(idx)}
                          disabled={dataPoints.length === 1}
                          aria-label={t('news.removeDataPoint')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addDataPoint}
                    disabled={dataPoints.length >= MAX_DATA_POINTS}
                  >
                    <Plus className="h-4 w-4" />
                    {t('news.addDataPoint')}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="summary">{t('news.summary')}</Label>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder={t('news.summaryPlaceholder')}
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* 预览区 */}
        {previewReady && headline ? (
          <Card className="p-4 md:p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Newspaper className="h-5 w-5 text-primary" />
                {t('news.preview')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('news.exportHint')}</p>
            </div>
            {scenes.length > 0 ? (
              <TemplateRenderer scenes={scenes} resetKey={extractKey} />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/40 p-8 text-center text-sm text-muted-foreground">
                {t('news.previewEmpty')}
              </div>
            )}
          </Card>
        ) : (
          <Card className="border-dashed p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <LinkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {tr('news.urlPlaceholder', 'Paste a news link to start')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
