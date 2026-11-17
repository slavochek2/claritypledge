/**
 * @file solver.ts
 * @description P1702 exact solver: effective error rates and check costs per encounter, the joint
 * memory-state Markov kernel of one round, and the discounted occupancy solve. Game definitions: model.ts.
 */
import { C, D, validateParams, type Act, type Params, type Strategy } from './strategies';

/** GAP's expected cost per checked move. */
export function gapCost(p: Params): number {
  return p.d + p.r * (p.epsM * p.s + (1 - p.epsM) * p.a);
}

export interface Effective {
  /** Slip rate from round 2 on. */
  slip: number;
  /** Slip rate in round 1. Differs from `slip` only for CTRL (see effective()). */
  slip1: number;
  mis: number;
  /** Check cost per move (charged every round of the encounter). */
  cost: number;
}

/**
 * Error rates and per-move check cost that player `me` actually faces against `partner`.
 *
 * CTRL matching. GAP can only repair a misreading, and a misreading only exists from round 2 on (it is a
 * misreading of the previous move). So GAP's expected cut in own error events is 0 in round 1 and
 * epsM*s*q in every later round. CTRL takes the same cut epsM*s*q from round 2 on, split over slips and
 * misreadings in proportion to their rates (factor k = epsM s q / (epsS + epsM) on both), and NO cut in
 * round 1, where it slips at the plain rate. Per round the expected error events then match exactly:
 * round 1, both epsS; round t >= 2, GAP epsS + epsM(1 - sq) and CTRL (epsS + epsM)(1 - k), which are
 * equal. Matching every round means matching under any discounting.
 */
export function effective(me: Strategy, partner: Strategy, p: Params, checkable: boolean): Effective {
  const plain = { slip: p.epsS, slip1: p.epsS, mis: p.epsM, cost: 0 };
  const active = checkable && me.check !== 'none' && partner.willing;
  if (!active) return plain;
  const e = activeRates(me, p, plain);
  // Charging only from round 2 on: (1 - delta) * sum_{t>=1} delta^t cost = delta * cost per round.
  return p.costFromRound2 ? { ...e, cost: p.delta * e.cost } : e;
}

/**
 * CTRL_M, the misreading-only control: an untargeted cut of the same expected size epsM*s*q, applied
 * to misreadings only. Misreadings are i.i.d. here, so "untargeted" and "targeted at detected
 * misreadings" give the same rate: CTRL_M is GAP by construction (up to rounding).
 */
function activeRates(me: Strategy, p: Params, plain: Effective): Effective {
  switch (me.check) {
    case 'para':
      return { ...plain, mis: p.epsM * (1 - p.q), cost: p.r };
    case 'gap':
      return { ...plain, mis: p.epsM * (1 - p.s * p.q), cost: gapCost(p) };
    case 'ctrl': {
      const tot = p.epsS + p.epsM;
      const k = tot > 0 ? (p.epsM * p.s * p.q) / tot : 0;
      return { slip: p.epsS * (1 - k), slip1: p.epsS, mis: p.epsM * (1 - k), cost: gapCost(p) };
    }
    case 'ctrlm':
      return { ...plain, mis: p.epsM - p.epsM * p.s * p.q, cost: gapCost(p) };
    default:
      return plain;
  }
}

export interface MatchResult {
  payA: number;
  payB: number;
  /** Per-round rate of realized cooperation. */
  coopA: number;
  coopB: number;
}

/** Both players of one encounter with their effective rates. */
export interface Pair {
  A: Strategy;
  B: Strategy;
  p: Params;
  eA: Effective;
  eB: Effective;
}

/** One round's transition matrix over joint states plus expected per-state payoffs and cooperation. */
interface Kernel {
  n: number;
  nB: number;
  M: Float64Array;
  piA: Float64Array;
  piB: Float64Array;
  cA: Float64Array;
  cB: Float64Array;
}

const bern = (bit: number, prob: number) => (bit ? prob : 1 - prob);

