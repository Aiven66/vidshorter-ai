/**
 * highlight-v2 公共出口
 *
 * 高光质量引擎 v2：多信号证据链 + 四维 10 分制 rubric + 复评门 + 句子 ID 时间反查。
 * 所有模块均为纯函数、零第三方依赖，可在 Web 服务端与桌面端共用。
 */

export * from './types';
export {
  SIGNAL_META,
  signalFamily,
  normalizeTrack,
  normalizeAll,
  aggregateRange,
  resonanceFamilies,
  deriveSignalsFromCues,
  buildSignalIndex,
  collectRangeSignals,
} from './signals';
export { alignSelection, pickQuote, type AlignOptions, type AlignedSpan } from './align';
export {
  sanitizeRubric,
  durationFit,
  mergeOverlaps,
  scoreCandidates,
  type ScoreInput,
  type ScoreOptions,
} from './scorer';
export { ruleBasedPreScreen, type PrescreenOptions } from './prescreen';
export { runHighlightPipeline, type PipelineOptions, type PipelineResult } from './pipeline';
export {
  buildSelectionMessages,
  buildReviewMessages,
  renderCueList,
  parseSelectionResponse,
  parseReviewResponse,
  type ChatMessage,
  type SelectionPromptOptions,
  type ReviewPromptOptions,
  type ParsedSelections,
  type ParsedReviews,
} from './llm-protocol';
