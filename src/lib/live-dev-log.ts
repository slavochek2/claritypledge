import type { LiveSessionState } from '@/app/types';

/** Dev-only trace of one realtime live-state event (moved out of the live page unchanged). */
export function devLogRealtimeEvent(
  incoming: Record<string, unknown>,
  confirmed: LiveSessionState,
  merged: LiveSessionState,
  stateRegression: boolean,
  inFlight: boolean,
): void {
  if (!import.meta.env.DEV) return;
  const prevPhase = confirmed.ratingPhase;
  const nextPhase = merged.ratingPhase;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(
    `[Realtime] ${new Date().toISOString()} Event ${stateRegression ? 'REJECTED (regression)' : inFlight ? 'MERGED (inFlight)' : 'applied'}:`,
    `phase=${prevPhase}→${nextPhase}`,
    `checkerSubmitted=${incoming.checkerSubmitted ?? '∅'}`,
    `responderSubmitted=${incoming.responderSubmitted ?? '∅'}`,
    `celebCreator=${incoming.celebrationAcknowledgedByCreator ?? '∅'}`,
    `celebJoiner=${incoming.celebrationAcknowledgedByJoiner ?? '∅'}`,
  );
}

/** Dev-only trace of a drift-poll tick that skipped (moved out of the live page unchanged). */
export function devLogDriftSkipped(hasLiveState: boolean, hasJoiner: boolean): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(`[Drift Poll] SKIPPED: hasLiveState=${hasLiveState}, hasJoiner=${hasJoiner}`);
}

/** Dev-only trace of a drift-poll tick that compared states (moved out of the live page unchanged). */
export function devLogDriftCompared(server: LiveSessionState, local: LiveSessionState, ratingInitiatedByDrift: boolean, serverHasUpdate: boolean): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(`[Drift Poll] server.ratingInitiatedBy=${server.ratingInitiatedBy}, local.ratingInitiatedBy=${local.ratingInitiatedBy}, drift=${ratingInitiatedByDrift}, serverHasUpdate=${serverHasUpdate}`);
}

/** Dev-only trace of a live-state write's outcome (moved out of the live page unchanged). */
export function devLogLiveUpdate(succeeded: boolean, updates: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const keys = Object.keys(updates).join(', ');
  if (succeeded) {
    // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
    console.log(`[LiveUpdate] Write succeeded: ${keys}`);
  } else {
    console.error(`[LiveUpdate] Write FAILED + REVERTED: ${keys}`);
  }
}

/** Dev-only trace of a rating submit (moved out of the live page unchanged). */
export function devLogRatingSubmit(rating: number, cs: LiveSessionState, inFlight: boolean, isCreator: boolean): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(
    `[RatingSubmit] ${new Date().toISOString()}`,
    `rating=${rating}`,
    `phase=${cs.ratingPhase}`,
    `checkerName=${cs.checkerName ?? '∅'}`,
    `checkerSubmitted=${cs.checkerSubmitted}`,
    `responderSubmitted=${cs.responderSubmitted}`,
    `inFlight=${inFlight}`,
    `isCreator=${isCreator}`,
  );
}

/** Dev-only trace of a rejected start-check (moved out of the live page unchanged). */
export function devLogStartCheckRejected(cs: LiveSessionState): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(`[Guard] handleStartCheck: ref.ratingPhase=${cs.ratingPhase}, ref.checkerName=${!!cs.checkerName}, action=rejected`);
}

/** Dev-only trace of the reactive-reset safety net (moved out of the live page unchanged). */
export function devLogReactiveReset(bothAcknowledged: boolean, phase: string, fired: boolean): void {
  if (!import.meta.env.DEV || !bothAcknowledged || phase === 'idle') return;
  // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
  console.log(`[ReactiveReset] ${new Date().toISOString()}`, `bothAck=true phase=${phase} guard=${fired}`, fired ? '→ SKIPPED (guard)' : '→ FIRING RESET');
}
