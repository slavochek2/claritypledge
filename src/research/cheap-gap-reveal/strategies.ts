/**
 * @file strategies.ts
 * @description P1702 game parameters and the strategy set. The game, error and check definitions are
 * documented in model.ts; the exact solver lives in solver.ts.
 */

export type Act = 0 | 1;
export const C: Act = 1;
export const D: Act = 0;

export interface Params {
  b: number;
  c: number;
  delta: number;
  epsS: number;
  epsM: number;
  d: number;
  r: number;
  s: number;
  a: number;
  q: number;
  /** Apology payment, transferred to the partner. */
  gamma: number;
  /**
   * POST-HOC sensitivity (review round): charge check costs only from round 2 on, i.e. per-round cost
   * delta * cost instead of cost. Default (undefined/false): charged every move, round 1 included.
   */
  costFromRound2?: boolean;
}

export const DEFAULT_PARAMS: Params = {
  b: 3,
  c: 1,
  delta: 0.9,
  epsS: 0.01,
  epsM: 0.05,
  d: 0.1,
  r: 1,
  s: 0.9,
  a: 0.1,
  q: 0.9,
  gamma: 1,
};

export type CheckKind = 'none' | 'para' | 'gap' | 'ctrl' | 'ctrlm';
export type ApologyKind = 'none' | 'sincere' | 'fake';

export interface Strategy {
  id: string;
  nStates: number;
  init: number;
  /** Probability of intending C in a state. */
  pC: (state: number, p: Params) => number;
  /** Memory update from own realized move and the (possibly misread) partner move. */
  next: (state: number, own: Act, seen: Act) => number;
  check: CheckKind;
  /** Welcomes being checked (checker or badge-holder). */
  willing: boolean;
  apology: ApologyKind;
  /** Treats an apologised defection as cooperation. */
  acceptsApology: boolean;
}

/** Nowak & Sigmund 1992 generosity: min(1 - (T-R)/(R-S), (R-P)/(T-P)); donation game T=b, R=b-c, S=-c, P=0. */
export function gtftGenerosity(b: number, c: number): number {
  const T = b, R = b - c, S = -c, P = 0;
  return Math.max(0, Math.min(1 - (T - R) / (R - S), (R - P) / (T - P)));
}

const base = { check: 'none' as CheckKind, willing: false, apology: 'none' as ApologyKind, acceptsApology: false };

const tftCore = {
  nStates: 2,
  init: 0,
  pC: (s: number) => (s === 0 ? 1 : 0),
  next: (_s: number, _own: Act, seen: Act) => (seen === C ? 0 : 1),
};

