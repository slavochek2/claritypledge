/**
 * @file grid.ts
 * @description P1702 strategy pools, the pre-registered parameter grid, and matrix helpers shared by
 * the experiments. The runner passes FULL_GRID; tests pass a tiny grid through the same code.
 */
import { STRATEGIES, playExact, type Matrices, type Params } from './model';

export const ALL = ['ALLC', 'ALLD', 'TFT', 'GTFT', 'TF2T', 'CTFT', 'WSLS', 'PPAV', 'APOLOGY', 'FAKE_APOL', 'FAKER', 'PARA', 'GAP', 'CTRL', 'BADGE', 'CTRL_M'];
export const BASE = ['ALLC', 'ALLD', 'TFT', 'GTFT', 'TF2T', 'CTFT', 'WSLS', 'PPAV', 'PARA', 'GAP'];
export const FULL = [...BASE, 'APOLOGY', 'FAKE_APOL', 'FAKER'];
export const POOLS: Record<string, string[]> = {
  BASE,
  FULL,
  FULL_CTRL: [...FULL, 'CTRL'],
  FULL_SWAP: FULL.map((s) => (s === 'GAP' ? 'CTRL' : s)),
  // POST-HOC (added after run 1): is the refutation an artefact of the Prudent Pavlov approximation?
  FULL_NOPP: FULL.filter((s) => s !== 'PPAV'),
  // Review round: second equivalence control (misreading-only untargeted cut at GAP's cost).
  FULL_CTRLM: [...FULL, 'CTRL_M'],
};

export const idx = (id: string) => ALL.indexOf(id);

export interface Grid {
  /** Population size for the embedded chain. */
  N: number;
  b: number[];
  eps: number[];
  d: number[];
  r: number[];
  q: number[];
  m: number[];
  beta: number[];
  /** Novel prediction: total error levels and misreading shares. */
  epsTotal: number[];
  sigma: number[];
}

/** Pre-registered grid. q: 0.9 +-50%; +50% (1.35) is capped at 1. */
export const FULL_GRID: Grid = {
  N: 100,
  b: [2, 3, 4],
  eps: [0, 0.01, 0.05, 0.1],
  d: [0.05, 0.1, 0.15, 0.25],
  r: [0.5, 1, 2],
  q: [0.45, 0.9, 1.0],
  m: [0.2, 0.5, 1],
  beta: [0.1, 1, 10],
  epsTotal: [0.02, 0.05, 0.1],
  sigma: [0, 0.25, 0.5, 0.75, 1],
};

export function sub(mat: number[][], ids: string[]): number[][] {
  const k = ids.map(idx);
  return k.map((i) => k.map((j) => mat[i][j]));
}

/** Checkable matrices: recompute only pairs where a check can be active; all others equal the plain ones. */
export function checkableFrom(plain: Matrices, p: Params): Matrices {
  const n = ALL.length;
  const pay = plain.pay.map((r) => r.slice());
  const coop = plain.coop.map((r) => r.slice());
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      const A = STRATEGIES[ALL[i]], B = STRATEGIES[ALL[j]];
      const live = (A.check !== 'none' && B.willing) || (B.check !== 'none' && A.willing);
      if (!live) continue;
      const r = playExact(A, B, p, true);
      pay[i][j] = r.payA; pay[j][i] = r.payB;
      coop[i][j] = r.coopA; coop[j][i] = r.coopB;
    }
  return { ids: ALL, pay, coop };
}

/** One CSV table produced by an experiment. */
export interface Table {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

export type Log = (...a: unknown[]) => void;
export const silent: Log = () => undefined;
