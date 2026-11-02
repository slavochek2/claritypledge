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
