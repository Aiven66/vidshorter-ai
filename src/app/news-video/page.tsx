'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import {
  TemplateRenderer,
  DataChartScene,
  NewsHeadlineScene,
  KeyPointScene,
} from '@/components/video-templates';
import type { Scene } from '@/components/video-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Cpu,
  Newspaper,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

interface DataPoint {
  label: string;
  value: string;
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
const TOTAL_STEPS = 3;

export default function NewsVideoPage() {
  const { t } = useLocale();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [style, setStyle] = useState<string>('');
  const [headline, setHeadline] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([{ label: '', value: '' }]);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const styleLabel = useMemo(() => {
    const opt = STYLE_OPTIONS.find((o) => o.id === style);
    return opt ? t(opt.labelKey) : '';
  }, [style, t]);

  const scenes: Scene[] = useMemo(() => {
    if (!headline.trim()) return [];
    const chartData = dataPoints
      .map((d) => ({ label: d.label, value: parseFloat(d.value) }))
      .filter((d) => !Number.isNaN(d.value) && d.label.trim() !== '');
    return [
      {
        id: 'headline',
        duration: 2.5,
        transition: 'fade',
        render: () => (
          <NewsHeadlineScene
            headline={headline}
            source={dataSource || t('news.defaultSource')}
            category={styleLabel}
          />
        ),
      },
      {
        id: 'chart',
        duration: 3,
        transition: 'slide',
        render: () => <DataChartScene title={headline} data={chartData} />,
      },
      {
        id: 'summary',
        duration: 2.5,
        transition: 'fade',
        render: () => (
          <KeyPointScene
            number={1}
            title={t('news.summary')}
            content={summary || t('news.summaryPlaceholder')}
          />
        ),
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

  const canNext = () => {
    if (step === 1) return !!style;
    if (step === 2) return headline.trim().length > 0;
    return true;
  };

  const handleExport = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `news-${headline.slice(0, 20) || 'video'}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!mounted) {
    return <div className="container mx-auto min-h-[60vh] px-4 py-8 md:py-12" />;
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="mx-auto max-w-4xl">
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

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, idx) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                    step >= s
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    step >= s ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t(`news.step${s}`)}
                </span>
              </div>
              {idx < TOTAL_STEPS - 1 && (
                <div className={`h-px w-8 sm:w-12 ${step > s ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm md:p-8">
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-xl font-semibold">{t('news.step1Title')}</h2>
              <p className="mb-6 text-sm text-muted-foreground">{t('news.step1Desc')}</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {STYLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = style === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStyle(opt.id)}
                      className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all hover:bg-accent/50 ${
                        selected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border'
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{t(opt.labelKey)}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{t(opt.descKey)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-1 text-xl font-semibold">{t('news.step2Title')}</h2>
                <p className="text-sm text-muted-foreground">{t('news.step2Desc')}</p>
              </div>

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
                        placeholder={t('news.labelPlaceholder')}
                        className="flex-1"
                      />
                      <Input
                        value={dp.value}
                        onChange={(e) => updateDataPoint(idx, 'value', e.target.value)}
                        placeholder={t('news.valuePlaceholder')}
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

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-xl font-semibold">{t('news.step3Title')}</h2>
                <p className="text-sm text-muted-foreground">{t('news.step3Desc')}</p>
              </div>
              {scenes.length > 0 ? (
                <TemplateRenderer scenes={scenes} onExport={handleExport} />
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/40 p-8 text-center text-sm text-muted-foreground">
                  {t('news.previewEmpty')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('news.back')}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))} disabled={!canNext()}>
              {t('news.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Newspaper className="h-4 w-4" />
              {t('news.exportHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