/** Sincere apology follows one's own slip from C; a fake apologiser apologises after every D. */
export function apologises(S: Strategy, intended: number, realized: Act): boolean {
  return (S.apology === 'sincere' && intended === C && realized === D) || (S.apology === 'fake' && realized === D);
}

/** Per-round payoffs of A and B, with apology transfers and optional per-move check costs. */
export function roundPay(p: Params, aA: Act, aB: Act, apA: boolean, apB: boolean, costA = 0, costB = 0): [number, number] {
  let payA = p.b * aB - p.c * aA - costA, payB = p.b * aA - p.c * aB - costB;
  if (apA) { payA -= p.gamma; payB += p.gamma; }
  if (apB) { payB -= p.gamma; payA += p.gamma; }
  return [payA, payB];
}

/**
 * What a player records of the partner's realized move. ASSUMPTION: an accepted apology overrides a
 * misreading (an apologised D is always read as C), so the apology channel itself is noiseless.
 */
export function perceive(actual: Act, misread: number, apologised: boolean, accepts: boolean): Act {
  if (apologised && accepts) return C;
  return (misread ? 1 - actual : actual) as Act;
}

/** One realized round (after intentions and slips) at joint state st. */
interface Outcome {
  st: number;
  sA: number;
  sB: number;
  aA: Act;
  aB: Act;
  apA: boolean;
  apB: boolean;
  w0: number;
}

function addTransitions(k: Kernel, pr: Pair, o: Outcome): void {
  for (let mA = 0; mA < 2; mA++) {
    const wmA = bern(mA, pr.eA.mis);
    if (wmA === 0) continue;
    for (let mB = 0; mB < 2; mB++) {
      const wmB = bern(mB, pr.eB.mis);
      if (wmB === 0) continue;
      const seenA = perceive(o.aB, mA, o.apB, pr.A.acceptsApology); // A's reading of B's move
      const seenB = perceive(o.aA, mB, o.apA, pr.B.acceptsApology);
      const nsA = pr.A.next(o.sA, o.aA, seenA), nsB = pr.B.next(o.sB, o.aB, seenB);
      k.M[o.st * k.n + nsA * k.nB + nsB] += o.w0 * wmA * wmB;
    }
  }
}

function addOutcome(k: Kernel, pr: Pair, o: Outcome): void {
  const [payA, payB] = roundPay(pr.p, o.aA, o.aB, o.apA, o.apB);
  k.piA[o.st] += o.w0 * payA;
  k.piB[o.st] += o.w0 * payB;
  k.cA[o.st] += o.w0 * o.aA;
  k.cB[o.st] += o.w0 * o.aB;
  addTransitions(k, pr, o);
}

/** Enumerate intentions and slips at one joint state. */
function accumulateState(k: Kernel, pr: Pair, sA: number, sB: number, slipA: number, slipB: number): void {
  const st = sA * k.nB + sB;
  const pA = pr.A.pC(sA, pr.p), pB = pr.B.pC(sB, pr.p);
  for (let iA = 0; iA < 2; iA++) {
    const wiA = bern(iA, pA);
    if (wiA === 0) continue;
    for (let iB = 0; iB < 2; iB++) {
      const wiB = bern(iB, pB);
      if (wiB === 0) continue;
      for (let fA = 0; fA < 2; fA++) {
        const wfA = bern(fA, slipA);
        if (wfA === 0) continue;
        for (let fB = 0; fB < 2; fB++) {
          const wfB = bern(fB, slipB);
          if (wfB === 0) continue;
          const aA = (fA ? 1 - iA : iA) as Act;
          const aB = (fB ? 1 - iB : iB) as Act;
          const apA = apologises(pr.A, iA, aA), apB = apologises(pr.B, iB, aB);
          addOutcome(k, pr, { st, sA, sB, aA, aB, apA, apB, w0: wiA * wiB * wfA * wfB });
        }
      }
    }
  }
}

