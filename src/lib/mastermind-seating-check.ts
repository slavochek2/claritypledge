/**
 * @file mastermind-seating-check.ts
 * @description P1529 §4: what a GIVEN seating of one round breaks, so the host's manual swap is checked against the
 * same rules `planMastermindRound` plans by. Pure, no I/O.
 *
 * This looks at THIS round only: repeat partners, partners from the session this one continues, a Clarity Canvas owner
 * with no canvas (the server refuses that one at Start), a canvas holder observing twice, people with no seat, too few
 * canvases, an owner who owns again in a part, and the one forward-looking rule that is certain by now: nobody can still
 * own in a part once its last round (2 or 4) is seated. What the LATER rounds will break is only known to the planner, so it is not recomputed here.
 */
import {
  MIN_CANVASES_FOR_A_TABLE,
  RECOMMENDED_MIN_CANVASES,
  half,
  key,
  tallyHistory,
  type SeatingHistoryRound,
  type UnmetRule,
} from './mastermind-seating';
import type { Seat } from './round-grouping';

export type SeatingProblem = UnmetRule | { rule: 'owner-without-canvas'; person: string };

export interface SeatingCheckInput {
  /** People with a canvas shared with this event and available for this round. */
  holders: string[];
  /** Everyone else who should be seated. */
  observers: string[];
  /** Every COUNTED round behind this one, in order. */
  history: SeatingHistoryRound[];
  previousPartners?: [string, string][];
}

/** What one table breaks: an owner with no canvas, a repeat partner, a partner from the session this one continues. */
function tableProblems(table: Seat[], holders: ReadonlySet<string>, met: ReadonlySet<string>, previous: ReadonlySet<string>): SeatingProblem[] {
  // Seat anyway: below two canvases an owner may have no canvas (the server allows it only then).
  const ownerNeedsCanvas = holders.size >= MIN_CANVASES_FOR_A_TABLE;
  const owner = table.find(s => s.role === 'first')?.id;
  const partner = table.find(s => s.role === 'second')?.id;
  const out: SeatingProblem[] = [];
  if (ownerNeedsCanvas && owner && !holders.has(owner)) out.push({ rule: 'owner-without-canvas', person: owner });
  if (owner && partner && met.has(key(owner, partner))) out.push({ rule: 'repeat-partner', people: [owner, partner] });
  if (owner && partner && previous.has(key(owner, partner))) out.push({ rule: 'previous-session-partner', people: [owner, partner] });
  return out;
}

/** The last round of a part is the last chance to own in it. */
function ownsOnceProblems(seats: Seat[], input: SeatingCheckInput, ownedByPart: ReturnType<typeof tallyHistory>['ownedByPart']): SeatingProblem[] {
  const roundNo = input.history.length + 1;
  if (roundNo !== 2 && roundNo !== 4) return [];
  const part = half(roundNo);
  const owningNow = new Set(seats.filter(s => s.role === 'first').map(s => s.id));
  return input.holders.filter(h => !ownedByPart[part].has(h) && !owningNow.has(h)).map(person => ({ rule: 'owns-once' as const, person, part }));
}

/** Owning again in a part already owned in (rounds 1-4 only: past the fourth round there is no owning promise). */
function ownsTwiceProblems(seats: Seat[], input: SeatingCheckInput, ownedByPart: ReturnType<typeof tallyHistory>['ownedByPart']): SeatingProblem[] {
  const roundNo = input.history.length + 1;
  if (roundNo > 4) return [];
  const part = half(roundNo);
  return seats.filter(s => s.role === 'first' && ownedByPart[part].has(s.id)).map(s => ({ rule: 'owns-twice' as const, person: s.id, part }));
}

export function checkMastermindSeats(seats: Seat[], input: SeatingCheckInput): SeatingProblem[] {
  const tally = tallyHistory(input.history);
  const previous = new Set((input.previousPartners ?? []).map(([a, b]) => key(a, b)));
  const holders = new Set(input.holders);
  const seated = new Set(seats.map(s => s.id));
  const tables = new Map<number, Seat[]>();
  for (const s of seats) tables.set(s.table, [...(tables.get(s.table) ?? []), s]);
  return [
    ...(input.holders.length < RECOMMENDED_MIN_CANVASES ? [{ rule: 'too-few-canvases' as const, canvases: input.holders.length }] : []),
    ...[...input.holders, ...input.observers].filter(p => !seated.has(p)).map(person => ({ rule: 'unseated' as const, person })),
    ...[...tables.values()].flatMap(t => tableProblems(t, holders, tally.met, previous)),
    ...seats.filter(s => s.role === 'observer' && holders.has(s.id) && (tally.sitOuts.get(s.id) ?? 0) > 0).map(s => ({ rule: 'observes-twice' as const, person: s.id })),
    ...ownsOnceProblems(seats, input, tally.ownedByPart),
    ...ownsTwiceProblems(seats, input, tally.ownedByPart),
  ];
}
