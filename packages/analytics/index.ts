/**
 * @clipop/analytics — Universal behavior analytics.
 *
 * Public API surface:
 *   - Browser SDK: trackEvent, trackCustomEvent, session management
 *   - Server SDK: trackServerEvent, trackServerConversion (idempotent)
 *   - SQL: BEHAVIOR_EVENTS_SQL for table creation
 *   - Funnel config: defineFunnel, DEFAULT_FUNNELS, helpers
 *
 * Import from '@clipop/analytics' (or relative path).
 */

// Browser SDK
export {
  trackEvent,
  trackCustomEvent,
  setAnalyticsUser,
  clearAnalyticsUser,
  getSessionId,
  regenerateSession,
  initAnalytics,
  type TrackOptions,
} from './sdk';

// Server SDK (SERVER-ONLY)
export {
  trackServerEvent,
  trackServerConversion,
  type TrackServerEventInput,
  type TrackServerConversionInput,
} from './server';

// SQL DDL
export { BEHAVIOR_EVENTS_SQL } from './sql';

// Funnel configuration
export {
  defineFunnel,
  stepOf,
  buildFunnelSteps,
  VIDEO_FUNNEL,
  SUBSCRIPTION_FUNNEL,
  DEFAULT_FUNNELS,
  type FunnelDef,
  type FunnelStepDef,
  type FunnelStep,
} from './funnel-config';
