/**
 * @file round-clock.ts
 * @description P1337 — the one clock for a round, derived from the round's server start time.
 *
 * Start round → 60 seconds for the room to find tables (founder, from 90 after walking it through) → 6 minutes on the first speaker's
 * meaning, 6 on the second's, 3 for the observer (spec §6) — the defaults; the host can set other
 * minutes for the next round and add a minute to the running one (RoundTiming). A round with no observer (group
 * size 2) ends after the second six. A round that is not ended simply continues: past zero the
 * clock reads "over by 2:30" instead of stopping.
 *
 * Pure — every surface (host panel, projector, the observer's phone) reads this with its own
 * Date.now(), so they agree to within the devices' clock skew.
 */
import type { SeatRole } from './round-grouping';

export type RoundPhase = 'seating' | 'first' | 'second' | 'observer' | 'over';

export const SEATING_MS = 60_000;
export const SPEAKER_MS = 6 * 60_000;
export const OBSERVER_MS = 3 * 60_000;

/** How long each part of one round runs. Stored with the round (host_start_round), so a change
 * of minutes for the next round never moves a round already running; "+1 min" adds to one part. */
export interface RoundTiming {
  seatingMs: number;
  firstMs: number;
  secondMs: number;
  observerMs: number;
  /** false = no swap at half time: the two speakers' time is one talking part ('first'), and
   * 'second' never runs (founder: "they can use 12 minutes … switching as they wish"). */
  split: boolean;
}

export const DEFAULT_TIMING: RoundTiming = {
  seatingMs: SEATING_MS,
  firstMs: SPEAKER_MS,
  secondMs: SPEAKER_MS,
  observerMs: OBSERVER_MS,
  split: true,
};

/** A round row's stored seconds → timing; rounds started before the columns existed use the defaults. */
export function roundTiming(round: {
  seatingS?: number | null;
  firstS?: number | null;
  secondS?: number | null;
  observerS?: number | null;
  splitSpeakers?: boolean | null;
}): RoundTiming {
  const ms = (s: number | null | undefined, fallback: number) => (s != null ? s * 1000 : fallback);
  const first = ms(round.firstS, SPEAKER_MS);
  const second = ms(round.secondS, SPEAKER_MS);
  const split = round.splitSpeakers !== false;
  return {
    seatingMs: ms(round.seatingS, SEATING_MS),
    firstMs: split ? first : first + second,
    secondMs: split ? second : 0,
    observerMs: ms(round.observerS, OBSERVER_MS),
    split,
  };
}

export interface RoundClock {
  phase: RoundPhase;
  /** Time left in the current phase; 0 once over. */
  phaseRemainingMs: number;
  /** Time spent in the current phase so far. */
  phaseElapsedMs: number;
  /** Time left in the whole talking part (after seating); 0 once over. */
  talkRemainingMs: number;
  /** How far past the end; 0 until over. */
  overByMs: number;
}

/** The parts of one round in order, with their length — seating first, observer only with one. */
export function roundSegments(hasObserver: boolean, timing: RoundTiming = DEFAULT_TIMING): [RoundPhase, number][] {
  return [
    ['seating', timing.seatingMs],
    ['first', timing.firstMs],
    ['second', timing.secondMs],
    ...(hasObserver ? [['observer', timing.observerMs] as [RoundPhase, number]] : []),
  ];
}

export function roundClock(
  startedAt: string,
  now: number,
  hasObserver: boolean,
  timing: RoundTiming = DEFAULT_TIMING,
): RoundClock {
  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const segments = roundSegments(hasObserver, timing);
  const talkTotal = segments.slice(1).reduce((sum, [, ms]) => sum + ms, 0);
  let t = elapsed;
  for (const [phase, ms] of segments) {
    if (t < ms) {
      const talkElapsed = Math.max(0, elapsed - timing.seatingMs);
      return {
        phase,
        phaseRemainingMs: ms - t,
        phaseElapsedMs: t,
        talkRemainingMs: phase === 'seating' ? talkTotal : talkTotal - talkElapsed,
        overByMs: 0,
      };
    }
    t -= ms;
  }
  return { phase: 'over', phaseRemainingMs: 0, phaseElapsedMs: 0, talkRemainingMs: 0, overByMs: t };
}

/** 6:05, 0:09 — minutes are not zero-padded; rounds up so a phase never shows 0:00 while live. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type LiveRole = 'speaker' | 'listener' | 'observer';

/**
 * What a seat is doing right now. The stored role says who speaks FIRST; the pair trade places
 * when the first six minutes end (founder: "speaker, listener, and then within the round they
 * switch"). Before the talking starts and after it ends, a seat reads as what it starts as.
 */
export function liveRole(role: SeatRole, phase: RoundPhase): LiveRole {
  if (role === 'observer') return 'observer';
  const swapped = phase === 'second' || phase === 'observer';
  return (role === 'first') !== swapped ? 'speaker' : 'listener';
}