export const STRATEGIES: Record<string, Strategy> = {
  ALLC: { ...base, id: 'ALLC', nStates: 1, init: 0, pC: () => 1, next: () => 0 },
  ALLD: { ...base, id: 'ALLD', nStates: 1, init: 0, pC: () => 0, next: () => 0 },
  TFT: { ...base, id: 'TFT', ...tftCore },
  GTFT: {
    ...base,
    id: 'GTFT',
    ...tftCore,
    pC: (s, p) => (s === 0 ? 1 : gtftGenerosity(p.b, p.c)),
  },
  /** Wu & Axelrod 1995 generosity (10%), calibration only. */
  GTFT10: { ...base, id: 'GTFT10', ...tftCore, pC: (s) => (s === 0 ? 1 : 0.1) },
  /** Defects only after two consecutive perceived defections. State = consecutive perceived D, capped at 2. */
  TF2T: {
    ...base,
    id: 'TF2T',
    nStates: 3,
    init: 0,
    pC: (s) => (s < 2 ? 1 : 0),
    next: (s, _own, seen) => (seen === C ? 0 : Math.min(2, s + 1)),
  },
  /**
   * Contrite TFT (Sugden; Boerlijst et al. 1997): "A player is in good standing if he has cooperated in
   * the previous round, or if he has defected while provoked (i.e. while he was in good standing and the
   * other player was not)". cTFT "cooperates except if provoked". Standings are tracked from the player's
   * own perception. State = (myBad ? 2 : 0) + (partnerBad ? 1 : 0).
   */
  CTFT: {
    ...base,
    id: 'CTFT',
    nStates: 4,
    init: 0,
    pC: (s) => (s === 1 ? 0 : 1),
    next: (s, own, seen) => {
      const myGood = s < 2, pGood = s % 2 === 0;
      const newMy = own === C || (myGood && !pGood);
      const newP = seen === C || (pGood && !myGood);
      return (newMy ? 0 : 2) + (newP ? 0 : 1);
    },
  },
  /** Win-stay lose-shift: cooperate iff own last move equals the partner's (perceived) last move. */
  WSLS: {
    ...base,
    id: 'WSLS',
    nStates: 2,
    init: 0,
    pC: (s) => (s === 0 ? 1 : 0),
    next: (_s, own, seen) => (own === seen ? 0 : 1),
  },
  /**
   * Prudent Pavlov, memory-2 form. Boerlijst et al. 1997: it "follows in most cases the PAVLOV-strategy
   * ... However, after any defection it will only resume cooperation after two rounds of mutual
   * defection" (they note it "acts to all purposes like Lindgren's (1991) memory two strategy").
   * Implemented as: cooperate iff the last round was mutual C, or the last two rounds were mutual D.
   * States: 0 = last CC, 1 = last mixed, 2 = last DD once, 3 = last two DD. APPROXIMATION: the paper's
   * standing-based version treats one's own erroneous defection slightly differently.
   */
  PPAV: {
    ...base,
    id: 'PPAV',
    nStates: 4,
    init: 0,
    pC: (s) => (s === 0 || s === 3 ? 1 : 0),
    next: (s, own, seen) => {
      if (own === C && seen === C) return 0;
      if (own === D && seen === D) return s === 2 || s === 3 ? 3 : 2;
      return 1;
    },
  },
  /** TFT that, after its own slip (intended C, executed D), pays gamma to the partner; forgives apologised D. */
  APOLOGY: { ...base, id: 'APOLOGY', ...tftCore, apology: 'sincere', acceptsApology: true },
  /** Always defects and apologises (pays gamma) every time, to exploit apology-acceptors. */
  FAKE_APOL: { ...base, id: 'FAKE_APOL', nStates: 1, init: 0, pC: () => 0, next: () => 0, apology: 'fake' },
  /** Displays the checker badge (so checkers pay to check it), never pays, always defects. */
  FAKER: { ...base, id: 'FAKER', nStates: 1, init: 0, pC: () => 0, next: () => 0, willing: true },
  /** Badge-only: displays the badge, plays TFT, never checks. Control for experiment 5. */
  BADGE: { ...base, id: 'BADGE', ...tftCore, willing: true },
  PARA: { ...base, id: 'PARA', ...tftCore, check: 'para', willing: true },
  GAP: { ...base, id: 'GAP', ...tftCore, check: 'gap', willing: true },
  CTRL: { ...base, id: 'CTRL', ...tftCore, check: 'ctrl', willing: true },
  /** Second equivalence control (review round): GAP's cost, the same cut applied to misreadings only, untargeted. */
  CTRL_M: { ...base, id: 'CTRL_M', ...tftCore, check: 'ctrlm', willing: true },
};

/** Throws on parameters outside the model's domain (delta in [0,1), probabilities in [0,1], finite payoffs). */
export function validateParams(p: Params): void {
  const bad = (m: string) => { throw new Error(`invalid Params: ${m}`); };
  if (!(p.delta >= 0 && p.delta < 1)) bad(`delta must be in [0,1) (got ${p.delta})`);
  for (const k of ['epsS', 'epsM', 's', 'a', 'q'] as const)
    if (!(p[k] >= 0 && p[k] <= 1)) bad(`${k} must be a probability in [0,1] (got ${p[k]})`);
  for (const k of ['b', 'c', 'd', 'r', 'gamma'] as const) if (!Number.isFinite(p[k]) || p[k] < 0) bad(`${k} must be finite and >= 0 (got ${p[k]})`);
  // A donation-game dilemma needs b > c > 0 (GTFT's generosity divides by b, and R - S = b).
  if (!(p.c > 0 && p.b > p.c)) bad(`need b > c > 0 (got b=${p.b}, c=${p.c})`);
}
