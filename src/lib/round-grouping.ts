/**
 * @file round-grouping.ts
 * @description P1337 — group whoever is in the room into tables for the next round.
 *
 * "The grouping is the product, not the seating" (spec §1). Each table seats a PAIR (the one
 * who goes first, the one who goes second) plus zero or more observers. All remaining rounds
 * are planned together and only the next one is returned (§2): planning round 1 without
 * rounds 2-3 in view can leave round 3 with nobody left who still needs to observe.
 *
 * Priorities, enforced as score weights several orders of magnitude apart so a lower one can
 * never buy its way past a higher one:
 *   1. nobody repeats a partner                     — HARD (1e6 per repeat)
 *   2. everyone observes equally (exactly once in the 3-round trio format) — 1e4 · Σ obs²
 *      (the total is fixed by the table layout, so minimising the sum of squares equalises)
 *   3. largest disagreement gap within each pair    — toggle "disagreement gap"
 *   4. recorders at one table                       — toggle "recorders together"
 *   +  table-mates who have not sat together yet    — toggle "haven't met yet"
 * Gap and recorders are deliberately close (30 per gap step, 40 per recorder pair apart): the
 * spec ranks gap first, and also says seating the two or three recorders together "costs the
 * grouping almost nothing" — so it wins only when the gap it costs is small. Recorder pairs
 * are exempt from "haven't met yet": sitting together every round is the point.
 *
 * Deterministic for a given seed: the host's device computes, and a recompute with nothing
 * changed must produce the same tables (no surprise reshuffle on a second tap).
 *
 * Pure — no I/O. Unit-tested in round-grouping.test.ts.
 */

export type SeatRole = 'first' | 'second' | 'observer';

export interface Seat {
  id: string;
  table: number;
  role: SeatRole;
}

export interface GroupingPerson {
  id: string;
  recorder?: boolean;
}

export interface GroupingToggles {
  gap: boolean;
  recorders: boolean;
  unmet: boolean;
}

export const DEFAULT_TOGGLES: GroupingToggles = { gap: true, recorders: true, unmet: true };

export interface GroupingInput {
  people: GroupingPerson[];
  /** Seats of every round already started, oldest first. May include people no longer here. */
  history: Seat[][];
  /** Disagreement between two people; null = no signal (someone skipped the prep). */
  gap: (a: string, b: string) => number | null;
  /** Total rounds in the evening (3). Rounds still to plan = totalRounds − history.length, min 1. */
  totalRounds: number;
  groupSize: 2 | 3 | 4;
  toggles: GroupingToggles;
  seed: string;
}

const W_REPEAT_PARTNER = 1_000_000;
const W_OBSERVE = 10_000;
const W_GAP = 30;
const W_RECORDERS_APART = 40;
const W_MET_BEFORE = 20;

const RESTARTS = 24;
const ITERATIONS_PER_RESTART = 3000;

/** Table layout for n people: how many pairs, and how many observers sit at each pair. */
export function tableLayout(n: number, groupSize: 2 | 3 | 4): number[] {
  if (n < 2) return n === 1 ? [-1] : [];
  const rem = n % groupSize;
  let pairs = Math.floor(n / groupSize) + (rem >= 2 ? 1 : 0);
  pairs = Math.max(1, Math.min(pairs, Math.floor(n / 2)));
  const observers = n - 2 * pairs;
  const perTable = Array.from({ length: pairs }, () => 0);
  for (let i = 0; i < observers; i++) perTable[i % pairs] = (perTable[i % pairs] ?? 0) + 1;
  return perTable;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exchange a[i] and b[j] — written out because the indexed-access checks reject a tuple swap. */
function swapIn<T>(a: T[], i: number, b: T[], j: number): void {
  const t = a[i] as T;
  a[i] = b[j] as T;
  b[j] = t;
}

/** Typed-array read; the index is always in range here, `?? 0` satisfies the indexed-access check. */
const at = (arr: ArrayLike<number>, i: number): number => arr[i] ?? 0;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    swapIn(a, i, a, j);
  }
  return a;
}

/**
 * The search runs on integer indices with precomputed matrices — scoring is called ~70k times
 * per round, and a Map/string-key version took ~1s for fifteen people on a laptop, which is
 * several seconds of a frozen host phone in a room that is waiting.
 */
