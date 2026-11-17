import { describe, expect, it } from 'vitest';
import { ALL, checkableFrom } from './grid';
import {
  C,
  D,
  DEFAULT_PARAMS,
  STRATEGIES as S,
  buildMatrices,
  effective,
  gapCost,
  gtftGenerosity,
  mixMatrices,
  perceive,
  playExact,
  playMonteCarlo,
  solveOccupancy,
  type Params,
} from './model';
import { mulberry32 } from './prng';

const quiet: Params = { ...DEFAULT_PARAMS, epsS: 0, epsM: 0 };
const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('closed-form payoffs, no noise', () => {
  it('TFT vs TFT gives b - c per round and full cooperation', () => {
    const r = playExact(S.TFT, S.TFT, quiet, false);
    close(r.payA, quiet.b - quiet.c);
    close(r.payB, quiet.b - quiet.c);
    close(r.coopA, 1);
  });
  it('ALLD vs ALLC gives b and -c', () => {
    const r = playExact(S.ALLD, S.ALLC, quiet, false);
    close(r.payA, quiet.b);
    close(r.payB, -quiet.c);
  });
  it('TFT vs ALLD: TFT loses c only in round 1, so -c(1 - delta) per round', () => {
    const r = playExact(S.TFT, S.ALLD, quiet, false);
    close(r.payA, -quiet.c * (1 - quiet.delta));
    close(r.payB, quiet.b * (1 - quiet.delta));
  });
  it('GTFT vs ALLD: -c[(1 - delta) + delta g] with Nowak-Sigmund g = 1 - c/b', () => {
    const g = gtftGenerosity(quiet.b, quiet.c);
    close(g, 1 - quiet.c / quiet.b);
    const r = playExact(S.GTFT, S.ALLD, quiet, false);
    close(r.payA, -quiet.c * ((1 - quiet.delta) + quiet.delta * g));
  });
  it('WSLS vs ALLD alternates C, D: -c / (1 + delta)', () => {
    const r = playExact(S.WSLS, S.ALLD, quiet, false);
    close(r.payA, -quiet.c / (1 + quiet.delta));
  });
  it('Prudent Pavlov vs ALLD is exploited every third round: -c(1-delta)/(1-delta^3)', () => {
    const r = playExact(S.PPAV, S.ALLD, quiet, false);
    close(r.payA, (-quiet.c * (1 - quiet.delta)) / (1 - quiet.delta ** 3));
  });
  it('fake apologiser vs APOLOGY: faker gets b - gamma, apologiser keeps cooperating and gets -c + gamma', () => {
    const r = playExact(S.FAKE_APOL, S.APOLOGY, quiet, false);
    close(r.payA, quiet.b - quiet.gamma);
    close(r.payB, -quiet.c + quiet.gamma);
  });
  it('every match is symmetric: payA(A,B) = payB(B,A)', () => {
    const p = { ...DEFAULT_PARAMS, epsS: 0.03, epsM: 0.07 };
    for (const a of ['TFT', 'GTFT', 'CTFT', 'WSLS', 'PPAV', 'GAP', 'APOLOGY'])
      for (const b of ['TF2T', 'GAP', 'PARA', 'FAKER', 'ALLC'])
        close(playExact(S[a], S[b], p, true).payA, playExact(S[b], S[a], p, true).payB, 1e-10);
  });
});

describe('error mechanics', () => {
  it('slip: ALLC vs ALLC gives (b - c)(1 - epsS)', () => {
    const p = { ...quiet, epsS: 0.1 };
    close(playExact(S.ALLC, S.ALLC, p, false).payA, (p.b - p.c) * (1 - p.epsS));
  });
  it('misreading does not change ALLC (it ignores history)', () => {
    const p = { ...quiet, epsM: 0.3 };
    close(playExact(S.ALLC, S.ALLC, p, false).payA, p.b - p.c);
  });
  it('misreading: TFT vs ALLC cooperates in round 1, then with probability 1 - epsM', () => {
    const p = { ...quiet, epsM: 0.1 };
    const r = playExact(S.TFT, S.ALLC, p, false);
    const coopTft = (1 - p.delta) * 1 + p.delta * (1 - p.epsM);
    close(r.payB, p.b * coopTft - p.c);
  });
  it('slip: TFT vs ALLC — TFT copies ALLC realized move, then slips itself', () => {
    const e = 0.1;
    const p = { ...quiet, epsS: e };
    const r = playExact(S.TFT, S.ALLC, p, false);
    const later = (1 - e) * (1 - e) + e * e;
    const coopTft = (1 - p.delta) * (1 - e) + p.delta * later;
    close(r.payB, p.b * coopTft - p.c * (1 - e));
  });
  it('slip and misreading are distinguishable for contrite TFT (Boerlijst et al. 1997)', () => {
    const slip = playExact(S.CTFT, S.CTFT, { ...quiet, epsS: 0.05 }, false).payA;
    const mis = playExact(S.CTFT, S.CTFT, { ...quiet, epsM: 0.05 }, false).payA;
    const tftSlip = playExact(S.TFT, S.TFT, { ...quiet, epsS: 0.05 }, false).payA;
    expect(slip).toBeGreaterThan(tftSlip);
    expect(mis).toBeLessThan(slip - 0.1);
  });
});

