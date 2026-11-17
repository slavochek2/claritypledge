/**
 * @file exp-main.ts
 * @description P1702 experiments 2 and 3: the main strategy map (stationary abundances over the grid)
 * and the pre-registered Criterion 2 rule. The equivalence test is in exp-equivalence.ts.
 */
import { logFixation, stationary } from './dynamics';
import { ALL, FULL, POOLS, checkableFrom, idx, sub, type Grid, type Log, type Table } from './grid';
import { DEFAULT_PARAMS, buildMatrices, gapCost, mixMatrices, type Matrices, type Params } from './model';
import { mean, midRank, quantile, topLabel } from './stats';

export interface Row {
  pool: string;
  b: number;
  epsS: number;
  epsM: number;
  d: number;
  r: number;
  q: number;
  m: number;
  beta: number;
  kappa: number;
  shares: number[];
  ids: string[];
  h2h?: number;
  /** Magnitude of the two log10 fixation probabilities behind h2h: its numerical-tie scale. */
  h2hScale?: number;
}

export const topOf = (row: Row) => topLabel(row.ids, row.shares);

export const share = (row: Row, id: string) => {
  const k = row.ids.indexOf(id);
  return k < 0 ? NaN : row.shares[k];
};

/** Cell key (b, epsS, epsM, d, r, m). */
export const cellKey = (r: Row) => `${r.b}|${r.epsS}|${r.epsM}|${r.d}|${r.r}|${r.m}`;

const meetsFloor = (r: Row) => r.kappa >= (r.epsS + r.epsM) * r.b;

/** Rows for every (m, beta, pool) at one (b, eps, d, r, q) point. */
function pointRows(g: Grid, mats: { plain: Matrices; chk: Matrices }, p: Params, out: Row[]): void {
  const kappa = gapCost(p);
  for (const m of g.m) {
    const mix = mixMatrices(mats.plain, mats.chk, m);
    for (const beta of g.beta)
      for (const [pool, ids] of Object.entries(POOLS)) {
        const x = stationary(sub(mix.pay, ids), g.N, beta);
        const row: Row = { pool, b: p.b, epsS: p.epsS, epsM: p.epsM, d: p.d, r: p.r, q: p.q, m, beta, kappa, shares: x, ids };
        if (pool === 'FULL_CTRL') {
          // POST-HOC diagnostic: head-to-head log10( rho(GAP invades CTRL) / rho(CTRL invades GAP) ).
          const G = idx('GAP'), K = idx('CTRL'), A = mix.pay;
          const lg = logFixation(A[G][G], A[G][K], A[K][G], A[K][K], g.N, beta), lk = logFixation(A[K][K], A[K][G], A[G][K], A[G][G], g.N, beta);
          row.h2h = (lg - lk) / Math.LN10;
          row.h2hScale = Math.max(Math.abs(lg), Math.abs(lk)) / Math.LN10;
        }
        out.push(row);
      }
  }
}

/** Stationary abundances for every grid cell, q, beta and pool. `over` sets extra parameters (sensitivity runs). */
export function runMainMap(g: Grid, log: Log, over: Partial<Params> = {}): Row[] {
  const rows: Row[] = [];
  for (const b of g.b)
    for (const epsS of g.eps)
      for (const epsM of g.eps) {
        if (epsS + epsM === 0) continue;
        const p0: Params = { ...DEFAULT_PARAMS, ...over, b, epsS, epsM };
        const plain = buildMatrices(ALL, p0, 0);
        for (const d of g.d)
          for (const r of g.r)
            for (const q of g.q) {
              const p: Params = { ...p0, d, r, q };
              pointRows(g, { plain, chk: checkableFrom(plain, p) }, p, rows);
            }
        log(`main map b=${b} epsS=${epsS} epsM=${epsM} (${rows.length} stationary distributions)`);
      }
  return rows;
}

