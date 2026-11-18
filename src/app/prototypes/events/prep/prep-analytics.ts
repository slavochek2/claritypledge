/**
 * Preparation funnel events (opened → started → each step → finished), one shape for both the
 * event preparation (/events/:slug/prepare, EventPrepPage) and the preparation without an event
 * (/prepare, PreparePage), so a funnel can split them by `prep_context`.
 *
 * Properties carry public slugs, step keys and counts only — never free text or answers.
 */
import { analytics } from '@/lib/mixpanel';
import { eventTypeOf } from '../rsvp-analytics';

/** event = an event's preparation; standalone = /prepare; group_join = the join learning. Re-views send nothing. */
export type PrepContext = 'event' | 'standalone' | 'group_join';

export interface PrepEventRef {
  id: string;
  slug: string;
  seriesSlug?: string | null;
}

function base(context: PrepContext, event?: PrepEventRef | null): Record<string, unknown> {
  if (!event) return { prep_context: context };
  return { prep_context: context, event_id: event.id, event_slug: event.slug, event_type: eventTypeOf(event) };
}

/** The person pressed Start on the plan (event) — the first step they open. */
export function trackPrepStarted(context: PrepContext, event: PrepEventRef | null, extra: { plan_length?: number; resumed?: boolean } = {}): void {
  analytics.track('prepare_started', { ...base(context, event), ...extra });
}

/** The person left a step forward. `outcome` 'skipped' = moved on without completing it (a clip that did not play, Skip). */
export function trackPrepStep(
  context: PrepContext,
  event: PrepEventRef | null,
  step: string,
  outcome: 'completed' | 'skipped',
  position: { step_number?: number; plan_length?: number } = {},
): void {
  analytics.track('prepare_step_completed', { ...base(context, event), step, outcome, ...position });
}

/** The whole preparation is finished (event: completed_at saved; standalone: the end screen reached). */
export function trackPrepFinished(context: PrepContext, event: PrepEventRef | null, extra: { plan_length?: number } = {}): void {
  analytics.track('prepare_finished', { ...base(context, event), ...extra });
}