describe('checks', () => {
  const p: Params = { ...DEFAULT_PARAMS, epsS: 0.02, epsM: 0.08 };
  it('outside checkable encounters every checker is exactly TFT', () => {
    for (const k of ['GAP', 'PARA', 'CTRL'])
      close(playExact(S[k], S[k], p, false).payA, playExact(S.TFT, S.TFT, p, false).payA);
  });
  it('no check against an unwilling partner, even when checkable', () => {
    close(playExact(S.GAP, S.TFT, p, true).payA, playExact(S.TFT, S.TFT, p, false).payA);
    close(playExact(S.GAP, S.ALLC, p, true).payA, playExact(S.TFT, S.ALLC, p, false).payA);
  });
  it('GAP vs GAP = TFT vs TFT with misreading epsM(1 - s q), minus d + r(epsM s + (1-epsM) a)', () => {
    const reduced = { ...p, epsM: p.epsM * (1 - p.s * p.q) };
    const want = playExact(S.TFT, S.TFT, reduced, false).payA - (p.d + p.r * (p.epsM * p.s + (1 - p.epsM) * p.a));
    close(playExact(S.GAP, S.GAP, p, true).payA, want);
    close(gapCost(p), p.d + p.r * (p.epsM * p.s + (1 - p.epsM) * p.a));
  });
  it('PARA vs PARA = TFT vs TFT with misreading epsM(1 - q), minus r', () => {
    const reduced = { ...p, epsM: p.epsM * (1 - p.q) };
    close(playExact(S.PARA, S.PARA, p, true).payA, playExact(S.TFT, S.TFT, reduced, false).payA - p.r);
  });
  it('a check removes misreadings but never slips', () => {
    const slipOnly = { ...p, epsM: 0 };
    close(
      playExact(S.PARA, S.PARA, slipOnly, true).payA + slipOnly.r,
      playExact(S.TFT, S.TFT, slipOnly, false).payA,
    );
  });
  it('CTRL pays the GAP cost and gets the same error reduction in EVERY round, untargeted', () => {
    const e = effective(S.CTRL, S.CTRL, p, true);
    const g = effective(S.GAP, S.GAP, p, true);
    close(e.cost, g.cost);
    // round 1: no misreading exists, so GAP cuts nothing and CTRL must cut nothing either
    close(e.slip1, p.epsS);
    close(g.slip1, p.epsS);
    // rounds >= 2: own slip this round + own misreading feeding this round
    close(e.slip + e.mis, g.slip + g.mis);
    close(e.slip / e.mis, p.epsS / p.epsM);
  });
  it('one-round encounter (delta = 0): CTRL and GAP cooperate equally (no unmatched round-1 benefit)', () => {
    const one = { ...p, delta: 0 };
    close(playExact(S.CTRL, S.CTRL, one, true).coopA, 1 - p.epsS);
    close(playExact(S.GAP, S.GAP, one, true).coopA, 1 - p.epsS);
  });
  it('the round-1 kernel path agrees with the single-kernel path when the rates coincide', () => {
    // CTRL with epsS = 0 has slip1 = slip = 0, so it takes the single-kernel path; GAP is then the same
    // mechanism and must give the same payoff to float precision.
    const q0 = { ...p, epsS: 0 };
    close(playExact(S.CTRL, S.CTRL, q0, true).payA, playExact(S.GAP, S.GAP, q0, true).payA, 1e-12);
    // and a CTRL match whose two paths differ only by a vanishing slip gap is continuous
    const tiny = { ...p, epsS: 1e-12 };
    close(playExact(S.CTRL, S.CTRL, tiny, true).payA, playExact(S.GAP, S.GAP, tiny, true).payA, 1e-9);
  });
  it('a badge-wearing defector makes GAP pay to check; the check only stops GAP misreading D as C', () => {
    const r = playExact(S.GAP, S.FAKER, p, true);
    const reduced = { ...p, epsM: p.epsM * (1 - p.s * p.q) };
    close(r.payA, playExact(S.TFT, S.ALLD, reduced, false).payA - gapCost(p));
    // and it does not pay for itself: GAP is worse off than plain TFT against the same defector
    expect(r.payA).toBeLessThan(playExact(S.TFT, S.ALLD, p, false).payA);
    // the faker itself is exactly ALLD against a slightly less exploitable TFT
    close(r.payB, playExact(S.ALLD, S.TFT, reduced, false).payA);
  });
  it('BADGE: willing to be checked, never checks, plays TFT', () => {
    close(playExact(S.BADGE, S.BADGE, p, true).payA, playExact(S.TFT, S.TFT, p, false).payA);
    const e = effective(S.BADGE, S.GAP, p, true);
    expect(e).toEqual({ slip: p.epsS, slip1: p.epsS, mis: p.epsM, cost: 0 });
    // GAP does check a badge-holder: its own misreadings fall and it pays; BADGE pays nothing
    const r = playExact(S.GAP, S.BADGE, p, true);
    expect(effective(S.GAP, S.BADGE, p, true).cost).toBeCloseTo(gapCost(p), 12);
    const plain = playExact(S.GAP, S.BADGE, p, false);
    expect(r.payA).toBeLessThan(plain.payA); // the check costs more than it saves here
    expect(r.payB).toBeGreaterThan(plain.payB); // BADGE gains from being misread less
  });
  it('checkableFrom (recompute live pairs only) equals buildMatrices with m = 1 for every pair', () => {
    const plain = buildMatrices(ALL, p, 0);
    const fast = checkableFrom(plain, p);
    const full = buildMatrices(ALL, p, 1);
    for (let i = 0; i < ALL.length; i++)
      for (let j = 0; j < ALL.length; j++) {
        close(fast.pay[i][j], full.pay[i][j], 1e-14);
        close(fast.coop[i][j], full.coop[i][j], 1e-14);
      }
  });
  it('m mixes checkable and plain encounters linearly', () => {
    const ids = ['GAP', 'TFT'];
    const half = buildMatrices(ids, p, 0.5).pay[0][0];
    const plain = buildMatrices(ids, p, 0).pay[0][0];
    const full = buildMatrices(ids, p, 1).pay[0][0];
    close(half, (plain + full) / 2);
  });
});