export function mainMapTable(rows: Row[]): Table {
  const out: (string | number)[][] = [];
  for (const row of rows) {
    if (row.pool !== 'BASE' && row.pool !== 'FULL') continue;
    out.push([
      row.pool, row.b, row.epsS, row.epsM, row.d, row.r, row.q, row.m, row.beta, row.kappa,
      (row.epsS + row.epsM) * row.b, topOf(row), ...FULL.map((id) => share(row, id)),
    ]);
  }
  return { name: 'main_map.csv', header: ['pool', 'b', 'epsS', 'epsM', 'd', 'r', 'q', 'm', 'beta', 'kappa', 'floor_eps_b', 'top', ...FULL.map((s) => `x_${s}`)], rows: out };
}

interface Cell {
  row: Row;
  floorOk: boolean;
  /** GAP strictly top, for each (beta != 1, q). */
  wins: boolean[];
  /** GAP top under any beta and q, beta = 1 included. */
  anyWin: boolean;
}

/** Group a pool's rows into cells (b, epsS, epsM, d, r, m). */
function groupCells(rows: Row[], pool: string): Cell[] {
  const cells = new Map<string, Cell>();
  for (const row of rows) {
    if (row.pool !== pool) continue;
    const k = cellKey(row);
    let c = cells.get(k);
    if (!c) {
      c = { row, floorOk: meetsFloor(row), wins: [], anyWin: false };
      cells.set(k, c);
    }
    const isTop = topOf(row) === 'GAP';
    if (row.beta !== 1) c.wins.push(isTop);
    if (isTop) c.anyWin = true;
  }
  return [...cells.values()];
}

/** Top-strategy counts at beta = 1, q = 0.9 in one pool. */
function topCounts(rows: Row[], pool: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.pool !== pool || row.beta !== 1 || row.q !== 0.9) continue;
    const t = topOf(row);
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/** GAP's mid-rank (ties share their mean rank) in FULL at beta = 1, q = 0.9, cells with misreading. */
function gapRanks(rows: Row[]): number[] {
  const ranks: number[] = [];
  for (const row of rows) {
    if (row.pool !== 'FULL' || row.beta !== 1 || row.q !== 0.9 || row.epsM === 0) continue;
    ranks.push(midRank(row.shares, row.ids.indexOf('GAP')));
  }
  return ranks;
}

/**
 * Criterion 2 (pre-registered). A "cell" is (b, epsS, epsM, d, r, m). It is a ROBUST WIN if, in the FULL
 * pool (with APOLOGY, FAKE_APOL and FAKER present), GAP is the single most abundant strategy for every
 * beta other than 1 ({0.1, 10}) and every q. The cost floor is kappa = d + r(epsM s + (1-epsM) a) >=
 * (epsS+epsM) b. PASS if at least one floor-satisfying cell is a robust win (region size reported
 * alongside); REFUTED if none. Wins that exist only at d = min(grid d) are flagged, never refuted: the
 * spec's guard against "a win only as c -> 0" is the cost floor itself (review round 3).
 */
