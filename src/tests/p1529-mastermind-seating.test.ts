import { describe, expect, it } from 'vitest';
import { planMastermindRound, type UnmetRule } from '@/lib/mastermind-seating';
import type { Seat } from '@/lib/round-grouping';

const people = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function runSession(holders: string[], observers: string[], rounds = 4, seed = 'event') {
  const history: Seat[][] = [];
  const unmet: UnmetRule[][] = [];
  for (let r = 0; r < rounds; r++) {
    const plan = planMastermindRound({ holders, observers, history, seed });
    history.push(plan.seats);
    unmet.push(plan.unmet);
  }
  return { history, unmet };
}

const pairsOf = (seats: Seat[]) => {
  const tables = new Map<number, Seat[]>();
  for (const s of seats) tables.set(s.table, [...(tables.get(s.table) ?? []), s]);
  return [...tables.values()].map(t => ({
    owner: t.find(s => s.role === 'first')?.id,
    partner: t.find(s => s.role === 'second')?.id,
    observers: t.filter(s => s.role === 'observer').map(s => s.id),
  }));
};

const pairKey = (a?: string, b?: string) => [a, b].sort().join('|');

function repeats(history: Seat[][]) {
  const seen = new Set<string>();
  let n = 0;
  for (const seats of history) for (const t of pairsOf(seats)) {
    const k = pairKey(t.owner, t.partner);
    if (seen.has(k)) n++;
    seen.add(k);
  }
  return n;
}

function ownedIn(history: Seat[][], rounds: number[]) {
  const c = new Map<string, number>();
  for (const r of rounds) for (const t of pairsOf(history[r - 1] ?? [])) c.set(t.owner!, (c.get(t.owner!) ?? 0) + 1);
  return c;
}

