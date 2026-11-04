/**
 * @file mastermind-seating.ts
 * @description P1529 §4: the sales mastermind's seating. Each table is about one Clarity Canvas: its
 * owner (role `first`), their partner (role `second`) and up to two observers.
 *
 * Rules, in priority order; every rule the plan could not meet is NAMED for the host, never hidden:
 *   1. One owner and one partner per table, up to two observers. Extra observers are named as unseated.
 *   2. Nobody repeats a partner within this session.
 *   3. Everyone with a canvas owns once in rounds 1-2 and once in rounds 3-4. With an odd number, one
 *      canvas holder observes each round, rotated so nobody observes twice.
 *   4. Avoid partners from the session this one continues (a preference; the preview names repeats).
 *
 * Rounds past the fourth keep rotating with rule 2 and no owning promise. All remaining rounds are
 * planned together and only the next one is returned: planning a round alone can leave a later round
 * with no new partner. Someone added late (P1529 D17) simply appears in `holders` from that round on.
 *
 * Deterministic for a given seed. Pure, no I/O. Unit-tested in src/tests/p1529-mastermind-seating.test.ts.
 */
import type { Seat } from './round-grouping';

/** One past round's tables, read back from the saved seats. Ids are the same kind as `holders`. */
export type SeatingHistoryRound = Seat[];

export interface MastermindSeatingInput {
  /** People with a Clarity Canvas shared with this event and available for this round. */
  holders: string[];
  /** People without one, or whom the host marked as observers. */
  observers: string[];
  /** Every COUNTED round behind this one, in order. */
  history: SeatingHistoryRound[];
  /** Pairs who were partners in the session this one continues. */
  previousPartners?: [string, string][];
  seed: string;
}

export type UnmetRule =
  | { rule: 'repeat-partner'; people: [string, string] }
  | { rule: 'owns-once'; person: string; part: 'first' | 'second' }
  | { rule: 'observes-twice'; person: string }
  | { rule: 'previous-session-partner'; people: [string, string] }
  | { rule: 'unseated'; person: string }
  | { rule: 'too-few-canvases'; canvases: number };

export interface MastermindSeatingPlan {
  seats: Seat[];
  /** What this round breaks, plus what the plan knows the later rounds will break. */
  unmet: UnmetRule[];
}

/** Below this, a round has no pair; the spec's format itself works from five. */
export const MIN_CANVASES_FOR_A_TABLE = 2;
export const RECOMMENDED_MIN_CANVASES = 5;
const ROUNDS_IN_SESSION = 4;
const MAX_OBSERVERS_PER_TABLE = 2;
const ATTEMPTS = 400;

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const half = (roundNo: number) => (roundNo <= 2 ? 'first' : 'second');

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Tally {
  met: Set<string>;
  ownedByPart: { first: Set<string>; second: Set<string> };
  sitOuts: Map<string, number>;
}

function tallyHistory(history: SeatingHistoryRound[]): Tally {
  const t: Tally = { met: new Set(), ownedByPart: { first: new Set(), second: new Set() }, sitOuts: new Map() };
  history.forEach((seats, i) => {
    const part = half(i + 1);
    const tables = new Map<number, Seat[]>();
    for (const s of seats) tables.set(s.table, [...(tables.get(s.table) ?? []), s]);
    for (const table of tables.values()) {
      const owner = table.find(s => s.role === 'first')?.id;
      const partner = table.find(s => s.role === 'second')?.id;
      if (owner) t.ownedByPart[part].add(owner);
      if (owner && partner) t.met.add(key(owner, partner));
    }
    for (const s of seats) if (s.role === 'observer') t.sitOuts.set(s.id, (t.sitOuts.get(s.id) ?? 0) + 1);
  });
  return t;
}

/** Match each owner to a partner, preferring new partners, then people not paired last session. */
function matchPairs(owners: string[], partners: string[], t: Tally, previous: Set<string>, rand: () => number): [string, string][] {
  const free = new Set(shuffled(partners, rand));
  let best: [string, string][] | null = null;
  let bestCost = Infinity;
  const order = shuffled(owners, rand);
  const pairs: [string, string][] = [];
  let nodes = 0;
  const go = (i: number, cost: number) => {
    if (cost >= bestCost || nodes++ > 4000) return;
    if (i === order.length) {
      best = [...pairs];
      bestCost = cost;
      return;
    }
    const options = [...free].sort((a, b) => pairCost(order[i], a, t, previous) - pairCost(order[i], b, t, previous));
    for (const p of options) {
      free.delete(p);
      pairs.push([order[i], p]);
      go(i + 1, cost + pairCost(order[i], p, t, previous));
      pairs.pop();
      free.add(p);
    }
  };
  go(0, 0);
  return best ?? [];
}

