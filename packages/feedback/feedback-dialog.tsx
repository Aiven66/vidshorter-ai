'use client';

/**
 * @clipop/feedback - FeedbackDialog
 *
 * Self-contained modal: textarea (max 5000 chars) + 5-star rating selector.
 * Uses native elements + Tailwind only (no shadcn/ui dependency).
 */

import { useEffect, useState } from 'react';
import { Star, X, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { useAppConfig } from '../core';
import { submitFeedback, FEEDBACK_MAX_LENGTH } from './client';
import {
  getFeedbackI18n,
  mergeFeedbackI18n,
  type FeedbackLocale,
  type FeedbackI18nDict,
} from './i18n';

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful submit. */
  onSubmitted?: () => void;
  /** Bearer token; when omitted, runs in demo mode. */
  token?: string;
  /** Locale selector for the default dictionary. */
  locale?: FeedbackLocale;
  /** Per-key overrides that win over the default dictionary. */
  i18n?: Partial<FeedbackI18nDict>;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  onSubmitted,
  token,
  locale,
  i18n,
}: FeedbackDialogProps) {
  const config = useAppConfig();
  const t: FeedbackI18nDict = mergeFeedbackI18n(
    getFeedbackI18n(locale || config.defaultLocale),
    i18n,
  );

  const [content, setContent] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Reset form whenever the dialog closes.
  useEffect(() => {
    if (open) {
      setError('');
    } else {
      setContent('');
      setRating(null);
      setHoverRating(null);
      setSubmitting(false);
      setDone(false);
      setError('');
    }
  }, [open]);

  // Esc-to-close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange, submitting]);

  if (!open) return null;

  const displayRating = hoverRating ?? rating;

  const handleSubmit = async () => {
    setError('');
    const trimmed = content.trim();
    if (!trimmed) {
      setError(t.contentRequired);
      return;
    }
    if (trimmed.length > FEEDBACK_MAX_LENGTH) {
      setError(t.contentTooLong);
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback(config, {
        content: trimmed,
        rating: rating ?? undefined,
        token,
      });
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setDone(false);
    setContent('');
    setRating(null);
    setHoverRating(null);
    setError('');
  };

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="feedback-dialog-title" className="text-lg font-semibold text-foreground">
            {t.title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="text-foreground">{t.success}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSubmitAnother}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                {t.submitAnother}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.contentPlaceholder}
                maxLength={FEEDBACK_MAX_LENGTH}
                rows={5}
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                disabled={submitting}
                autoFocus
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                {t.charCount.replace('{count}', String(content.length))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">{t.rating}</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = displayRating !== null && star <= displayRating;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      disabled={submitting}
                      className="rounded p-1 hover:bg-muted disabled:opacity-50"
                      aria-label={`${t.rating} ${star}`}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          filled
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.submit}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t.submit}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
