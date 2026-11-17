/**
 * @file dynamics.ts
 * @description Population dynamics for the P1702 model.
 *
 * 1. Low-mutation limit (Fudenberg & Imhof 2006): exact fixation probabilities under the pairwise
 *    comparison (Fermi) process in a well-mixed population of N, then the stationary distribution of the
 *    embedded chain over monomorphic states. Valid only with no committed players.
 * 2. Agent-based Fermi imitation with committed players (zealots): committed agents never update but are
 *    visible and can be imitated (Cardillo & Masuda 2020 zealot rule). Well-mixed or on a graph.
 */

import type { Rng } from './prng';

function logAddExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

/**
 * log of the probability that one i-mutant takes over a resident j-population of size N under the Fermi
 * pairwise comparison rule with selection strength beta. No self-interaction.
 *   rho = 1 / (1 + sum_{l=1}^{N-1} prod_{k=1}^{l} exp(-beta (pi_i(k) - pi_j(k))))
 */
export function logFixation(aii: number, aij: number, aji: number, ajj: number, N: number, beta: number): number {
  let logSum = 0; // the leading "1"
  let cum = 0;
  for (let k = 1; k <= N - 1; k++) {
    const pi = ((k - 1) * aii + (N - k) * aij) / (N - 1);
    const pj = (k * aji + (N - k - 1) * ajj) / (N - 1);
    cum += -beta * (pi - pj);
    logSum = logAddExp(logSum, cum);
  }
  return -logSum;
}

/**
 * Stationary distribution of the low-mutation embedded chain. Transition j -> i (i != j) has rate
 * rho(i invades j) / (n - 1). Solved with the Grassmann-Taksar-Heyman algorithm, which needs no
 * subtraction and stays accurate when fixation probabilities underflow toward zero.
 */
export function stationary(pay: number[][], N: number, beta: number): number[] {
  return stationaryLog(pay, N, beta).map((v) => Math.exp(v));
}

/** Natural-log stationary abundances: finite even where the abundances themselves underflow to 0. */
export function stationaryLog(pay: number[][], N: number, beta: number): number[] {
  if (!Number.isInteger(N) || N < 2) throw new Error(`stationary: N must be an integer >= 2 (got ${N})`);
  if (!Number.isFinite(beta) || beta < 0) throw new Error(`stationary: beta must be finite and >= 0 (got ${beta})`);
  const n = pay.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(-Infinity));
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      // The uniform 1/(n-1) mutation factor cancels in the stationary vector.
      L[j][i] = logFixation(pay[i][i], pay[i][j], pay[j][i], pay[j][j], N, beta);
    }
  return gthLogNorm(L);
}

/**
 * GTH carried out on log-weights, so that fixation probabilities far below the double range (strong
 * selection: log rho of order -10^3) are still ranked correctly instead of underflowing to 0.
 */
export function gthLog(Lin: number[][]): number[] {
  return gthLogNorm(Lin).map((v) => Math.exp(v));
}

/** gthLog, returning normalized LOG stationary weights. */
export function gthLogNorm(Lin: number[][]): number[] {
  const n = Lin.length;
  const L = Lin.map((r) => r.slice());
  for (let k = n - 1; k > 0; k--) {
    let ls = -Infinity;
    for (let j = 0; j < k; j++) ls = logAddExp(ls, L[k][j]);
    // A state with no exit to lower states makes -Inf - (-Inf) = NaN below: the chain is reducible.
    if (!Number.isFinite(ls)) throw new Error(`gthLog: state ${k} has no transition to states 0..${k - 1} (log weight ${ls}); chain is reducible`);
    for (let i = 0; i < k; i++) L[i][k] -= ls;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) if (i !== j) L[i][j] = logAddExp(L[i][j], L[i][k] + L[k][j]);
  }
  const lx = new Array<number>(n).fill(-Infinity);
  lx[0] = 0;
  for (let k = 1; k < n; k++) {
    let v = -Infinity;
    for (let i = 0; i < k; i++) v = logAddExp(v, lx[i] + L[i][k]);
    lx[k] = v;
  }
  let tot = -Infinity;
  for (const v of lx) tot = logAddExp(tot, v);
  return lx.map((v) => v - tot);
}

/** GTH: stationary vector of a chain given its off-diagonal transition weights. */
export function gth(Pin: number[][]): number[] {
  const n = Pin.length;
  const P = Pin.map((r) => r.slice());
  for (let k = n - 1; k > 0; k--) {
    let s = 0;
    for (let j = 0; j < k; j++) s += P[k][j];
    if (s === 0) {
      // State k cannot leave to lower states: treat as reached only from below; keep it absorbing-safe.
      s = Number.MIN_VALUE;
    }
    for (let i = 0; i < k; i++) P[i][k] /= s;
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) if (i !== j) P[i][j] += P[i][k] * P[k][j];
  }
  const x = new Array<number>(n).fill(0);
  x[0] = 1;
  for (let k = 1; k < n; k++) {
    let v = 0;
    for (let i = 0; i < k; i++) v += x[i] * P[i][k];
    x[k] = v;
  }
  const tot = x.reduce((a, b) => a + b, 0);
  return x.map((v) => v / tot);
}

