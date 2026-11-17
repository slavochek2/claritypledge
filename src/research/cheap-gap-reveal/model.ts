/**
 * @file model.ts
 * @description P1702 model of record: a repeated donation game with two separate error sources and
 * costly checks, solved exactly as a finite Markov chain.
 *
 * Game. Each round both players choose C (pay c, partner receives b) or D (nothing). The game continues
 * to another round with probability delta; payoffs are reported PER ROUND, i.e. (1 - delta) times the
 * expected total over the whole encounter (expected length 1 / (1 - delta) rounds).
 *
 * Errors (kept apart, never merged):
 *  - slip (epsS): the intended move is executed as its opposite. A player knows its own realized move.
 *  - misreading (epsM): before acting, the player misreads the partner's previous realized move and acts
 *    (and updates its memory) as if it were the opposite. This is the "error in understanding" of
 *    Boerlijst, Nowak & Sigmund 1997 (J. Theor. Biol. 185:281), who use that term for misperceiving the
 *    other's previous move. Round 1 has no previous move, so no misreading there.
 *
 * Checks. Available only in a "checkable" encounter (a share m of encounters; mixing over m is done by the
 * caller). RULE (fixed throughout): a checking strategy checks in an encounter only if the encounter is
 * checkable AND the partner is willing (is itself a checker, or displays the badge). Each checker pays its
 * own cost and fixes its own misreadings. The cost is charged on EVERY move of a checkable encounter with a
 * willing partner, including round 1 (conservative against the checker).
 *  - PARA (always-paraphrase): pays r per move; a misreading is removed with probability q.
 *  - GAP (gap-reveal-then-bridge): pays d per move; a detector flags an actual misreading with probability
 *    s and a non-misreading with probability a (false alarm); on a flag it pays r, and a flagged actual
 *    misreading is fixed with probability q. Expected cost per move: d + r * (epsM*s + (1-epsM)*a).
 *  - CTRL (equivalence control): pays exactly GAP's expected cost per move and receives the SAME expected
 *    reduction in total error (epsM*s*q), spread untargeted over slips and misreadings in proportion to
 *    their rates.
 *
 * All checker strategies use TFT as their base rule (verification instead of forgiveness, per the
 * conjecture). Outside checks they are plain TFT.
 */

export * from './strategies';
export * from './solver';

import { STRATEGIES, type Act, type Params, type Strategy } from './strategies';
import { apologises, makePair, perceive, roundPay, solvePair, type MatchResult, type Pair } from './solver';

/** Exact per-round payoffs and cooperation rates of A vs B (see solver.ts). */
export function playExact(A: Strategy, B: Strategy, p: Params, checkable: boolean): MatchResult {
  return solvePair(makePair(A, B, p, checkable));
}

interface McTotals {
  totA: number;
  totB: number;
  coop: number;
  rounds: number;
}

/**
 * Per-move check charges [round 1, later rounds]. Normally the effective cost every move. With
 * costFromRound2, effective() reports the expected per-round cost delta * cost; the simulator charges
 * nothing in round 1 and the full per-move cost afterwards, which has that expectation.
 */
function moveCharges(cost: number, p: Params): [number, number] {
  if (!p.costFromRound2) return [cost, cost];
  return [0, p.delta > 0 ? cost / p.delta : 0];
}

/** One sampled encounter; accumulates A's cooperation into t and returns both totals. */
function sampleEncounter(pr: Pair, rng: () => number, t: McTotals): void {
  const { A, B, p, eA, eB } = pr;
  const [cA1, cA] = moveCharges(eA.cost, p), [cB1, cB] = moveCharges(eB.cost, p);
  let sA = A.init, sB = B.init;
  t.totA = 0;
  t.totB = 0;
  for (let first = true; ; first = false) {
    const iA = (rng() < A.pC(sA, p) ? 1 : 0) as Act;
    const iB = (rng() < B.pC(sB, p) ? 1 : 0) as Act;
    const aA = (rng() < (first ? eA.slip1 : eA.slip) ? 1 - iA : iA) as Act;
    const aB = (rng() < (first ? eB.slip1 : eB.slip) ? 1 - iB : iB) as Act;
    const apA = apologises(A, iA, aA), apB = apologises(B, iB, aB);
    const [payA, payB] = roundPay(p, aA, aB, apA, apB, first ? cA1 : cA, first ? cB1 : cB);
    t.totA += payA;
    t.totB += payB;
    t.coop += aA;
    t.rounds++;
    const seenA = perceive(aB, rng() < eA.mis ? 1 : 0, apB, A.acceptsApology);
    const seenB = perceive(aA, rng() < eB.mis ? 1 : 0, apA, B.acceptsApology);
    sA = A.next(sA, aA, seenA);
    sB = B.next(sB, aB, seenB);
    if (rng() >= p.delta) break;
  }
}