/** The round kernel for given slip rates (misreading rates come from the pair). */
function buildKernel(pr: Pair, slipA: number, slipB: number): Kernel {
  const nA = pr.A.nStates, nB = pr.B.nStates, n = nA * nB;
  const k: Kernel = {
    n, nB, M: new Float64Array(n * n),
    piA: new Float64Array(n), piB: new Float64Array(n), cA: new Float64Array(n), cB: new Float64Array(n),
  };
  for (let sA = 0; sA < nA; sA++) for (let sB = 0; sB < nB; sB++) accumulateState(k, pr, sA, sB, slipA, slipB);
  return k;
}

function swapRows(A: Float64Array, x: Float64Array, n: number, i: number, j: number): void {
  for (let k = 0; k < n; k++) {
    const t = A[i * n + k];
    A[i * n + k] = A[j * n + k];
    A[j * n + k] = t;
  }
  const t = x[i];
  x[i] = x[j];
  x[j] = t;
}

/** Solve x (I - delta M) = v by Gauss-Jordan elimination with partial pivoting on the transpose (n <= 16). */
export function solveOccupancy(M: Float64Array, n: number, delta: number, v: Float64Array): Float64Array {
  // System: (I - delta M)^T x = v
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) A[i * n + j] = (i === j ? 1 : 0) - delta * M[j * n + i];
  const x = Float64Array.from(v);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r * n + col]) > Math.abs(A[piv * n + col])) piv = r;
    if (piv !== col) swapRows(A, x, n, col, piv);
    const d = A[col * n + col];
    if (!(Math.abs(d) > 1e-14)) throw new Error(`solveOccupancy: singular system (pivot ${d} at column ${col}); is delta < 1?`);
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[r * n + k] -= f * A[col * n + k];
      x[r] -= f * x[col];
    }
  }
  for (let i = 0; i < n; i++) x[i] /= A[i * n + i];
  return x;
}

/** sum_i x_i y_i */
function dot(x: Float64Array, y: Float64Array): number {
  let v = 0;
  for (let i = 0; i < x.length; i++) v += x[i] * y[i];
  return v;
}

/** Pair of strategies with their effective rates in one encounter type. */
export function makePair(A: Strategy, B: Strategy, p: Params, checkable: boolean): Pair {
  validateParams(p);
  return { A, B, p, eA: effective(A, B, p, checkable), eB: effective(B, A, p, checkable) };
}

/**
 * Exact per-round payoffs and cooperation rates of A vs B. Enumerates every joint outcome of one round
 * (intentions, slips, apologies, misreadings) to build the transition matrix over joint memory states.
 * When a round-1 slip rate differs from the later one (CTRL only), round 1 gets its own kernel K1:
 * total = pi1(init) + delta * x . pi, with x (I - delta M) = row init of M1.
 */
export function solvePair(pr: Pair): MatchResult {
  const k = buildKernel(pr, pr.eA.slip, pr.eB.slip);
  const init = pr.A.init * k.nB + pr.B.init;
  const w = 1 - pr.p.delta;
  const sameFirst = pr.eA.slip1 === pr.eA.slip && pr.eB.slip1 === pr.eB.slip;
  if (sameFirst) {
    const e0 = new Float64Array(k.n);
    e0[init] = 1;
    const x = solveOccupancy(k.M, k.n, pr.p.delta, e0);
    const vA = dot(x, k.piA), vB = dot(x, k.piB), kA = dot(x, k.cA), kB = dot(x, k.cB);
    return { payA: w * vA - pr.eA.cost, payB: w * vB - pr.eB.cost, coopA: w * kA, coopB: w * kB };
  }
  const k1 = buildKernel(pr, pr.eA.slip1, pr.eB.slip1);
  const x = solveOccupancy(k.M, k.n, pr.p.delta, k1.M.slice(init * k.n, (init + 1) * k.n));
  const tot = (first: Float64Array, later: Float64Array) => first[init] + pr.p.delta * dot(x, later);
  return {
    payA: w * tot(k1.piA, k.piA) - pr.eA.cost,
    payB: w * tot(k1.piB, k.piB) - pr.eB.cost,
    coopA: w * tot(k1.cA, k.cA),
    coopB: w * tot(k1.cB, k.cB),
  };
}
