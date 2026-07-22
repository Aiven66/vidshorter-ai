'use client';

/**
 * @clipop/feedback - FeedbackWidget
 *
 * One-liner composition: a FeedbackButton + a controlled FeedbackDialog.
 * Use this when you just want "drop a feedback button on the page" without
 * wiring state yourself.
 */

import { useState } from 'react';
import { FeedbackButton } from './feedback-button';
import { FeedbackDialog } from './feedback-dialog';
import type { FeedbackLocale, FeedbackI18nDict } from './i18n';

export interface FeedbackWidgetProps {
  /** Bearer token forwarded to the dialog. */
  token?: string;
  /** Fired after a successful submit. */
  onSubmitted?: () => void;
  /** Visual style of the trigger button. Default 'button'. */
  buttonVariant?: 'button' | 'icon';
  /** Extra classes for the trigger button. */
  className?: string;
  /** Locale selector for the default dictionary. */
  locale?: FeedbackLocale;
  /** Per-key overrides that win over the default dictionary. */
  i18n?: Partial<FeedbackI18nDict>;
}

export function FeedbackWidget({
  token,
  onSubmitted,
  buttonVariant = 'button',
  className,
  locale,
  i18n,
}: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FeedbackButton
        variant={buttonVariant}
        className={className}
        onSubmitted={onSubmitted}
        onOpenChange={setOpen}
        token={token}
        locale={locale}
        i18n={i18n}
      />
      <FeedbackDialog
        open={open}
        onOpenChange={setOpen}
        onSubmitted={onSubmitted}
        token={token}
        locale={locale}
        i18n={i18n}
      />
    </>
  );
}
