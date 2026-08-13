export { TemplateRenderer, default } from './template-renderer';
export type { Scene, TemplateRendererProps, ExportFormat } from './template-renderer';

export {
  BrandIntroScene,
  ProductShowcaseScene,
  CTAScene,
  DataChartScene,
  NewsHeadlineScene,
  KeyPointScene,
  QuoteScene,
  drawBrandIntro,
  drawProductShowcase,
  drawCTA,
  drawDataChart,
  drawNewsHeadline,
  drawKeyPoint,
  drawQuote,
} from './scene-templates';

export type {
  BrandIntroSceneProps,
  ProductShowcaseSceneProps,
  CTASceneProps,
  DataChartSceneProps,
  NewsHeadlineSceneProps,
  KeyPointSceneProps,
  QuoteSceneProps,
} from './scene-templates';

export type { DrawContext } from './canvas-utils';
export {
  easeOutCubic,
  easeOutBack,
  clamp01,
  stagger,
  fillGradient,
  fillSolid,
  setFont,
  drawCenteredBlock,
  drawWrappedText,
  wrapText,
  fillRoundRect,
  withAlpha,
} from './canvas-utils';

export { UrlExtractor } from './url-extractor';
export { SocialShare } from './social-share';
export { default as SocialShareDefault } from './social-share';