function pairCost(a: string, b: string, t: Tally, previous: Set<string>): number {
  return (t.met.has(key(a, b)) ? 1000 : 0) + (previous.has(key(a, b)) ? 1 : 0);
}

interface PlannedRound {
  pairs: [string, string][];
  sitOut: string[];
}

/** One round: who owns, who partners, who sits out. Mutates a copy of the tally for the rounds after it. */
function planOneRound(holders: string[], roundNo: number, t: Tally, previous: Set<string>, rand: () => number): PlannedRound {
  const part = half(roundNo);
  const inSession = roundNo <= ROUNDS_IN_SESSION;
  const secondOfPart = roundNo === 2 || roundNo === 4;
  const stillToOwn = holders.filter(h => !t.ownedByPart[part].has(h));
  const already = holders.filter(h => t.ownedByPart[part].has(h));
  const pairsPossible = Math.floor(holders.length / 2);

  // An odd count sits one out: whoever has observed least, and someone not forced to own this round if possible.
  const bySitOuts = (list: string[]) =>
    shuffled(list, rand).sort((a, b) => (t.sitOuts.get(a) ?? 0) - (t.sitOuts.get(b) ?? 0));

  let owners: string[];
  let partners: string[];
  const sitOut: string[] = [];
  if (inSession && secondOfPart) {
    // Those who have not owned in this part own now, against those who have.
    let toOwn = bySitOuts(stillToOwn).reverse();
    let toPartner = bySitOuts(already);
    if (toOwn.length + toPartner.length > pairsPossible * 2) {
      // Odd: one of the larger side observes, the one who has observed least.
      if (toOwn.length > toPartner.length) { sitOut.push(...toOwn.slice(-1)); toOwn = toOwn.slice(0, -1); }
      else { sitOut.push(...toPartner.slice(-1)); toPartner = toPartner.slice(0, -1); }
    }
    // Move the excess across so both sides are equal; `pairsPossible` is each side's size.
    const both = [...toOwn, ...toPartner];
    const ownersFirst = toOwn.length;
    owners = both.slice(0, Math.min(ownersFirst, pairsPossible));
    if (owners.length < pairsPossible) owners = both.slice(0, pairsPossible);
    partners = both.slice(owners.length);
  } else {
    const order = bySitOuts(holders);
    if (holders.length % 2 === 1) sitOut.push(...order.slice(0, 1));
    const mixed = shuffled(holders.length % 2 === 1 ? order.slice(1) : order, rand);
    owners = mixed.slice(0, pairsPossible);
    partners = mixed.slice(pairsPossible);
  }
  return { pairs: matchPairs(owners, partners, t, previous, rand), sitOut };
}

function applyRound(t: Tally, round: PlannedRound, roundNo: number): Tally {
  const part = half(roundNo);
  const next: Tally = {
    met: new Set(t.met),
    ownedByPart: { first: new Set(t.ownedByPart.first), second: new Set(t.ownedByPart.second) },
    sitOuts: new Map(t.sitOuts),
  };
  for (const [o, p] of round.pairs) {
    next.ownedByPart[part].add(o);
    next.met.add(key(o, p));
  }
  for (const s of round.sitOut) next.sitOuts.set(s, (next.sitOuts.get(s) ?? 0) + 1);
  return next;
}

function score(start: Tally, plan: PlannedRound[], firstRoundNo: number, holders: string[], previous: Set<string>): number {
  let t = start;
  let cost = 0;
  plan.forEach((round, i) => {
    const roundNo = firstRoundNo + i;
    for (const [o, p] of round.pairs) {
      if (t.met.has(key(o, p))) cost += 1e6;
      if (previous.has(key(o, p))) cost += 1;
    }
    for (const s of round.sitOut) if ((t.sitOuts.get(s) ?? 0) > 0) cost += 1e2;
    t = applyRound(t, round, roundNo);
  });
  const lastRound = firstRoundNo + plan.length - 1;
  if (lastRound >= 2) cost += 1e4 * holders.filter(h => !t.ownedByPart.first.has(h) && firstRoundNo <= 2).length;
  if (lastRound >= 4) cost += 1e4 * holders.filter(h => !t.ownedByPart.second.has(h)).length;
  return cost;
}

