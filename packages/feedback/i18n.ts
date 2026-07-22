/**
 * @clipop/feedback - Default i18n dictionaries
 *
 * Strings used by FeedbackButton / FeedbackDialog. Host apps can pass a
 * Partial<FeedbackI18nDict> to override individual keys without forking
 * the whole dictionary.
 */

/** Shape of one locale's strings. */
export interface FeedbackI18nDict {
  button: string;
  title: string;
  contentPlaceholder: string;
  rating: string;
  submit: string;
  cancel: string;
  success: string;
  submitAnother: string;
  error: string;
  contentRequired: string;
  contentTooLong: string;
  charCount: string;
}

export const DEFAULT_I18N: Record<'en' | 'zh', FeedbackI18nDict> = {
  en: {
    button: 'Feedback',
    title: 'Send Feedback',
    contentPlaceholder: 'Tell us what you think...',
    rating: 'Rating',
    submit: 'Submit',
    cancel: 'Cancel',
    success: 'Thank you for your feedback!',
    submitAnother: 'Submit Another',
    error: 'Failed to submit. Please try again.',
    contentRequired: 'Please enter your feedback',
    contentTooLong: 'Feedback is too long (max 5000 characters)',
    charCount: '{count} / 5000',
  },
  zh: {
    button: '反馈',
    title: '发送反馈',
    contentPlaceholder: '告诉我们你的想法...',
    rating: '评分',
    submit: '提交',
    cancel: '取消',
    success: '感谢你的反馈！',
    submitAnother: '再提交一条',
    error: '提交失败，请重试。',
    contentRequired: '请输入反馈内容',
    contentTooLong: '反馈内容过长（最多 5000 字符）',
    charCount: '{count} / 5000',
  },
};

export type FeedbackLocale = keyof typeof DEFAULT_I18N;

/**
 * Resolve a locale to a complete i18n dictionary.
 * Falls back to English when the locale is missing or unsupported.
 */
export function getFeedbackI18n(locale?: string): FeedbackI18nDict {
  if (locale && (locale in DEFAULT_I18N)) {
    return DEFAULT_I18N[locale as FeedbackLocale];
  }
  return DEFAULT_I18N.en;
}

/** Merge a base dictionary with a partial override. */
export function mergeFeedbackI18n(
  base: FeedbackI18nDict,
  override?: Partial<FeedbackI18nDict>,
): FeedbackI18nDict {
  return override ? { ...base, ...override } : base;
}