describe('cost and consent accounting, hand-computed (independent of effective())', () => {
  // No noise; b = 3, c = 1, delta = 0.9; kappa = d + r(epsM s + (1 - epsM) a) = 0.1 + 1 * 0.1 = 0.2.
  const p = quiet;
  const pay = (a: string, b: string, chk = true) => playExact(S[a], S[b], p, chk);
  it('both checkers pay 0.2 per round each when the encounter is checkable', () => {
    close(pay('GAP', 'GAP').payA, 1.8);
    close(pay('GAP', 'GAP').payB, 1.8);
    close(pay('GAP', 'GAP', false).payA, 2);
    close(pay('PARA', 'PARA').payA, 1); // PARA pays r = 1
  });
  it('no consent, no check, no cost: unwilling partners are never checked', () => {
    close(pay('GAP', 'TFT').payA, 2);
    close(pay('GAP', 'TFT').payB, 2);
    close(pay('CTRL', 'ALLC').payA, 2);
  });
  it('only the checker pays; a badge-holder or faker is checked for free', () => {
    close(pay('GAP', 'BADGE').payA, 1.8);
    close(pay('GAP', 'BADGE').payB, 2);
    close(pay('GAP', 'FAKER').payA, -0.1 - 0.2); // TFT vs ALLD is -c(1 - delta) = -0.1
    close(pay('GAP', 'FAKER').payB, 0.3); // b(1 - delta)
  });
  it('Monte Carlo with costFromRound2 charges nothing in round 1', () => {
    // rng 0.99: everyone intends C, no slip, no misreading, and the encounter ends after round 1.
    const one = playMonteCarlo(S.GAP, S.GAP, { ...p, costFromRound2: true }, true, 5, () => 0.99);
    close(one.payA, (1 - p.delta) * (p.b - p.c)); // no check cost at all
    const always = playMonteCarlo(S.GAP, S.GAP, p, true, 5, () => 0.99);
    close(always.payA, (1 - p.delta) * (p.b - p.c - 0.2)); // round-1 charge when charged every move
  });
  it('Monte Carlo with costFromRound2 agrees with the exact solver within 4 SE', () => {
    const q = { ...DEFAULT_PARAMS, epsS: 0.03, epsM: 0.06, costFromRound2: true };
    const mc = playMonteCarlo(S.GAP, S.PARA, q, true, 60000, mulberry32(9));
    const ex = playExact(S.GAP, S.PARA, q, true);
    expect(Math.abs(mc.payA - ex.payA)).toBeLessThan(4 * mc.seA);
    expect(Math.abs(mc.payB - ex.payB)).toBeLessThan(4 * mc.seB);
  });
  it('m = 0.5 halves the expected cost; charging from round 2 scales it by delta', () => {
    close(buildMatrices(['GAP'], p, 0.5).pay[0][0], 1.9);
    close(playExact(S.GAP, S.GAP, { ...p, costFromRound2: true }, true).payA, 2 - 0.9 * 0.2);
  });
});