/** Random regular graph by the configuration model with rejection of self-loops and multi-edges. */
export function randomRegularGraph(N: number, k: number, rng: Rng): number[][] {
  if (!Number.isInteger(N) || !Number.isInteger(k) || k < 1 || k >= N || (N * k) % 2 !== 0)
    throw new Error(`randomRegularGraph: need integers 1 <= k < N with N*k even (got N=${N}, k=${k})`);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const stubs: number[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < k; j++) stubs.push(i);
    for (let i = stubs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [stubs[i], stubs[j]] = [stubs[j], stubs[i]];
    }
    const adj: Set<number>[] = Array.from({ length: N }, () => new Set<number>());
    let ok = true;
    for (let e = 0; e < stubs.length; e += 2) {
      const u = stubs[e], v = stubs[e + 1];
      if (u === v || adj[u].has(v)) { ok = false; break; }
      adj[u].add(v);
      adj[v].add(u);
    }
    if (ok) return adj.map((s) => [...s]);
  }
  throw new Error('randomRegularGraph: failed to build a simple graph');
}

export interface AbmOptions {
  /** pay[s][t], coop[s][t] over the full strategy index space. */
  pay: number[][];
  coop: number[][];
  /** Strategies a normal agent may explore into. */
  pool: number[];
  committed: number;
  f: number;
  N: number;
  /** null = well-mixed (everyone meets everyone); otherwise an adjacency list. */
  graph: number[][] | null;
  beta: number;
  mu: number;
  mcs: number;
  burn: number;
  /** Initial strategy of every normal agent, or -1 for uniform random over the pool. */
  init: number;
  rng: Rng;
  /**
   * Whether normal agents may copy committed agents (default true, the Cardillo & Masuda zealot rule).
   * false: a committed role model is skipped (the update attempt is spent), so normals only ever hold
   * pool strategies — the setting in which committed players act purely as a fixed environment.
   */
  imitateCommitted?: boolean;
}

export interface AbmResult {
  /** Time-averaged cooperation rate of normal agents' moves (in all their encounters). */
  coopNormals: number;
  /** Time-averaged cooperation rate of all moves, committed included. */
  coopAll: number;
  /** Time-averaged share of each strategy among normal agents. */
  shares: number[];
}

/** Mutable population state shared by the ABM helpers. */
interface Pop {
  o: AbmOptions;
  S: number;
  N: number;
  strat: Int32Array;
  isCommitted: Uint8Array;
  normals: number[];
  cnt: Float64Array;
  cntNormal: Float64Array;
  /** Adjacency list, or null when well-mixed. */
  graph: number[][] | null;
}

function validateAbmIndices(o: AbmOptions): void {
  const S = o.pay.length;
  const okIdx = (k: number) => Number.isInteger(k) && k >= 0 && k < S;
  if (!o.pool.every(okIdx) || !okIdx(o.committed) || !(o.init === -1 || okIdx(o.init)))
    throw new Error(`runAbm: strategy index out of range 0..${S - 1} (pool ${o.pool}, committed ${o.committed}, init ${o.init})`);
}

function validateAbm(o: AbmOptions): void {
  const bad = (m: string) => { throw new Error(`runAbm: ${m}`); };
  if (!Number.isInteger(o.N) || o.N < 2) bad(`N must be an integer > 1 (got ${o.N})`);
  if (!Number.isInteger(o.mcs) || !Number.isInteger(o.burn) || o.burn < 0 || o.burn >= o.mcs)
    bad(`need integers 0 <= burn < mcs (got burn ${o.burn}, mcs ${o.mcs})`);
  if (!(o.f >= 0 && o.f <= 1)) bad(`f must be in [0,1] (got ${o.f})`);
  if (!(o.mu >= 0 && o.mu <= 1)) bad(`mu must be in [0,1] (got ${o.mu})`);
  if (o.pool.length === 0) bad('pool is empty');
  if (!Number.isFinite(o.beta)) bad(`beta must be finite (got ${o.beta})`);
  validateAbmIndices(o);
  if (o.graph !== null && o.graph.length !== o.N) bad(`graph has ${o.graph.length} nodes, N is ${o.N}`);
  if (o.graph !== null && o.graph.some((nb) => nb.length === 0)) bad('graph has an isolated node');
}

/** Committed agents occupy a random subset; everyone else starts at `init` (or uniform over the pool). */
function placeAgents(o: AbmOptions): Pop {
  const N = o.N, S = o.pay.length;
  const nCommitted = Math.round(o.f * N);
  const strat = new Int32Array(N);
  const isCommitted = new Uint8Array(N);
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(o.rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let t = 0; t < N; t++) {
    const i = order[t];
    if (t < nCommitted) {
      isCommitted[i] = 1;
      strat[i] = o.committed;
    } else {
      strat[i] = o.init >= 0 ? o.init : o.pool[Math.floor(o.rng() * o.pool.length)];
    }
  }
  const normals: number[] = [];
  for (let i = 0; i < N; i++) if (!isCommitted[i]) normals.push(i);
  const cnt = new Float64Array(S);
  const cntNormal = new Float64Array(S);
  for (let i = 0; i < N; i++) {
    cnt[strat[i]]++;
    if (!isCommitted[i]) cntNormal[strat[i]]++;
  }
  return { o, S, N, strat, isCommitted, normals, cnt, cntNormal, graph: o.graph };
}