/** Random restarts over the whole remaining session; the first plan that breaks nothing wins. */
function bestPlan(holders: string[], roundNo: number, start: Tally, previous: Set<string>, rand: () => number): PlannedRound[] {
  const horizon = Math.max(0, ROUNDS_IN_SESSION - roundNo);
  let best: PlannedRound[] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < ATTEMPTS && bestScore > 0; attempt++) {
    const plan: PlannedRound[] = [];
    let t = start;
    for (let i = 0; i <= horizon; i++) {
      const round = planOneRound(holders, roundNo + i, t, previous, rand);
      plan.push(round);
      t = applyRound(t, round, roundNo + i);
    }
    const s = score(start, plan, roundNo, holders, previous);
    if (s < bestScore) {
      best = plan;
      bestScore = s;
    }
  }
  return best;
}

/** Owners, partners and observers as seats. Observers go to the emptiest table, never more than two; the rest are named. */
function seatRound(round: PlannedRound, observers: string[], rand: () => number): { seats: Seat[]; unseated: string[] } {
  const seats: Seat[] = [];
  round.pairs.forEach(([owner, partner], i) => {
    seats.push({ id: owner, table: i + 1, role: 'first' }, { id: partner, table: i + 1, role: 'second' });
  });
  const atTable = round.pairs.map(() => 0);
  const unseated: string[] = [];
  for (const person of [...round.sitOut, ...shuffled(observers, rand)]) {
    let target = -1;
    atTable.forEach((n, i) => {
      if (n < MAX_OBSERVERS_PER_TABLE && (target < 0 || n < atTable[target])) target = i;
    });
    if (target < 0) {
      unseated.push(person);
      continue;
    }
    atTable[target]++;
    seats.push({ id: person, table: target + 1, role: 'observer' });
  }
  return { seats, unseated };
}

/** What this round breaks, plus who the plan knows will not own in a part, so the host decides early. */
function namedBreaks(start: Tally, plan: PlannedRound[], roundNo: number, holders: string[], previous: Set<string>): UnmetRule[] {
  const unmet: UnmetRule[] = [];
  const round = plan[0];
  for (const [o, p] of round.pairs) {
    if (start.met.has(key(o, p))) unmet.push({ rule: 'repeat-partner', people: [o, p] });
    if (previous.has(key(o, p))) unmet.push({ rule: 'previous-session-partner', people: [o, p] });
  }
  for (const s of round.sitOut) if ((start.sitOuts.get(s) ?? 0) > 0) unmet.push({ rule: 'observes-twice', person: s });
  let t = start;
  plan.forEach((r, i) => { t = applyRound(t, r, roundNo + i); });
  if (roundNo <= 2) for (const h of holders) if (!t.ownedByPart.first.has(h)) unmet.push({ rule: 'owns-once', person: h, part: 'first' });
  if (roundNo <= ROUNDS_IN_SESSION) for (const h of holders) if (!t.ownedByPart.second.has(h)) unmet.push({ rule: 'owns-once', person: h, part: 'second' });
  return unmet;
}

/** Seat the next round. Only the next round is returned; the later ones exist to keep it feasible. */
export function planMastermindRound(input: MastermindSeatingInput): MastermindSeatingPlan {
  const { holders, observers, history, seed } = input;
  const previous = new Set((input.previousPartners ?? []).map(([a, b]) => key(a, b)));
  const roundNo = history.length + 1;
  const start = tallyHistory(history);
  const rand = rng(`${seed}:${roundNo}`);

  if (holders.length < MIN_CANVASES_FOR_A_TABLE) {
    const unseated: UnmetRule[] = [...holders, ...observers].map(person => ({ rule: 'unseated', person }));
    return { seats: [], unmet: [{ rule: 'too-few-canvases', canvases: holders.length }, ...unseated] };
  }
  const tooFew: UnmetRule[] = holders.length < RECOMMENDED_MIN_CANVASES ? [{ rule: 'too-few-canvases', canvases: holders.length }] : [];
  const plan = bestPlan(holders, roundNo, start, previous, rand);
  const { seats, unseated } = seatRound(plan[0], observers, rand);
  const named: UnmetRule[] = unseated.map(person => ({ rule: 'unseated', person }));
  return { seats, unmet: [...tooFew, ...named, ...namedBreaks(start, plan, roundNo, holders, previous)] };
}