describe('second control: misreading-only untargeted cut (CTRL_M)', () => {
  it('equals GAP by construction against every partner', () => {
    const p = { ...DEFAULT_PARAMS, epsS: 0.02, epsM: 0.08 };
    for (const b of ['GAP', 'CTRL_M', 'TFT', 'FAKER', 'BADGE', 'PARA', 'ALLD'])
      close(playExact(S.CTRL_M, S[b], p, true).payA, playExact(S.GAP, S[b === 'CTRL_M' ? 'GAP' : b], p, true).payA, 1e-12);
  });
});

describe('apology', () => {
  it('APOLOGY vs APOLOGY under slips only: apologised slips are forgiven, transfers cancel: (b - c)(1 - epsS)', () => {
    const p = { ...quiet, epsS: 0.1 };
    const r = playExact(S.APOLOGY, S.APOLOGY, p, false);
    close(r.payA, (p.b - p.c) * (1 - p.epsS));
    close(r.coopA, 1 - p.epsS);
    expect(r.payA).toBeGreaterThan(playExact(S.TFT, S.TFT, p, false).payA);
  });
  it('APOLOGY vs APOLOGY under misreadings only is plain TFT (a misread-provoked D is intended, so no apology)', () => {
    const p = { ...quiet, epsM: 0.1 };
    close(playExact(S.APOLOGY, S.APOLOGY, p, false).payA, playExact(S.TFT, S.TFT, p, false).payA);
  });
  it('ASSUMPTION: an accepted apology overrides a misreading', () => {
    expect(perceive(D, 1, true, true)).toBe(C);
    expect(perceive(D, 1, true, false)).toBe(C); // not accepted: the misreading applies (D read as C)
    expect(perceive(C, 1, false, true)).toBe(D);
  });
});

describe('input validation', () => {
  it('throws on parameters outside the model domain', () => {
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, delta: 1 }, false)).toThrow(/delta/);
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, epsS: 1.5 }, false)).toThrow(/epsS/);
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, q: -0.1 }, false)).toThrow(/q/);
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, b: NaN }, false)).toThrow(/b/);
    expect(() => playMonteCarlo(S.TFT, S.TFT, { ...quiet, epsM: 2 }, false, 10, mulberry32(1))).toThrow(/epsM/);
  });
  it('throws on an invalid checkable share, unknown ids, mismatched matrices or a non-dilemma', () => {
    expect(() => buildMatrices(['GAP'], quiet, 1.5)).toThrow(/m \(checkable share\)/);
    expect(() => buildMatrices(['GAP', 'TYPO'], quiet, 0)).toThrow(/unknown strategy/);
    const a = buildMatrices(['GAP'], quiet, 0), b = buildMatrices(['TFT'], quiet, 0);
    expect(() => mixMatrices(a, b, 0.5)).toThrow(/different strategy ids/);
    expect(() => mixMatrices(a, a, -0.1)).toThrow(/m \(checkable share\)/);
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, b: 1, c: 1 }, false)).toThrow(/b > c > 0/);
    expect(() => playExact(S.TFT, S.TFT, { ...quiet, d: -0.1 }, false)).toThrow(/d must/);
  });
  it('solveOccupancy refuses a singular system instead of returning NaN', () => {
    const M = new Float64Array([1, 0, 0, 1]); // identity: I - 1*M = 0
    expect(() => solveOccupancy(M, 2, 1, new Float64Array([1, 0]))).toThrow(/singular/);
  });
});

describe('exact solver agrees with Monte Carlo', () => {
  const p: Params = { ...DEFAULT_PARAMS, epsS: 0.05, epsM: 0.08 };
  const pairs: [string, string, boolean][] = [
    ['TFT', 'TFT', false],
    ['GTFT', 'WSLS', false],
    ['CTFT', 'TF2T', false],
    ['GAP', 'GAP', true],
    ['PPAV', 'APOLOGY', false],
    ['APOLOGY', 'APOLOGY', false],
    ['CTRL', 'CTRL', true],
    ['CTRL', 'GAP', true],
  ];
  for (const [a, b, chk] of pairs) {
    it(`${a} vs ${b} within 4 standard errors`, () => {
      const mc = playMonteCarlo(S[a], S[b], p, chk, 60000, mulberry32(7));
      const ex = playExact(S[a], S[b], p, chk);
      expect(Math.abs(mc.payA - ex.payA)).toBeLessThan(4 * mc.seA + 1e-9);
      expect(Math.abs(mc.payB - ex.payB)).toBeLessThan(4 * mc.seB + 1e-9);
    });
  }
});
