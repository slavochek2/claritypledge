/**
 * @file round-numbering.ts
 * @description P1430 — what a round is called. `round_no` is storage order only (CHECK 1..9, unique
 * per event, a start must be max+1). The host-picked round ("choose who sits", `showcase`) is the
 * Demo: it reads "Demo" and is not counted, so the round after it reads "Round 1".
 *
 * Every surface that names a round (host panel, past rounds, projector, phones) and the partner
 * planning go through these helpers — one rule, so the room never sees two numbers for one round.
 */

export interface NumberedRound {
  roundNo: number;
  showcase: boolean;
}

/** The counted number of a round, or null for a Demo. */
export function displayRoundNo(rounds: readonly NumberedRound[], round: NumberedRound): number | null {
  if (round.showcase) return null;
  return round.roundNo - rounds.filter(r => r.showcase && r.roundNo < round.roundNo).length;
}

/** "Demo" or "Round N". */
export function roundLabel(rounds: readonly NumberedRound[], round: NumberedRound): string {
  const n = displayRoundNo(rounds, round);
  return n === null ? 'Demo' : `Round ${n}`;
}

/** How many counted (non-Demo) rounds have run. */
export function countedRounds(rounds: readonly NumberedRound[]): number {
  return rounds.filter(r => !r.showcase).length;
}

/** The counted number the next round would get; null when it is a Demo. */
export function nextDisplayNo(rounds: readonly NumberedRound[], demo: boolean): number | null {
  return demo ? null : countedRounds(rounds) + 1;
}

/** "Demo" or "Round N" for the round about to start. */
export function nextRoundLabel(rounds: readonly NumberedRound[], demo: boolean): string {
  const n = nextDisplayNo(rounds, demo);
  return n === null ? 'Demo' : `Round ${n}`;
}