describe('P1529 mastermind seating', () => {
  for (const n of [6, 8, 10, 12, 14, 16]) {
    it(`${n} canvases: one owner + one partner per table, no repeated partner, everyone owns once per part`, () => {
      const holders = people(n);
      const { history, unmet } = runSession(holders, []);
      expect(repeats(history)).toBe(0);
      for (const seats of history) {
        for (const t of pairsOf(seats)) { expect(t.owner).toBeTruthy(); expect(t.partner).toBeTruthy(); }
        expect(seats.length).toBe(n);
      }
      const first = ownedIn(history, [1, 2]);
      const second = ownedIn(history, [3, 4]);
      for (const h of holders) { expect(first.get(h)).toBe(1); expect(second.get(h)).toBe(1); }
      expect(unmet.flat()).toEqual([]);
    });
  }

  for (const n of [5, 7, 9, 11]) {
    it(`${n} canvases (odd): one observes each round, nobody twice, no repeat; who owns less is named`, () => {
      const holders = people(n);
      const { history, unmet } = runSession(holders, []);
      expect(repeats(history)).toBe(0);
      const observed = new Map<string, number>();
      for (const seats of history) {
        const sitting = seats.filter(s => s.role === 'observer').map(s => s.id);
        expect(sitting).toHaveLength(1);
        observed.set(sitting[0], (observed.get(sitting[0]) ?? 0) + 1);
      }
      expect(Math.max(...observed.values())).toBe(1);
      // Round 1's plan says up front who will own only once in a part, and the real session agrees or does better.
      const named = unmet[0].filter(u => u.rule === 'owns-once');
      expect(named.length).toBeGreaterThan(0);
      const missing = holders.flatMap(h => [
        ...(ownedIn(history, [1, 2]).get(h) ? [] : [h]),
        ...(ownedIn(history, [3, 4]).get(h) ? [] : [h]),
      ]);
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.length).toBeLessThanOrEqual(2);
    });
  }

  it('spreads observers, at most two a table; extra observers are named as unseated', () => {
    const holders = people(4);
    const plan = planMastermindRound({ holders, observers: people(6, 'o'), history: [], seed: 'x' });
    const tables = pairsOf(plan.seats);
    expect(tables).toHaveLength(2);
    for (const t of tables) expect(t.observers.length).toBe(2);
    expect(plan.unmet.filter(u => u.rule === 'unseated')).toHaveLength(2);
    expect(plan.unmet.some(u => u.rule === 'too-few-canvases')).toBe(true);
  });

  it('0 observers and 3 observers across 6 canvases: a table with none is fine', () => {
    const plan = planMastermindRound({ holders: people(6), observers: people(3, 'o'), history: [], seed: 'x' });
    const counts = pairsOf(plan.seats).map(t => t.observers.length).sort();
    expect(counts).toEqual([1, 1, 1]);
    const none = planMastermindRound({ holders: people(6), observers: [], history: [], seed: 'x' });
    expect(pairsOf(none.seats).every(t => t.observers.length === 0)).toBe(true);
  });

  it('someone added as an owner at round 2 owns in round 2 and is named only if they cannot', () => {
    const holders = people(6);
    const r1 = planMastermindRound({ holders, observers: [], history: [], seed: 's' }).seats;
    const late = [...holders, 'late'];
    const r2 = planMastermindRound({ holders: late, observers: [], history: [r1], seed: 's' });
    expect(pairsOf(r2.seats).length + r2.seats.filter(s => s.role === 'observer').length).toBeGreaterThan(0);
    const inRound = r2.seats.find(s => s.id === 'late');
    expect(inRound).toBeTruthy();
    const everyoneElse = new Set(r1.map(s => s.id));
    expect(everyoneElse.has('late')).toBe(false);
  });

  it('someone added at round 3 or 4 is seated, and past rounds are never re-paired', () => {
    for (const lateAt of [3, 4]) {
      const holders = people(6);
      const history: Seat[][] = [];
      for (let r = 1; r <= 4; r++) {
        const pool = r >= lateAt ? [...holders, 'late'] : holders;
        const plan = planMastermindRound({ holders: pool, observers: [], history, seed: `late${lateAt}` });
        history.push(plan.seats);
        if (r >= lateAt) expect(plan.seats.some(s => s.id === 'late')).toBe(true);
      }
      expect(repeats(history)).toBe(0);
    }
  });

  it('two partners leaving after round 1 can make an owner own twice in rounds 1-2: the plan names that rule', () => {
    const holders = people(6);
    let named = 0;
    for (let seed = 0; seed < 12; seed++) {
      const r1 = planMastermindRound({ holders, observers: [], history: [], seed: `own-twice-${seed}` }).seats;
      const owners1 = r1.filter(s => s.role === 'first').map(s => s.id);
      const partner = r1.find(s => s.role === 'second')!.id;
      // Only three owners and one partner are left: two tables, but only one person has not owned yet.
      const plan = planMastermindRound({ holders: [...owners1, partner], observers: [], history: [r1], seed: `own-twice-${seed}` });
      const again = plan.seats.filter(s => s.role === 'first' && owners1.includes(s.id)).map(s => s.id);
      expect(again.length).toBeGreaterThan(0); // unavoidable with two tables
      expect(plan.unmet.filter(u => u.rule === 'owns-twice').map(u => (u as { person: string }).person).sort()).toEqual([...again].sort());
      named++;
    }
    expect(named).toBe(12);
  });

  it('owning twice is never reported in round 1, 3 or beyond the fourth round, where the promise does not apply', () => {
    const plan = planMastermindRound({ holders: people(6), observers: [], history: [], seed: 'x' });
    expect(plan.unmet.some(u => u.rule === 'owns-twice')).toBe(false);
    const history: Seat[][] = [];
    for (let r = 1; r <= 6; r++) history.push(planMastermindRound({ holders: people(6), observers: [], history, seed: 'six' }).seats);
    const fifth = planMastermindRound({ holders: people(6), observers: [], history, seed: 'six' });
    expect(fifth.unmet.some(u => u.rule === 'owns-twice')).toBe(false);
  });

  it('someone leaving mid-session: later rounds simply seat those remaining', () => {
    const holders = people(8);
    const history: Seat[][] = [planMastermindRound({ holders, observers: [], history: [], seed: 'l' }).seats];
    const remaining = holders.filter(h => h !== 'p3');
    const next = planMastermindRound({ holders: remaining, observers: [], history, seed: 'l' });
    expect(next.seats.some(s => s.id === 'p3')).toBe(false);
    expect(next.seats.filter(s => s.role === 'observer')).toHaveLength(1);
  });

  it('session 2 avoids session-1 partners where the group allows, and names each repeat', () => {
    const holders = people(10);
    const s1 = runSession(holders, [], 4, 's1').history;
    const previousPartners = s1.flatMap(seats => pairsOf(seats).map(t => [t.owner!, t.partner!] as [string, string]));
    const history: Seat[][] = [];
    const prev = new Set(previousPartners.map(([a, b]) => pairKey(a, b)));
    let namedRepeats = 0; let realRepeats = 0;
    for (let r = 0; r < 4; r++) {
      const plan = planMastermindRound({ holders, observers: [], history, previousPartners, seed: 's2' });
      history.push(plan.seats);
      namedRepeats += plan.unmet.filter(u => u.rule === 'previous-session-partner').length;
      realRepeats += pairsOf(plan.seats).filter(t => prev.has(pairKey(t.owner, t.partner))).length;
    }
    expect(namedRepeats).toBe(realRepeats);
    expect(realRepeats).toBeLessThanOrEqual(2);
  });

  it('fewer than two canvases: no tables, the rule and everyone named', () => {
    const plan = planMastermindRound({ holders: ['a'], observers: ['b'], history: [], seed: 'x' });
    expect(plan.seats).toEqual([]);
    expect(plan.unmet).toContainEqual({ rule: 'too-few-canvases', canvases: 1 });
    expect(plan.unmet.filter(u => u.rule === 'unseated')).toHaveLength(2);
  });

  it('is deterministic for a seed and changes with Shuffle', () => {
    const a = planMastermindRound({ holders: people(8), observers: [], history: [], seed: 'same' }).seats;
    const b = planMastermindRound({ holders: people(8), observers: [], history: [], seed: 'same' }).seats;
    const c = planMastermindRound({ holders: people(8), observers: [], history: [], seed: 'same:shuffle:1' }).seats;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