export function criterion2(rows: Row[], g: Grid): { summary: Record<string, unknown>; tables: Table[] } {
  const need = g.beta.filter((b) => b !== 1).length * g.q.length;
  const isFloor = (c: Cell) => c.floorOk && c.row.epsM > 0;
  const isRobust = (c: Cell) => c.wins.length === need && c.wins.every(Boolean);
  const all = groupCells(rows, 'FULL');
  const floorCells = all.filter(isFloor);
  const robust = floorCells.filter(isRobust);
  const robustByD: Record<string, number> = {};
  for (const c of robust) robustByD[c.row.d] = (robustByD[c.row.d] ?? 0) + 1;
  const nopp = groupCells(rows, 'FULL_NOPP').filter(isFloor);
  const summary = {
    cellsTotal: all.length,
    floorCellsWithMisreading: floorCells.length,
    robustWins: robust.length,
    robustWinsBaseNoExploiters: groupCells(rows, 'BASE').filter(isFloor).filter(isRobust).length,
    posthoc_robustWins_FULL_without_PPAV: nopp.filter(isRobust).length,
    posthoc_floorCellsGapTopAnyBetaQ_FULL_without_PPAV: nopp.filter((c) => c.anyWin).length,
    posthoc_topCounts_FULL_without_PPAV_beta1_q09: topCounts(rows, 'FULL_NOPP'),
    floorCellsWhereGapTopInAnyBetaQ: floorCells.filter((c) => c.anyWin).length,
    robustByD,
    topStrategyCounts_FULL_beta1_q09: topCounts(rows, 'FULL'),
    gapRankMedian_FULL_beta1_q09: quantile(gapRanks(rows), 0.5),
    rowsWithTiedTop_FULL: rows.filter((r) => r.pool === 'FULL' && topOf(r).startsWith('TIE(')).length,
    // Support only at the cheapest tested d is reported, not turned into a refutation.
    boundaryOnlySupport: robust.length > 0 && Object.keys(robustByD).every((d) => Number(d) === Math.min(...g.d)),
    verdict: robust.length === 0 ? 'REFUTED' : 'PASS',
  };
  const robustRows = robust.map((c) => [c.row.b, c.row.epsS, c.row.epsM, c.row.d, c.row.r, c.row.m, c.row.kappa]);
  return {
    summary,
    tables: [
      { name: 'criterion2_robust_cells.csv', header: ['b', 'epsS', 'epsM', 'd', 'r', 'm', 'kappa'], rows: robustRows },
      byConditionTable(rows, g),
    ],
  };
}

/** Per-condition table: share of floor cells (epsM > 0) in which GAP is top, by pool, beta and q. */
function byConditionTable(rows: Row[], g: Grid): Table {
  const out: (string | number)[][] = [];
  for (const pool of ['BASE', 'FULL'])
    for (const beta of g.beta)
      for (const q of g.q) {
        const sel0 = rows.filter((r) => r.pool === pool && r.beta === beta && r.q === q && r.epsM > 0);
        const sel = sel0.filter(meetsFloor);
        const top = (xs: Row[]) => xs.filter((r) => topOf(r) === 'GAP').length;
        out.push([pool, beta, q, sel.length, top(sel), sel0.length, top(sel0), mean(sel0.map((r) => share(r, 'GAP'))), mean(sel0.map((r) => share(r, 'GTFT')))]);
      }
  return { name: 'criterion2_by_condition.csv', header: ['pool', 'beta', 'q', 'floor_cells', 'gap_top_floor', 'all_cells', 'gap_top_all', 'mean_x_GAP', 'mean_x_GTFT'], rows: out };
}

/** Count of FULL rows where GAP is strictly the most abundant strategy. */
export const gapTopRows = (rows: Row[]) => rows.filter((r) => r.pool === 'FULL' && topOf(r) === 'GAP').length;

/**
 * POST-HOC sensitivity (review round): check costs charged only from round 2 on (per-round cost delta *
 * cost). Criterion 2 is re-run with the floor on kappa as registered, and with the floor on the
 * effective per-round cost delta * kappa.
 */
export function costFromRound2(g: Grid, log: Log): Record<string, unknown> {
  const rows = runMainMap(g, log, { costFromRound2: true });
  const delta = DEFAULT_PARAMS.delta;
  const pick = (s: Record<string, unknown>) => ({
    floorCellsWithMisreading: s.floorCellsWithMisreading,
    robustWins: s.robustWins,
    floorCellsWhereGapTopInAnyBetaQ: s.floorCellsWhereGapTopInAnyBetaQ,
    topStrategyCounts_FULL_beta1_q09: s.topStrategyCounts_FULL_beta1_q09,
    gapRankMedian_FULL_beta1_q09: s.gapRankMedian_FULL_beta1_q09,
    verdict: s.verdict,
  });
  return {
    gapStrictlyTopRows_FULL: gapTopRows(rows),
    floorOnKappa: pick(criterion2(rows, g).summary),
    floorOnEffectiveCost: pick(criterion2(rows.map((r) => ({ ...r, kappa: delta * r.kappa })), g).summary),
  };
}
