import { describe, expect, it } from 'vitest';
import { gth, gthLog, logFixation, randomRegularGraph, runAbm, stationary, stationaryLog } from './dynamics';
import { mulberry32 } from './prng';

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('fixation probabilities', () => {
  it('neutral mutant fixes with probability 1/N', () => {
    close(Math.exp(logFixation(2, 2, 2, 2, 100, 5)), 1 / 100);
    close(Math.exp(logFixation(3, -1, 4, 0, 50, 0)), 1 / 50);
  });
  it('constant advantage matches (1 - e^{-beta D}) / (1 - e^{-beta N D})', () => {
    const D = 0.3, beta = 1.5, N = 40;
    const want = (1 - Math.exp(-beta * D)) / (1 - Math.exp(-beta * N * D));
    close(Math.exp(logFixation(1 + D, 1 + D, 1, 1, N, beta)), want, 1e-12);
  });
  it('stays finite under very strong selection', () => {
    const l = logFixation(0, -1, 3, 2, 100, 10);
    expect(Number.isFinite(l)).toBe(true);
    expect(l).toBeLessThan(-100);
  });
});

describe('log-space stationary distribution', () => {
  it('stays finite where linear abundances underflow to 0, and agrees where they do not', () => {
    const pay = [[2, -1], [3, 0]];
    const lx = stationaryLog(pay, 100, 100); // ALLC's abundance is far below 1e-308 here
    expect(lx.every(Number.isFinite)).toBe(true);
    expect(stationary(pay, 100, 100)[0]).toBe(0);
    expect(lx[0]).toBeLessThan(-745);
    const ok = stationaryLog(pay, 30, 0.2), x = stationary(pay, 30, 0.2);
    for (let i = 0; i < 2; i++) close(Math.exp(ok[i]), x[i], 1e-15);
  });
});

describe('stationary distribution', () => {
  it('two strategies: ratio of abundances equals ratio of fixation probabilities', () => {
    const pay = [[2, -1], [3, 0]]; // ALLC, ALLD with b=3, c=1
    const x = stationary(pay, 30, 0.2);
    const rAB = Math.exp(logFixation(2, -1, 3, 0, 30, 0.2)); // ALLC invades ALLD
    const rBA = Math.exp(logFixation(0, 3, -1, 2, 30, 0.2)); // ALLD invades ALLC
    close(x[0] / x[1], rAB / rBA, 1e-9);
    expect(x[1]).toBeGreaterThan(x[0]);
  });
  it('log-space GTH equals linear GTH on a well-conditioned chain', () => {
    const rng = mulberry32(3);
    const n = 6;
    const P = Array.from({ length: n }, () => Array.from({ length: n }, () => rng()));
    const lin = gth(P);
    const lg = gthLog(P.map((r) => r.map((v) => Math.log(v))));
    for (let i = 0; i < n; i++) close(lin[i], lg[i], 1e-12);
    // and it is the left eigenvector of the row-normalised chain
    const Q = P.map((r, i) => {
      const off = r.reduce((s, v, j) => (j === i ? s : s + v), 0);
      return r.map((v, j) => (j === i ? 1 - off / n : v / n));
    });
    for (let j = 0; j < n; j++) {
      let v = 0;
      for (let i = 0; i < n; i++) v += lin[i] * Q[i][j];
      close(v, lin[j], 1e-12);
    }
  });
});

