/**
 * Funnel definition helpers.
 *
 * Use `defineFunnel()` to create type-safe funnel definitions,
 * then pass them to `AppConfig.funnels`.
 */

export interface FunnelStepDef {
  event: string;
  step: number;
}

export interface FunnelDef {
  id: string;
  name: string;
  steps: FunnelStepDef[];
}

/**
 * Define a funnel with an id, display name, and ordered steps.
 * Returns the same shape that AppConfig.funnels expects.
 */
export function defineFunnel(
  id: string,
  name: string,
  steps: FunnelStepDef[],
): FunnelDef {
  return { id, name, steps };
}

/**
 * A funnel step bound to a funnel id. Used by the browser SDK
 * to pass funnel_id + step_index + event_name in one object.
 */
export interface FunnelStep {
  event: string;
  step: number;
  funnelId: string;
}

/** Create a FunnelStep from a FunnelDef + step index. */
export function stepOf(funnel: FunnelDef, stepIndex: number): FunnelStep {
  const def = funnel.steps.find((s) => s.step === stepIndex);
  if (!def) {
    throw new Error(`Step ${stepIndex} not found in funnel ${funnel.id}`);
  }
  return { event: def.event, step: def.step, funnelId: funnel.id };
}

/** Convenience: build a record of named steps from a funnel definition. */
export function buildFunnelSteps<T extends string>(
  funnel: FunnelDef,
  names: Record<T, number>,
): Record<T, FunnelStep> {
  const result = {} as Record<T, FunnelStep>;
  for (const key of Object.keys(names) as T[]) {
    result[key] = stepOf(funnel, names[key]);
  }
  return result;
}

/** Example: Video generation funnel. */
export const VIDEO_FUNNEL = defineFunnel(
  'video_generation',
  'Video Generation Funnel',
  [
    { event: 'page_view_home', step: 1 },
    { event: 'click_analyze', step: 2 },
    { event: 'analyze_success', step: 3 },
    { event: 'clip_download', step: 4 },
  ],
);

/** Example: Subscription funnel. */
export const SUBSCRIPTION_FUNNEL = defineFunnel(
  'subscription',
  'Subscription Funnel',
  [
    { event: 'page_view_pricing', step: 1 },
    { event: 'click_subscribe', step: 2 },
    { event: 'subscribe_success', step: 3 },
  ],
);

/** Default funnel set — apps can override via AppConfig.funnels. */
export const DEFAULT_FUNNELS: FunnelDef[] = [VIDEO_FUNNEL, SUBSCRIPTION_FUNNEL];