/**
 * Monte Carlo version of the same game, used only to validate playExact. Returns per-encounter
 * per-round payoff averaged over `games` encounters, with standard errors.
 */
export function playMonteCarlo(
  A: Strategy,
  B: Strategy,
  p: Params,
  checkable: boolean,
  games: number,
  rng: () => number,
): { payA: number; payB: number; seA: number; seB: number; coopA: number } {
  const pr = makePair(A, B, p, checkable);
  let sum = 0, sum2 = 0, sumB = 0, sumB2 = 0;
  const t: McTotals = { totA: 0, totB: 0, coop: 0, rounds: 0 };
  for (let g = 0; g < games; g++) {
    // An encounter's per-round payoff estimate: total / expected length is unbiased for (1-delta)*E[total].
    sampleEncounter(pr, rng, t);
    const xA = t.totA * (1 - p.delta), xB = t.totB * (1 - p.delta);
    sum += xA; sum2 += xA * xA; sumB += xB; sumB2 += xB * xB;
  }
  const mA = sum / games, mB = sumB / games;
  return {
    payA: mA,
    payB: mB,
    seA: Math.sqrt((sum2 / games - mA * mA) / games),
    seB: Math.sqrt((sumB2 / games - mB * mB) / games),
    coopA: t.coop / t.rounds,
  };
}

/** m, the share of checkable encounters, is a probability. */
function validateShare(m: number): void {
  if (!(m >= 0 && m <= 1)) throw new Error(`m (checkable share) must be in [0,1] (got ${m})`);
}

export interface Matrices {
  ids: string[];
  /** pay[i][j] = per-round payoff of i against j. */
  pay: number[][];
  /** coop[i][j] = per-round cooperation rate of i against j. */
  coop: number[][];
}

/** Payoff and cooperation matrices for a list of strategies, mixing checkable (share m) and plain encounters. */
export function buildMatrices(ids: string[], p: Params, m: number): Matrices {
  validateShare(m);
  const unknown = ids.filter((id) => !(id in STRATEGIES));
  if (unknown.length > 0) throw new Error(`buildMatrices: unknown strategy id(s) ${unknown.join(', ')}`);
  const n = ids.length;
  const pay = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const coop = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const A = STRATEGIES[ids[i]], B = STRATEGIES[ids[j]];
      const u = m < 1 ? playExact(A, B, p, false) : null;
      const k = m > 0 ? playExact(A, B, p, true) : null;
      const mix = (f: (r: MatchResult) => number) => (u ? (1 - m) * f(u) : 0) + (k ? m * f(k) : 0);
      pay[i][j] = mix((r) => r.payA);
      pay[j][i] = mix((r) => r.payB);
      coop[i][j] = mix((r) => r.coopA);
      coop[j][i] = mix((r) => r.coopB);
    }
  }
  return { ids, pay, coop };
}

/** Mix two pre-computed matrix sets (plain, checkable) with weight m on the checkable one. */
export function mixMatrices(plain: Matrices, checkable: Matrices, m: number): Matrices {
  validateShare(m);
  if (plain.ids.join() !== checkable.ids.join()) throw new Error('mixMatrices: the two matrix sets have different strategy ids');
  const pay = plain.pay.map((row, i) => row.map((v, j) => (1 - m) * v + m * checkable.pay[i][j]));
  const coop = plain.coop.map((row, i) => row.map((v, j) => (1 - m) * v + m * checkable.coop[i][j]));
  return { ids: plain.ids, pay, coop };
}
