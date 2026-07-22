'use client';

/**
 * @clipop/feedback - FeedbackButton
 *
 * Single trigger button.
 *   - If config.feedbackExternalUrl is set (e.g. Tally), clicks open that URL.
 *   - Otherwise, clicks open the embedded FeedbackDialog.
 *
 * The button can run in two modes:
 *   - Uncontrolled (default): renders its own FeedbackDialog and manages open state.
 *   - Controlled (when onOpenChange is provided): delegates state to the parent
 *     and does NOT render a dialog. Use this when composing inside FeedbackWidget
 *     or when the parent wants to render a custom dialog.
 */

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAppConfig } from '../core';
import { FeedbackDialog } from './feedback-dialog';
import {
  getFeedbackI18n,
  mergeFeedbackI18n,
  type FeedbackLocale,
  type FeedbackI18nDict,
} from './i18n';

export interface FeedbackButtonProps {
  /** 'button' = pill with label; 'icon' = square icon-only. */
  variant?: 'button' | 'icon';
  className?: string;
  /** Fired after a successful submit (only relevant in uncontrolled mode). */
  onSubmitted?: () => void;
  /**
   * When provided, the parent owns dialog state. The button will NOT render
   * its own dialog; it just calls onOpenChange(true) on click.
   */
  onOpenChange?: (open: boolean) => void;
  /** Bearer token forwarded to the dialog in uncontrolled mode. */
  token?: string;
  /** Locale selector for the default dictionary. */
  locale?: FeedbackLocale;
  /** Per-key overrides that win over the default dictionary. */
  i18n?: Partial<FeedbackI18nDict>;
}

export function FeedbackButton({
  variant = 'button',
  className,
  onSubmitted,
  onOpenChange,
  token,
  locale,
  i18n,
}: FeedbackButtonProps) {
  const config = useAppConfig();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = onOpenChange !== undefined;

  const t = mergeFeedbackI18n(
    getFeedbackI18n(locale || config.defaultLocale),
    i18n,
  );

  const handleClick = () => {
    if (config.feedbackExternalUrl) {
      window.open(config.feedbackExternalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (isControlled) {
      onOpenChange!(true);
    } else {
      setInternalOpen(true);
    }
  };

  const baseCls =
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50';
  const variantCls =
    variant === 'icon'
      ? 'p-2 text-muted-foreground hover:bg-muted hover:text-foreground'
      : 'bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${baseCls} ${variantCls}${className ? ` ${className}` : ''}`}
        aria-label={t.button}
      >
        <MessageSquare className="h-4 w-4" />
        {variant === 'button' && <span>{t.button}</span>}
      </button>

      {!isControlled && !config.feedbackExternalUrl && (
        <FeedbackDialog
          open={internalOpen}
          onOpenChange={setInternalOpen}
          onSubmitted={onSubmitted}
          token={token}
          locale={locale}
          i18n={i18n}
        />
      )}
    </>
  );
}