interface Model {
  n: number;
  gapM: Float64Array;        // n×n, NaN = no signal
  partneredBefore: Uint8Array; // n×n
  metBefore: Uint8Array;     // n×n
  observedBefore: Int32Array;
  isRecorder: Uint8Array;
  recorders: number[];
  toggles: GroupingToggles;
}

function buildModel(input: GroupingInput, ids: string[]): Model {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const gapM = new Float64Array(n * n).fill(NaN);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const g = input.gap(ids[i] ?? '', ids[j] ?? '');
      if (g != null) gapM[i * n + j] = gapM[j * n + i] = g;
    }
  const partneredBefore = new Uint8Array(n * n);
  const metBefore = new Uint8Array(n * n);
  const observedBefore = new Int32Array(n);
  for (const round of input.history) {
    const byTable = new Map<number, Seat[]>();
    for (const s of round) {
      const seats = byTable.get(s.table) ?? [];
      seats.push(s);
      byTable.set(s.table, seats);
      const i = index.get(s.id);
      if (i != null && s.role === 'observer') observedBefore[i] = at(observedBefore, i) + 1;
    }
    for (const seats of byTable.values()) {
      const f = index.get(seats.find(s => s.role === 'first')?.id ?? '');
      const sc = index.get(seats.find(s => s.role === 'second')?.id ?? '');
      if (f != null && sc != null) partneredBefore[f * n + sc] = partneredBefore[sc * n + f] = 1;
      const present = seats.map(s => index.get(s.id)).filter((i): i is number => i != null);
      for (const a of present) for (const b of present) if (a !== b) metBefore[a * n + b] = 1;
    }
  }
  const isRecorder = new Uint8Array(n);
  const recorders: number[] = [];
  if (input.toggles.recorders) {
    input.people.forEach((p, i) => {
      if (p.recorder) {
        isRecorder[i] = 1;
        recorders.push(i);
      }
    });
  }
  return { n, gapM, partneredBefore, metBefore, observedBefore, isRecorder, recorders, toggles: input.toggles };
}

/** One planned round: tables[i] = [first, second, ...observers], as person indices. */
type IdxRound = number[][];

function scorePlan(plan: IdxRound[], m: Model): number {
  const { n, toggles } = m;
  let cost = 0;
  const partnerCount = new Uint8Array(n * n);
  const metCount = toggles.unmet ? new Uint8Array(n * n) : null;
  const observed = Int32Array.from(m.observedBefore);
  const tableOf = new Int32Array(n);

  for (const round of plan) {
    for (let t = 0; t < round.length; t++) {
      const table = round[t] ?? [];
      for (const p of table) tableOf[p] = t;
      if (table.length < 2) continue;
      const a = at(table, 0);
      const b = at(table, 1);
      const pk = a * n + b;
      const prior = at(partnerCount, pk) + at(partnerCount, b * n + a) + at(m.partneredBefore, pk);
      if (prior > 0) cost += W_REPEAT_PARTNER;
      partnerCount[pk] = at(partnerCount, pk) + 1;
      if (toggles.gap) {
        const g = m.gapM[pk] ?? NaN;
        if (g === g) cost -= W_GAP * g;
      }
      for (let i = 2; i < table.length; i++) {
        const o = at(table, i);
        observed[o] = at(observed, o) + 1;
      }
      if (metCount) {
        for (let i = 0; i < table.length; i++)
          for (let j = i + 1; j < table.length; j++) {
            const x = at(table, i);
            const y = at(table, j);
            if (at(m.isRecorder, x) && at(m.isRecorder, y)) continue;
            const k = x < y ? x * n + y : y * n + x;
            if (at(metCount, k) > 0 || at(m.metBefore, k)) cost += W_MET_BEFORE;
            metCount[k] = at(metCount, k) + 1;
          }
      }
    }
    if (m.recorders.length >= 2) {
      for (let i = 0; i < m.recorders.length; i++)
        for (let j = i + 1; j < m.recorders.length; j++)
          if (at(tableOf, at(m.recorders, i)) !== at(tableOf, at(m.recorders, j))) cost += W_RECORDERS_APART;
    }
  }
  for (let i = 0; i < n; i++) cost += W_OBSERVE * at(observed, i) * at(observed, i);
  return cost;
}

