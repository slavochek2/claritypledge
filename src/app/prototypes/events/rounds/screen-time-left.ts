/**
 * @file screen-time-left.ts
 * @description P1529: the projector's "time left and what comes next" lines for a running round, from the round's stored part lengths
 * (the same RoundTiming the host clock reads). Pure. Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { formatClock, type RoundClock, type RoundTiming } from '@/lib/round-clock';

export interface ScreenTimeLeft {
  /** "8:12 left" */
  left: string;
  /** "then 3 min observer" */
  next: string;
}

/** The time left in the part running now, as a person reads it: in the talk it is what is left of the whole talk (a round with a swap at half time has a second half still to come). */
export function partLeftMs(clock: RoundClock, timing: RoundTiming): number {
  return clock.phaseRemainingMs + (clock.phase === 'first' ? timing.secondMs : 0);
}

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

/**
 * Seating: the finding minute is left, then the reading part when there is one, else the talk. Reading: its rest, then the talk. A speaking part: what is left of the talk before the observer's part (this speaker's rest plus the
 * second speaker's whole part), then the observer, or the end when no observer sits. Observer: its rest, then the end. Null once the time is up.
 */
export function screenTimeLeft(clock: RoundClock, timing: RoundTiming, hasObserver: boolean): ScreenTimeLeft | null {
  const { phase, phaseRemainingMs } = clock;
  if (phase === 'over') return null;
  const toTalk = `then ${minutes(timing.firstMs + timing.secondMs)} to talk`;
  // Only parts that exist are named: a round with no reading part (every mastermind round) goes from seating, if any, to the talk.
  if (phase === 'seating') return { left: `${formatClock(phaseRemainingMs)} left`, next: timing.readingMs > 0 ? `then ${minutes(timing.readingMs)} reading` : toTalk };
  if (phase === 'reading') return { left: `${formatClock(phaseRemainingMs)} left`, next: toTalk };
  if (phase === 'observer') return { left: `${formatClock(phaseRemainingMs)} left`, next: 'then the round ends' };
  return {
    left: `${formatClock(partLeftMs(clock, timing))} left`,
    next: hasObserver && timing.observerMs > 0 ? `then ${minutes(timing.observerMs)} observer` : 'then the round ends',
  };
}
