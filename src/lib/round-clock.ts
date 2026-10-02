/**
 * @file round-clock.ts
 * @description P1337 — the one clock for a round, derived from the round's server start time.
 *
 * Start round → 90 seconds for the room to find tables → 6 minutes on the first speaker's
 * meaning, 6 on the second's, 3 for the observer (spec §6). A round with no observer (group
 * size 2) ends after the second six. A round that is not ended simply continues: past zero the
 * clock reads "over by 2:30" instead of stopping.
 *
 * Pure — every surface (host panel, projector, the observer's phone) reads this with its own
 * Date.now(), so they agree to within the devices' clock skew.
 */

export type RoundPhase = 'seating' | 'first' | 'second' | 'observer' | 'over';

export const SEATING_MS = 90_000;
export const SPEAKER_MS = 6 * 60_000;
export const OBSERVER_MS = 3 * 60_000;

export interface RoundClock {
  phase: RoundPhase;
  /** Time left in the current phase; 0 once over. */
  phaseRemainingMs: number;
  /** Time left in the whole talking part (after seating); 0 once over. */
  talkRemainingMs: number;
  /** How far past the end; 0 until over. */
  overByMs: number;
}

export function roundClock(startedAt: string, now: number, hasObserver: boolean): RoundClock {
  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const segments: [RoundPhase, number][] = [
    ['seating', SEATING_MS],
    ['first', SPEAKER_MS],
    ['second', SPEAKER_MS],
    ...(hasObserver ? [['observer', OBSERVER_MS] as [RoundPhase, number]] : []),
  ];
  const talkTotal = segments.slice(1).reduce((sum, [, ms]) => sum + ms, 0);
  let t = elapsed;
  for (const [phase, ms] of segments) {
    if (t < ms) {
      const talkElapsed = Math.max(0, elapsed - SEATING_MS);
      return {
        phase,
        phaseRemainingMs: ms - t,
        talkRemainingMs: phase === 'seating' ? talkTotal : talkTotal - talkElapsed,
        overByMs: 0,
      };
    }
    t -= ms;
  }
  return { phase: 'over', phaseRemainingMs: 0, talkRemainingMs: 0, overByMs: t };
}

/** 6:05, 0:09 — minutes are not zero-padded; rounds up so a phase never shows 0:00 while live. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