function randomRound(n: number, layout: number[], rng: () => number): IdxRound {
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  const round: IdxRound = [];
  let k = 0;
  for (const obs of layout) {
    if (obs < 0) {
      round.push([at(order, k++)]);
      continue;
    }
    round.push(order.slice(k, k + 2 + obs));
    k += 2 + obs;
  }
  return round;
}

/**
 * Plan the remaining rounds and return the seats of the next one. Tables are numbered from 1;
 * a table holding recorders (when that toggle is on) is numbered LAST, so the host can always
 * put the highest number away from the others (§5: recorders sit apart).
 */
export function groupNextRound(input: GroupingInput): Seat[] {
  const ids = input.people.map(p => p.id);
  if (ids.length === 0) return [];
  const layout = tableLayout(ids.length, input.groupSize);
  const roundsToPlan = Math.max(1, input.totalRounds - input.history.length);
  const model = buildModel(input, ids);
  const rng = makeRng(hashSeed(`${input.seed}:${input.history.length}:${[...ids].sort().join(',')}`));

  let best: IdxRound[] = [];
  let bestCost = Infinity;

  for (let r = 0; r < RESTARTS; r++) {
    const plan: IdxRound[] = Array.from({ length: roundsToPlan }, () => randomRound(ids.length, layout, rng));
    let cost = scorePlan(plan, model);
    for (let it = 0; it < ITERATIONS_PER_RESTART; it++) {
      const round = plan[Math.floor(rng() * roundsToPlan)] ?? [];
      const t1 = Math.floor(rng() * round.length);
      const t2 = Math.floor(rng() * round.length);
      const table1 = round[t1] ?? [];
      const table2 = round[t2] ?? [];
      const s1 = Math.floor(rng() * table1.length);
      const s2 = Math.floor(rng() * table2.length);
      if (t1 === t2 && s1 === s2) continue;
      swapIn(table1, s1, table2, s2);
      const next = scorePlan(plan, model);
      if (next <= cost) cost = next;
      else swapIn(table1, s1, table2, s2);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = plan.map(round => round.map(t => [...t]));
    }
  }

  const next = (best[0] ?? []).map(table => table.map(i => ids[i] ?? ''));
  const recorderSet = new Set(model.recorders.map(i => ids[i] ?? ''));
  const ordered = [...next].sort((a, b) => {
    const ra = a.filter(id => recorderSet.has(id)).length;
    const rb = b.filter(id => recorderSet.has(id)).length;
    return ra - rb;
  });

  const seats: Seat[] = [];
  ordered.forEach((table, i) => {
    table.forEach((id, j) => {
      seats.push({ id, table: i + 1, role: j === 0 ? 'first' : j === 1 ? 'second' : 'observer' });
    });
  });
  return seats;
}

/**
 * Disagreement between two people over one set of statements: the furthest-apart statement
 * dominates (that is the one the round screen shows them), the mean breaks ties so two pairs
 * that both hit the maximum once are told apart by how much else they disagree on.
 * null when they share no statement.
 */
export function pairGap(
  a: Map<string, number> | undefined,
  b: Map<string, number> | undefined,
): number | null {
  if (!a || !b) return null;
  let max = -1;
  let sum = 0;
  let n = 0;
  for (const [pointId, va] of a) {
    const vb = b.get(pointId);
    if (vb == null) continue;
    const g = Math.abs(va - vb);
    if (g > max) max = g;
    sum += g;
    n += 1;
  }
  if (n === 0) return null;
  return max + sum / n / 10;
}

/** A swap two names by hand (variant A): exchange their table AND role. */
export function swapSeats(seats: Seat[], a: string, b: string): Seat[] {
  const sa = seats.find(s => s.id === a);
  const sb = seats.find(s => s.id === b);
  if (!sa || !sb || a === b) return seats;
  return seats.map(s =>
    s.id === a ? { ...s, table: sb.table, role: sb.role } : s.id === b ? { ...s, table: sa.table, role: sa.role } : s,
  );
}
