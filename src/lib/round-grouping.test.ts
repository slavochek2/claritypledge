import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOGGLES,
  groupNextRound,
  pairGap,
  seatLate,
  swapSeats,
  tableLayout,
  type GroupingInput,
  type Seat,
} from './round-grouping';

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

/** Run a whole evening: each round grouped from the history so far. */
function runEvening(base: Omit<GroupingInput, 'history'>, rounds = 3, poolFor?: (r: number) => GroupingInput['people']) {
  const history: Seat[][] = [];
  for (let r = 0; r < rounds; r++) {
    history.push(groupNextRound({ ...base, people: poolFor ? poolFor(r) : base.people, history }));
  }
  return history;
}

function partnersOf(round: Seat[]): string[] {
  const byTable = new Map<number, Seat[]>();
  round.forEach(s => byTable.set(s.table, [...(byTable.get(s.table) ?? []), s]));
  const out: string[] = [];
  for (const seats of byTable.values()) {
    const f = seats.find(s => s.role === 'first');
    const s = seats.find(s => s.role === 'second');
    if (f && s) out.push([f.id, s.id].sort().join('|'));
  }
  return out;
}

const noGap = () => null;

describe('tableLayout', () => {
  it('fifteen in trios: five pairs, one observer each', () => {
    expect(tableLayout(15, 3)).toEqual([1, 1, 1, 1, 1]);
  });
  it('sixteen in trios: one table takes a second observer', () => {
    expect(tableLayout(16, 3)).toEqual([2, 1, 1, 1, 1]);
  });
  it('fourteen in trios: a table of two, no observer', () => {
    expect(tableLayout(14, 3).sort()).toEqual([0, 1, 1, 1, 1]);
  });
  it('group size 2: pairs only, an odd person observes', () => {
    expect(tableLayout(8, 2)).toEqual([0, 0, 0, 0]);
    expect(tableLayout(7, 2)).toEqual([1, 0, 0]);
  });
});

