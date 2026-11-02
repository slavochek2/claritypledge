import * as Sentry from '@sentry/react';
import { analytics } from '@/lib/mixpanel';

/**
 * P525: reports a failed live-state write to Sentry (with the already-sanitized state snapshot) and
 * Mixpanel. Moved out of the live page unchanged; neither report may break the app.
 */
export function reportLiveUpdateFailure(
  err: unknown,
  sessionId: string,
  sanitizedState: unknown,
  phaseAtFailure: string | undefined,
  updates: Record<string, unknown>,
): void {
  try {
    Sentry.captureException(err, {
      extra: { live_state: sanitizedState, attempted_keys: Object.keys(updates), session_id: sessionId },
    });
  } catch { /* never let Sentry break the app */ }
  try {
    analytics.track('live_state_update_failed', {
      session_id: sessionId,
      error_message: err instanceof Error ? err.message : 'unknown',
      attempted_keys: Object.keys(updates),
      phase_at_failure: phaseAtFailure,
    });
  } catch { /* never let analytics break the app */ }
}