describe('agent-based dynamics with committed players', () => {
  it('random regular graph is simple and k-regular', () => {
    const g = randomRegularGraph(200, 4, mulberry32(1));
    for (let i = 0; i < 200; i++) {
      expect(g[i].length).toBe(4);
      expect(g[i].includes(i)).toBe(false);
      expect(new Set(g[i]).size).toBe(4);
    }
  });
  it('without committed players and exploration an all-defector room stays at zero cooperation', () => {
    const pay = [[2, -1], [3, 0]];
    const coop = [[1, 1], [0, 0]];
    const r = runAbm({ pay, coop, pool: [0, 1], committed: 0, f: 0, N: 50, graph: null, beta: 1, mu: 0, mcs: 50, burn: 10, init: 1, rng: mulberry32(2) });
    close(r.coopNormals, 0);
  });
  it('zealot imitation switch: committed strategy spreads only when it may be imitated', () => {
    // Committed ALLD among ALLC normals under strong selection: ALLD earns more, so normals copy it
    // when allowed; when not allowed, no normal can ever hold ALLD (mu = 0).
    const pay = [[2, -1], [3, 0]];
    const coop = [[1, 1], [0, 0]];
    const base = { pay, coop, pool: [0], committed: 1, f: 0.1, N: 100, graph: null, beta: 10, mu: 0, mcs: 300, burn: 200, init: 0 };
    const yes = runAbm({ ...base, rng: mulberry32(5) });
    const no = runAbm({ ...base, rng: mulberry32(5), imitateCommitted: false });
    expect(yes.shares[1]).toBeGreaterThan(0.5);
    close(no.shares[1], 0);
  });
  it('committed agents never update and are counted out of normal-agent cooperation', () => {
    const pay = [[2, -1], [3, 0]];
    const coop = [[1, 1], [0, 0]];
    // Committed ALLC are exploited, so nobody imitates them under strong selection.
    const r = runAbm({ pay, coop, pool: [0, 1], committed: 0, f: 0.3, N: 100, graph: null, beta: 50, mu: 0, mcs: 200, burn: 100, init: 1, rng: mulberry32(4) });
    close(r.coopNormals, 0, 1e-12);
    expect(r.coopAll).toBeGreaterThan(0.29);
  });
});

describe('agent-based dynamics on a graph', () => {
  const pay = [[2, -1], [3, 0]];
  const coop = [[1, 1], [0, 0]];
  it('frozen normals: cooperation is counted per agent over neighbours, committed included in coopAll only', () => {
    const graph = randomRegularGraph(100, 4, mulberry32(11));
    const r = runAbm({ pay, coop, pool: [1], committed: 0, f: 0.3, N: 100, graph, beta: 1, mu: 0, mcs: 20, burn: 5, init: 1, imitateCommitted: false, rng: mulberry32(12) });
    close(r.coopNormals, 0, 1e-12);
    close(r.coopAll, 0.3, 1e-12);
  });
  it('a committed defector spreads through neighbours under strong selection', () => {
    const graph = randomRegularGraph(100, 4, mulberry32(13));
    const r = runAbm({ pay, coop, pool: [0], committed: 1, f: 0.1, N: 100, graph, beta: 10, mu: 0, mcs: 300, burn: 200, init: 0, rng: mulberry32(14) });
    expect(r.shares[1]).toBeGreaterThan(0.5);
  });
});

describe('input validation', () => {
  it('randomRegularGraph needs N*k even and 1 <= k < N', () => {
    expect(() => randomRegularGraph(5, 3, mulberry32(1))).toThrow(/even/);
    expect(() => randomRegularGraph(4, 4, mulberry32(1))).toThrow(/k < N/);
  });
  it('runAbm needs N > 1 and burn < mcs', () => {
    const base = { pay: [[1]], coop: [[1]], pool: [0], committed: 0, f: 0, graph: null, beta: 1, mu: 0, init: 0, rng: mulberry32(1) };
    expect(() => runAbm({ ...base, N: 1, mcs: 10, burn: 0 })).toThrow(/N must/);
    expect(() => runAbm({ ...base, N: 10, mcs: 10, burn: 10 })).toThrow(/burn < mcs/);
  });
  it('stationary refuses N < 2 and a non-finite beta', () => {
    expect(() => stationary([[1, 0], [0, 1]], 1, 1)).toThrow(/N must/);
    expect(() => stationary([[1, 0], [0, 1]], 10, NaN)).toThrow(/beta must/);
  });
  it('runAbm refuses out-of-range strategy indices and a non-finite beta', () => {
    const base = { pay: [[1, 0], [0, 1]], coop: [[1, 0], [0, 1]], pool: [0], committed: 0, f: 0, N: 10, graph: null, beta: 1, mu: 0, mcs: 10, burn: 0, init: 0, rng: mulberry32(1) };
    expect(() => runAbm({ ...base, pool: [2] })).toThrow(/index out of range/);
    expect(() => runAbm({ ...base, committed: -1 })).toThrow(/index out of range/);
    expect(() => runAbm({ ...base, beta: Infinity })).toThrow(/beta must/);
  });
  it('gthLog refuses a reducible chain instead of returning NaN', () => {
    const L = [[-Infinity, 0, 0], [0, -Infinity, 0], [-Infinity, -Infinity, -Infinity]];
    expect(() => gthLog(L)).toThrow(/reducible/);
  });
});