describe('groupNextRound — the evening', () => {
  for (const seed of ['a', 'b', 'c', 'event-42']) {
    it(`15 people, seed ${seed}: everyone observes exactly once, nobody repeats a partner`, () => {
      const evening = runEvening({
        people: people(15), gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed,
      });
      const observed = new Map<string, number>();
      evening.flat().filter(s => s.role === 'observer').forEach(s => observed.set(s.id, (observed.get(s.id) ?? 0) + 1));
      expect(observed.size).toBe(15);
      expect([...observed.values()].every(v => v === 1)).toBe(true);
      const allPairs = evening.flatMap(partnersOf);
      expect(new Set(allPairs).size).toBe(allPairs.length);
      for (const round of evening) expect(round).toHaveLength(15);
    });
  }

  it('is deterministic for the same seed and pool', () => {
    const input: GroupingInput = {
      people: people(12), history: [], gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'x',
    };
    expect(groupNextRound(input)).toEqual(groupNextRound(input));
  });

  it('pairs the people who disagree most', () => {
    // p1/p2 at -3/+3, p3/p4 at -3/+3, p5/p6 both 0. Group size 2 (no observers).
    const pos: Record<string, number> = { p1: -3, p2: 3, p3: -3, p4: 3, p5: 0, p6: 0 };
    const gap = (a: string, b: string) => Math.abs((pos[a] ?? 0) - (pos[b] ?? 0));
    const round = groupNextRound({
      people: people(6), history: [], gap, totalRounds: 1, groupSize: 2, toggles: DEFAULT_TOGGLES, seed: 's',
    });
    const pairs = partnersOf(round);
    expect(pairs).toHaveLength(3);
    // The maximum total is 12 (several pairings reach it); a random pairing averages ~6.
    const total = pairs.reduce((sum, p) => { const [a = '', b = ''] = p.split('|'); return sum + gap(a, b); }, 0);
    expect(total).toBe(12);
  });

  it('a late arrival is grouped in the next round', () => {
    const evening = runEvening(
      { people: [], gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'late' },
      3,
      r => (r === 0 ? people(9) : people(10)),
    );
    expect(evening[0]?.some(s => s.id === 'p10')).toBe(false);
    expect(evening[1]?.some(s => s.id === 'p10')).toBe(true);
    const allPairs = evening.flatMap(partnersOf);
    expect(new Set(allPairs).size).toBe(allPairs.length);
  });

  it('someone who left is not seated in the next round', () => {
    const evening = runEvening(
      { people: [], gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'left' },
      2,
      r => (r === 0 ? people(9) : people(9).filter(p => p.id !== 'p4')),
    );
    expect(evening[1]?.some(s => s.id === 'p4')).toBe(false);
    expect(evening[1]).toHaveLength(8);
  });

  it('group size 2 runs a round with no observer', () => {
    const round = groupNextRound({
      people: people(10), history: [], gap: noGap, totalRounds: 3, groupSize: 2, toggles: DEFAULT_TOGGLES, seed: 'g2',
    });
    expect(round.some(s => s.role === 'observer')).toBe(false);
    expect(partnersOf(round)).toHaveLength(5);
  });

  it('three recorders share one table every round, at the highest table number', () => {
    const pool = people(12).map((p, i) => ({ ...p, recorder: i < 3 }));
    const evening = runEvening({
      people: pool, gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'rec',
    });
    for (const round of evening) {
      const tables = new Set(round.filter(s => ['p1', 'p2', 'p3'].includes(s.id)).map(s => s.table));
      expect(tables.size).toBe(1);
      expect([...tables][0]).toBe(Math.max(...round.map(s => s.table)));
    }
  });

  it('two roles per table at most once each', () => {
    const round = groupNextRound({
      people: people(16), history: [], gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'r',
    });
    const byTable = new Map<number, Seat[]>();
    round.forEach(s => byTable.set(s.table, [...(byTable.get(s.table) ?? []), s]));
    for (const seats of byTable.values()) {
      expect(seats.filter(s => s.role === 'first')).toHaveLength(1);
      expect(seats.filter(s => s.role === 'second')).toHaveLength(1);
    }
  });

  it('computes a 40-person evening quickly enough for a phone', () => {
    const t0 = performance.now();
    runEvening({ people: people(40), gap: noGap, totalRounds: 3, groupSize: 3, toggles: DEFAULT_TOGGLES, seed: 'big' }, 1);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('pairGap', () => {
  it('is led by the furthest-apart statement', () => {
    const a = new Map([['s1', 3], ['s2', 0]]);
    const b = new Map([['s1', -3], ['s2', 0]]);
    expect(pairGap(a, b)).toBeCloseTo(6 + 3 / 10);
  });
  it('is null with no shared statement', () => {
    expect(pairGap(new Map([['s1', 1]]), new Map([['s2', 1]]))).toBeNull();
    expect(pairGap(undefined, new Map())).toBeNull();
  });
});

describe('swapSeats', () => {
  it('exchanges table and role', () => {
    const seats: Seat[] = [
      { id: 'a', table: 1, role: 'observer' },
      { id: 'b', table: 2, role: 'first' },
    ];
    expect(swapSeats(seats, 'a', 'b')).toEqual([
      { id: 'a', table: 2, role: 'first' },
      { id: 'b', table: 1, role: 'observer' },
    ]);
  });
});

describe('seatLate', () => {
  const running: Seat[] = [
    { id: 'a', table: 1, role: 'first' },
    { id: 'b', table: 1, role: 'second' },
    { id: 'c', table: 1, role: 'observer' },
    { id: 'd', table: 2, role: 'first' },
    { id: 'e', table: 2, role: 'second' },
  ];

  it('moves nobody already seated', () => {
    const out = seatLate(running, ['x', 'y', 'z']);
    for (const s of running) expect(out).toContainEqual(s);
  });

  it('two newcomers open a new table as a speaker pair', () => {
    const out = seatLate(running, ['x', 'y']);
    expect(out.filter(s => s.table === 3)).toEqual([
      { id: 'x', table: 3, role: 'first' },
      { id: 'y', table: 3, role: 'second' },
    ]);
  });

  it('three newcomers: a new trio', () => {
    const out = seatLate(running, ['x', 'y', 'z']);
    expect(out.filter(s => s.table === 3).map(s => s.role)).toEqual(['first', 'second', 'observer']);
  });

  it('one newcomer observes at the smallest table', () => {
    const out = seatLate(running, ['x']);
    expect(out).toContainEqual({ id: 'x', table: 2, role: 'observer' });
  });

  it('ignores someone already seated', () => {
    expect(seatLate(running, ['a'])).toEqual(running);
  });
});