/** Well-mixed: expected value of row s of `mat` against everyone else (no self-interaction). */
function wmAverage(P: Pop, mat: number[][], s: number): number {
  let v = 0;
  for (let t = 0; t < P.S; t++) if (P.cnt[t] > 0) v += P.cnt[t] * mat[s][t];
  return (v - mat[s][s]) / (P.N - 1);
}

/** Graph: average of row strat[i] of `mat` over i's neighbours. */
function nbAverage(P: Pop, nb: number[], mat: number[][], i: number): number {
  let v = 0;
  for (let x = 0; x < nb.length; x++) v += mat[P.strat[i]][P.strat[nb[x]]];
  return v / nb.length;
}

function payoffOf(P: Pop, i: number): number {
  return P.graph === null ? wmAverage(P, P.o.pay, P.strat[i]) : nbAverage(P, P.graph[i], P.o.pay, i);
}

/** Cooperation of normals and of everyone at this instant: [normals sum, all sum]. */
function coopNow(P: Pop): [number, number] {
  let cn = 0, ca = 0;
  if (P.graph === null) {
    // Expected cooperation of a type-s agent against everyone else.
    for (let s = 0; s < P.S; s++) {
      if (P.cnt[s] === 0) continue;
      const per = wmAverage(P, P.o.coop, s);
      ca += P.cnt[s] * per;
      cn += P.cntNormal[s] * per;
    }
    return [cn, ca];
  }
  for (let i = 0; i < P.N; i++) {
    const v = nbAverage(P, P.graph[i], P.o.coop, i);
    ca += v;
    if (!P.isCommitted[i]) cn += v;
  }
  return [cn, ca];
}

/** A random role model for agent i: a uniform other agent, or a uniform neighbour on a graph. */
function pickModel(P: Pop, i: number): number {
  if (P.graph === null) {
    let j = Math.floor(P.o.rng() * (P.N - 1));
    if (j >= i) j++;
    return j;
  }
  const nb = P.graph[i];
  return nb[Math.floor(P.o.rng() * nb.length)];
}

/** The strategy agent i would switch to in one update attempt, or -1 for no switch. */
function proposal(P: Pop, i: number): number {
  const o = P.o;
  if (o.rng() < o.mu) return o.pool[Math.floor(o.rng() * o.pool.length)];
  const j = pickModel(P, i);
  if (P.isCommitted[j] && o.imitateCommitted === false) return -1;
  if (P.strat[j] === P.strat[i]) return -1;
  const pi = payoffOf(P, i), pj = payoffOf(P, j);
  if (o.rng() >= 1 / (1 + Math.exp(-o.beta * (pj - pi)))) return -1;
  return P.strat[j];
}

/** One update attempt by a uniformly chosen normal agent. */
function updateOnce(P: Pop): void {
  const i = P.normals[Math.floor(P.o.rng() * P.normals.length)];
  const ns = proposal(P, i);
  if (ns < 0 || ns === P.strat[i]) return;
  P.cnt[P.strat[i]]--; P.cntNormal[P.strat[i]]--;
  P.strat[i] = ns;
  P.cnt[ns]++; P.cntNormal[ns]++;
}

/**
 * Agent-based Fermi imitation with committed agents. One Monte Carlo step = N_normal update attempts.
 * An update: pick a random normal agent i; with probability mu it switches to a uniformly random pool
 * strategy; otherwise it picks a random partner j (any agent, committed included: in the well-mixed case a
 * uniform other agent, on a graph a uniform neighbour) and copies j's strategy with probability
 * 1 / (1 + exp(-beta (pi_j - pi_i))). Payoffs are exact expected per-round payoffs averaged over all
 * partners (well-mixed) or neighbours (graph).
 */
export function runAbm(o: AbmOptions): AbmResult {
  validateAbm(o);
  const P = placeAgents(o);
  const nNormal = P.normals.length;
  const shares = new Array<number>(P.S).fill(0);
  if (nNormal === 0) return { coopNormals: NaN, coopAll: NaN, shares };
  let coopN = 0, coopA = 0, samples = 0;
  for (let step = 0; step < o.mcs; step++) {
    for (let u = 0; u < nNormal; u++) updateOnce(P);
    if (step < o.burn) continue;
    const [cn, ca] = coopNow(P);
    coopN += cn / nNormal;
    coopA += ca / P.N;
    for (let s = 0; s < P.S; s++) shares[s] += P.cntNormal[s] / nNormal;
    samples++;
  }
  return { coopNormals: coopN / samples, coopAll: coopA / samples, shares: shares.map((v) => v / samples) };
}
