/**
 * P1061: specification tests for the position-movement counting rules.
 * Expected values come from the spec's "Definitions (the counting rules)" and the first Done-When checkbox.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PositionType } from '@/app/types';
import {
  storyMovements, listenersOf, positionsOf, positionAt, strengthOf, directionOf, readingsOf, spreadShift,
  verificationsOf, chosenPeople, arrowsOn, drawsNotVerified, localDay, EVERYONE,
  type HistoryRow, type CurrentRow, type VerificationRow, type StoryMovementRows,
} from '@/lib/position-movement';

const dayOf = (at: string) => at.slice(0, 10);
const P: Record<string, PositionType> = {
  sd: 'strongly_disagree', d: 'disagree', sld: 'somewhat_disagree', u: 'unsure',
  sla: 'somewhat_agree', a: 'agree', sa: 'strongly_agree',
};
let n = 0;
const h = (userId: string, position: PositionType | null, changedAt: string, pointId = 'p1'): HistoryRow =>
  ({ id: `h${++n}`, pointId, userId, position, changedAt });
const cur = (userId: string, position: PositionType, pointId = 'p1'): CurrentRow => ({ pointId, userId, position });
const ver = (listenerId: string, createdAt: string, accuracyAchieved: boolean | null = true, storyId = 's1'): VerificationRow =>
  ({ id: `v${++n}`, storyId, listenerId, accuracyAchieved, createdAt });

const base = (over: Partial<StoryMovementRows>): StoryMovementRows => ({
  stories: [{ id: 's1', authorId: 'author' }],
  storyPoints: [{ storyId: 's1', pointId: 'p1' }],
  verifications: [], history: [], current: [], agentIds: [], ...over,
});
const point1 = (rows: StoryMovementRows, storyId = 's1') => storyMovements(rows).get(storyId)!.points[0]!;

describe('P1061 position levels and kinds', () => {
  it('strength: switched sides vs other vs same', () => {
    expect(strengthOf({ before: -2, after: 2 })).toBe('switched');
    expect(strengthOf({ before: 3, after: -1 })).toBe('switched');
    expect(strengthOf({ before: 0, after: 2 })).toBe('other'); // unsure -> agree
    expect(strengthOf({ before: 2, after: 0 })).toBe('other');
    expect(strengthOf({ before: -3, after: -1 })).toBe('other');
    expect(strengthOf({ before: 1, after: 1 })).toBe('same');
  });
  it('direction: lower is left, higher is right', () => {
    expect(directionOf({ before: 2, after: -1 })).toBe('left');
    expect(directionOf({ before: -1, after: 2 })).toBe('right');
    expect(directionOf({ before: 1, after: 1 })).toBe('same');
  });
  it('not-verified bar threshold', () => {
    expect(drawsNotVerified(4)).toBe(false);
    expect(drawsNotVerified(5)).toBe(true);
  });
  it('localDay uses the local calendar day', () => {
    const d = new Date(2026, 5, 15, 23, 30); // local 23:30
    const expected = `2026-06-15`;
    expect(localDay(d.toISOString())).toBe(expected);
  });
});

describe('P1061 a person\'s positions on a point', () => {
  it('skips removals', () => {
    const rows = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', null, '2026-01-02T10:00:00Z'), h('u1', P.d!, '2026-01-03T10:00:00Z')];
    expect(positionsOf(rows).map(e => e.level)).toEqual([2, -2]);
  });
  it('a reasoning-only row is not a change', () => {
    const rows = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-01-02T10:00:00Z')];
    expect(positionsOf(rows)).toHaveLength(1);
  });
  it('removing and re-taking the same position is not a change', () => {
    const rows = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', null, '2026-01-02T10:00:00Z'), h('u1', P.a!, '2026-01-03T10:00:00Z')];
    expect(positionsOf(rows)).toHaveLength(1);
  });
  it('orders by changed_at regardless of input order', () => {
    const rows = [h('u1', P.d!, '2026-01-03T10:00:00Z'), h('u1', P.a!, '2026-01-01T10:00:00Z')];
    expect(positionsOf(rows).map(e => e.level)).toEqual([2, -2]);
  });
  it('before: last row at or before the moment; removal or none means no before', () => {
    const rows = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.d!, '2026-01-05T10:00:00Z'), h('u1', null, '2026-01-07T10:00:00Z')];
    expect(positionAt(rows, '2026-01-03T00:00:00Z')).toBe(2);
    expect(positionAt(rows, '2026-01-05T10:00:00Z')).toBe(-2); // at the moment counts
    expect(positionAt(rows, '2026-01-08T00:00:00Z')).toBeNull(); // removal
    expect(positionAt(rows, '2025-12-31T00:00:00Z')).toBeNull(); // none
  });
});

describe('P1061 verification rules', () => {
  it('two verifications by the same story count once, from the earliest', () => {
    const l = listenersOf('s1', [ver('u1', '2026-02-05T10:00:00Z'), ver('u1', '2026-02-01T10:00:00Z')], new Set());
    expect(l.verified.size).toBe(1);
    expect(l.verified.get('u1')).toBe('2026-02-01T10:00:00Z');
  });
  it('an unrated explain-back is not verified, and sits in notVerified at its earliest row', () => {
    const l = listenersOf('s1', [ver('u1', '2026-02-05T10:00:00Z', null), ver('u1', '2026-02-02T10:00:00Z', false)], new Set());
    expect(l.verified.size).toBe(0);
    expect(l.notVerified.get('u1')).toBe('2026-02-02T10:00:00Z');
  });
  it('a verified person is never also not verified', () => {
    const l = listenersOf('s1', [ver('u1', '2026-02-01T10:00:00Z', false), ver('u1', '2026-02-03T10:00:00Z', true)], new Set());
    expect(l.verified.has('u1')).toBe(true);
    expect(l.notVerified.has('u1')).toBe(false);
  });
  it('an agent account is excluded', () => {
    const l = listenersOf('s1', [ver('bot', '2026-02-01T10:00:00Z')], new Set(['bot']));
    expect(l.verified.size).toBe(0);
  });
  it('a story by an agent account has no count at all', () => {
    const rows = base({ stories: [{ id: 's1', authorId: 'bot' }], agentIds: ['bot'], verifications: [ver('u1', '2026-02-01T10:00:00Z')] });
    expect(storyMovements(rows).has('s1')).toBe(false);
  });
  it('verificationsOf: one per story, earliest, agent stories left out', () => {
    const out = verificationsOf('u1',
      [{ id: 's1', authorId: 'author' }, { id: 's2', authorId: 'bot' }],
      [ver('u1', '2026-02-05T10:00:00Z'), ver('u1', '2026-02-01T10:00:00Z'), ver('u1', '2026-02-02T10:00:00Z', true, 's2')], ['bot']);
    expect(out).toEqual([{ storyId: 's1', authorId: 'author', at: '2026-02-01T10:00:00Z' }]);
  });
});

describe('P1061 the read layer filters (non-author, author as listener, letter rows)', () => {
  // Those three rules are enforced in the SQL read function, not in the TypeScript model, so the test pins the
  // WHERE clause text; and the model must ignore a verification whose story is not in `stories`.
  const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261117160000_p1061_position_movement_reads.sql'), 'utf8');
  it('both read functions carry the verification conditions', () => {
    for (const clause of ["sv.source = 'live'", 'sv.speaker_id = st.author_id', 'sv.listener_id IS NOT NULL', 'sv.listener_id <> st.author_id']) {
      expect(sql.split(clause).length - 1, clause).toBeGreaterThanOrEqual(2);
    }
  });
  it('a verification row for a story not in stories is never counted', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z', true, 'other-story')],
      history: [h('u1', P.a!, '2026-01-01T10:00:00Z')], current: [cur('u1', P.a!)],
    });
    expect(storyMovements(rows).get('s1')!.verifiedCount).toBe(0);
  });
});

describe('P1061 story side: before -> latest', () => {
  it('counts a mover, arrows right, and verifiedCount includes a verified non-holder', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z'), ver('u2', '2026-02-01T11:00:00Z')],
      history: [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-03-01T10:00:00Z')],
      current: [cur('u1', P.a!)], // u2 holds nothing
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.verifiedCount).toBe(2);
    expect(m.moved).toBe(1);
    const p = m.points[0]!;
    expect(p.verified).toEqual({ switched: 1, other: 0, same: 0 });
    expect(p.arrows).toEqual({ left: 0, same: 0, right: 1 });
    expect(arrowsOn(m, 'p1')).toEqual({ left: 0, same: 0, right: 1 });
  });
  it('arrows go left when the latest is lower', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.sla!, '2026-03-01T10:00:00Z')], current: [cur('u1', P.sla!)],
    });
    expect(point1(rows).arrows.left).toBe(1);
  });
  it('a person who never changed since is Same; a person who changed and came back is Same', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z'), ver('u2', '2026-02-01T10:00:00Z')],
      history: [
        h('u1', P.a!, '2026-01-01T10:00:00Z'),
        h('u2', P.a!, '2026-01-01T10:00:00Z'), h('u2', P.d!, '2026-03-01T10:00:00Z'), h('u2', P.a!, '2026-04-01T10:00:00Z'),
      ],
      current: [cur('u1', P.a!), cur('u2', P.a!)],
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.points[0]!.verified.same).toBe(2);
    expect(m.moved).toBe(0);
    expect(arrowsOn(m, 'p1')).toBeNull();
  });
  it('a person with no position before the verification is not counted on that point', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [h('u1', P.a!, '2026-03-01T10:00:00Z')], current: [cur('u1', P.a!)],
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.points[0]!.verified).toEqual({ switched: 0, other: 0, same: 0 });
    expect(m.verifiedCount).toBe(1);
  });
  it('a removal before the verification means no before', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', null, '2026-01-15T10:00:00Z'), h('u1', P.a!, '2026-03-01T10:00:00Z')],
      current: [cur('u1', P.a!)],
    });
    expect(point1(rows).verified).toEqual({ switched: 0, other: 0, same: 0 });
  });
  it('a person who removed their position after the verification is not counted (not a holder)', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', null, '2026-03-01T10:00:00Z')],
      current: [],
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.points[0]!.verified).toEqual({ switched: 0, other: 0, same: 0 });
    expect(m.moved).toBe(0);
    expect(m.verifiedCount).toBe(1);
  });
  it('a reasoning-only row after the verification is not a change', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-03-01T10:00:00Z')], current: [cur('u1', P.a!)],
    });
    expect(point1(rows).verified.same).toBe(1);
  });
  it('not-verified bar: an unrated explain-back is counted there, from its earliest row, with other kinds', () => {
    const rows = base({
      verifications: [ver('u1', '2026-02-05T10:00:00Z', null), ver('u1', '2026-02-01T10:00:00Z', false)],
      history: [h('u1', P.u!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-02-03T10:00:00Z')], current: [cur('u1', P.a!)],
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.verifiedCount).toBe(0);
    expect(m.moved).toBe(0); // only verified people count in "N moved"
    expect(m.points[0]!.notVerified).toEqual({ switched: 0, other: 1, same: 0 }); // unsure -> agree is "other"
    expect(m.points[0]!.arrows).toEqual({ left: 0, same: 0, right: 0 });
  });
  it('agent listener is excluded from every bar', () => {
    const rows = base({
      agentIds: ['bot'], verifications: [ver('bot', '2026-02-01T10:00:00Z')],
      history: [h('bot', P.d!, '2026-01-01T10:00:00Z')], current: [cur('bot', P.d!)],
    });
    const m = storyMovements(rows).get('s1')!;
    expect(m.verifiedCount).toBe(0);
    expect(m.points[0]!.verified.same).toBe(0);
  });
  it('"N moved" counts a person once across several points', () => {
    const rows = base({
      storyPoints: [{ storyId: 's1', pointId: 'p1' }, { storyId: 's1', pointId: 'p2' }],
      verifications: [ver('u1', '2026-02-01T10:00:00Z')],
      history: [
        h('u1', P.d!, '2026-01-01T10:00:00Z', 'p1'), h('u1', P.a!, '2026-03-01T10:00:00Z', 'p1'),
        h('u1', P.d!, '2026-01-01T10:00:00Z', 'p2'), h('u1', P.sld!, '2026-03-01T10:00:00Z', 'p2'),
      ],
      current: [cur('u1', P.a!, 'p1'), cur('u1', P.sld!, 'p2')],
    });
    expect(storyMovements(rows).get('s1')!.moved).toBe(1);
  });
});

describe('P1061 point side: first -> latest', () => {
  it('lists a holder with at least two positions, first against current', () => {
    const history = [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-02-01T10:00:00Z'), h('u2', P.a!, '2026-01-01T10:00:00Z')];
    const out = readingsOf(history, [cur('u1', P.a!), cur('u2', P.a!)], []);
    expect(out.map(r => r.userId)).toEqual(['u1']);
    expect(out[0]).toMatchObject({ first: -2, latest: 2 });
  });
  it('a reasoning-only row does not make a second position', () => {
    const history = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-02-01T10:00:00Z')];
    expect(readingsOf(history, [cur('u1', P.a!)], [])).toEqual([]);
  });
  it('a person who changed and came back is listed with Same', () => {
    const history = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.d!, '2026-02-01T10:00:00Z'), h('u1', P.a!, '2026-03-01T10:00:00Z')];
    const [r] = readingsOf(history, [cur('u1', P.a!)], []);
    expect(strengthOf({ before: r!.first, after: r!.latest })).toBe('same');
  });
  it('agent is excluded from readings but included in spreadShift', () => {
    const history = [h('bot', P.d!, '2026-01-01T10:00:00Z'), h('bot', P.a!, '2026-02-01T10:00:00Z')];
    const current = [cur('bot', P.a!)];
    expect(readingsOf(history, current, ['bot'])).toEqual([]);
    const s = spreadShift(history, current);
    expect(s.first.disagree).toBe(1);
    expect(s.now.agree).toBe(1);
    expect(s.changed).toBe(true);
  });
  it('spreadShift: a holder with no history is counted at current in both; unchanged is not changed', () => {
    const s = spreadShift([], [cur('u1', P.a!)]);
    expect(s.first.agree).toBe(1);
    expect(s.now.agree).toBe(1);
    expect(s.changed).toBe(false);
  });
  it('dates: first and last positions inside the dates', () => {
    const history = [
      h('u1', P.sd!, '2026-01-01T10:00:00Z'), h('u1', P.d!, '2026-02-01T10:00:00Z'),
      h('u1', P.sla!, '2026-03-01T10:00:00Z'), h('u1', P.a!, '2026-04-01T10:00:00Z'),
    ];
    const [r] = readingsOf(history, [cur('u1', P.a!)], [], { from: '2026-02-01', to: '2026-03-31' }, dayOf);
    expect(r).toMatchObject({ first: -2, latest: 1 });
  });
  it('dates that leave one position drop the person from the dated view', () => {
    const history = [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-04-01T10:00:00Z')];
    expect(readingsOf(history, [cur('u1', P.a!)], [], { from: '2026-03-01', to: '2026-05-01' }, dayOf)).toEqual([]);
  });
  it('dates that fall inside a removal drop the person', () => {
    const history = [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', null, '2026-02-01T10:00:00Z'), h('u1', P.a!, '2026-05-01T10:00:00Z')];
    expect(readingsOf(history, [cur('u1', P.a!)], [], { from: '2026-02-05', to: '2026-04-30' }, dayOf)).toEqual([]);
  });
});

describe('P1061 chosenPeople', () => {
  it('everyone when nothing is chosen; people, events and groups add up', () => {
    expect(chosenPeople(EVERYONE, [], [])).toBeNull();
    const scope = { ...EVERYONE, people: ['a'], events: ['e1'], groups: ['g1'] };
    const got = chosenPeople(scope, [{ id: 'e1', memberIds: ['b'] }, { id: 'e2', memberIds: ['x'] }], [{ id: 'g1', memberIds: ['c'] }])!;
    expect([...got].sort()).toEqual(['a', 'b', 'c']);
  });
});
