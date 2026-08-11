'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface UrlExtractorProps {
  /** 翻译辅助：返回当前语言的字符串 */
  labels: {
    urlLabel: string;
    urlPlaceholder: string;
    button: string;
    fetching: string;
    failedHint: string;
  };
  /** 调用对应 API：返回 { ok, ... } 或抛出错误 */
  onExtract: (url: string) => Promise<{ ok: boolean }>;
  /** 抓取成功后的回调（用于切换 UI、滚动到预览等） */
  onDone?: () => void;
}

/**
 * 共享的"URL 输入栏 + 一键提取"组件。
 * 用于文章转视频 / 营销视频 / 资讯视频 三个页面的顶部入口。
 */
export function UrlExtractor({ labels, onExtract, onDone }: UrlExtractorProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);

    try {
      const result = await onExtract(trimmed);
      if (!result.ok) {
        setError(labels.failedHint);
      } else {
        onDone?.();
      }
    } catch {
      setError(labels.failedHint);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={labels.urlPlaceholder}
          aria-label={labels.urlLabel}
          disabled={loading}
          className="flex-1 h-12 text-base"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          type="submit"
          size="lg"
          disabled={loading || !url.trim()}
          className="h-12 whitespace-nowrap sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {labels.fetching}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {labels.button}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
