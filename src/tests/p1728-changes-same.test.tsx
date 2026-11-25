/**
 * @file p1728-changes-same.test.tsx
 * @description P1728: the point page's Changes view counts every holder with at least one position, so
 * "Same" means everyone who ended where they began. Expected values come from the spec's Redesign and
 * Acceptance Criteria, not from the code.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonLog } from '@/app/components/movement/movement-charts';
import { chartHint } from '@/app/components/movement/movement-copy';
import { MovementFilter } from '@/app/components/movement/movement-filter';
import { byChangeThenName, offersFilter } from '@/app/components/movement/movement-scope';
import { PointChangesView } from '@/app/components/movement/point-changes';
import type { MovementPerson, PointMovementRows } from '@/app/data/movement-service';
import type { PositionType } from '@/app/types';
import {
  changeOf, directionOf, EVERYONE, readingsOf,
  type CurrentRow, type HistoryRow,
} from '@/lib/position-movement';

const dayOf = (at: string) => at.slice(0, 10);
const P: Record<string, PositionType> = { d: 'disagree', u: 'unsure', a: 'agree' };
let n = 0;
const h = (userId: string, position: PositionType | null, changedAt: string, pointId = 'p1'): HistoryRow =>
  ({ id: `h${++n}`, pointId, userId, position, changedAt });
const cur = (userId: string, position: PositionType, pointId = 'p1'): CurrentRow => ({ pointId, userId, position });

describe('P1728 readingsOf: every holder with at least one position', () => {
  it('a holder whose one history position equals the current one is listed, first === latest, Same', () => {
    const [r] = readingsOf([h('u1', P.a!, '2026-01-01T10:00:00Z')], [cur('u1', P.a!)], []);
    expect(r).toMatchObject({ userId: 'u1', first: 2, latest: 2 });
    expect(r!.entries).toHaveLength(1);
    expect(directionOf(changeOf(r!))).toBe('same');
  });

  it('a holder with no history row is listed at their current position as first and latest (Same)', () => {
    const [r] = readingsOf([], [cur('u1', P.d!)], []);
    expect(r).toMatchObject({ userId: 'u1', first: -2, latest: -2, entries: [] });
    expect(directionOf(changeOf(r!))).toBe('same');
  });

  it('a holder whose history has only removal rows is the same case', () => {
    const [r] = readingsOf([h('u1', null, '2026-01-01T10:00:00Z')], [cur('u1', P.u!)], []);
    expect(r).toMatchObject({ userId: 'u1', first: 0, latest: 0, entries: [] });
    expect(directionOf(changeOf(r!))).toBe('same');
  });

  it('dated view: one position inside the dates is listed as Same, first and latest being that position', () => {
    const history = [h('u1', P.d!, '2026-01-01T10:00:00Z'), h('u1', P.u!, '2026-03-10T10:00:00Z'), h('u1', P.a!, '2026-06-01T10:00:00Z')];
    const [r] = readingsOf(history, [cur('u1', P.a!)], [], { from: '2026-03-01', to: '2026-03-31' }, dayOf);
    expect(r).toMatchObject({ userId: 'u1', first: 0, latest: 0 });
    expect(directionOf(changeOf(r!))).toBe('same');
  });

  it('dated view: no position inside the dates is not listed, with or without a history row, nor inside a removal', () => {
    const range = { from: '2026-03-01', to: '2026-03-31' };
    const outside = [h('u1', P.d!, '2026-01-01T10:00:00Z')];
    expect(readingsOf(outside, [cur('u1', P.d!)], [], range, dayOf)).toEqual([]);
    expect(readingsOf([], [cur('u2', P.d!)], [], range, dayOf)).toEqual([]);
    const removal = [h('u3', P.d!, '2026-01-01T10:00:00Z'), h('u3', null, '2026-02-01T10:00:00Z'), h('u3', P.a!, '2026-05-01T10:00:00Z')];
    expect(readingsOf(removal, [cur('u3', P.a!)], [], { from: '2026-02-05', to: '2026-04-30' }, dayOf)).toEqual([]);
  });

  it('an agent account with one position is still excluded', () => {
    expect(readingsOf([h('bot', P.a!, '2026-01-01T10:00:00Z')], [cur('bot', P.a!)], ['bot'])).toEqual([]);
    expect(readingsOf([], [cur('bot', P.a!)], ['bot'])).toEqual([]);
  });

  it('a reasoning-only row (the same position twice) is listed once, Same', () => {
    const history = [h('u1', P.a!, '2026-01-01T10:00:00Z'), h('u1', P.a!, '2026-02-01T10:00:00Z')];
    const out = readingsOf(history, [cur('u1', P.a!)], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.entries).toHaveLength(1);
    expect(directionOf(changeOf(out[0]!))).toBe('same');
  });
});

describe('P1728 chartHint', () => {
  it.each([false, true])('dated=%s: no sentence about people drawn once, the other sentences kept', dated => {
    const hint = chartHint(dated);
    expect(hint).not.toContain('only once');
    expect(hint).not.toContain('not drawn');
    expect(hint).toContain('Strongly disagree on the left, strongly agree on the right.');
    expect(hint.startsWith(dated
      ? 'Outlined bars: each person’s first position inside the dates. Blue bars: their latest position inside the dates.'
      : 'Outlined bars: each person’s first position. Blue bars: their latest position.')).toBe(true);
    expect(hint.includes('inside the dates')).toBe(dated);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------------------------------------------

const POINT = 'point-id-0001';
const uid = (i: number) => `user-id-000${i}`;
const person = (i: number): MovementPerson => ({ id: uid(i), name: `Test Person ${i}`, slug: null, avatarUrl: null, avatarColor: null, hasPledged: false });
const row = (i: number, position: PositionType, day: number): HistoryRow =>
  ({ id: `row-id-${String(++n).padStart(4, '0')}`, pointId: POINT, userId: uid(i), position, changedAt: `2026-09-${10 + day}T12:00:00.000Z` });
const now = (i: number, position: PositionType): CurrentRow => ({ pointId: POINT, userId: uid(i), position });

/**
 * Persons 1-4 took one position and kept it, in `current` order BEFORE the movers: persons 5 (disagree to agree,
 * the larger change) and 6 (agree to unsure). Person 99 is an agent.
 */
const DATA: PointMovementRows = {
  pointId: POINT,
  stories: [],
  verifications: [],
  history: [
    row(1, 'agree', 0), row(2, 'agree', 0), row(3, 'unsure', 0), row(4, 'disagree', 0),
    row(5, 'disagree', 0), row(5, 'agree', 1), row(6, 'agree', 0), row(6, 'unsure', 1),
    { id: 'row-id-0099', pointId: POINT, userId: 'user-id-0099', position: 'agree', changedAt: '2026-09-10T12:00:00.000Z' },
  ],
  current: [
    now(1, 'agree'), now(2, 'agree'), now(3, 'unsure'), now(4, 'disagree'), now(5, 'agree'), now(6, 'unsure'),
    { pointId: POINT, userId: 'user-id-0099', position: 'agree' },
  ],
  agentIds: ['user-id-0099'],
  people: new Map([1, 2, 3, 4, 5, 6].map(i => [uid(i), person(i)] as const)),
  events: [
    { id: 'event-id-0001', title: 'Test Event Keepers', datetime: '2026-09-10T12:00:00.000Z', memberIds: [uid(1), uid(2)] },
  ],
  groups: [
    { id: 'group-id-0001', name: 'Test Group Keepers', memberIds: [uid(3), uid(4), 'user-id-0099'] },
  ],
};

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const rowButtons = () => screen.getAllByRole('button', { name: /positions over time/ });
const personOptions = () => screen.getAllByRole('button', { name: /, Person$/ }).map(b => b.getAttribute('aria-label')!.replace(/, Person$/, ''));

describe('P1728 MovementFilter', () => {
  it('offers one-position holders (found by typing the name) and counts every non-agent holder', () => {
    wrap(<MovementFilter data={DATA} scope={EVERYONE} onChange={() => {}} signedIn defaultOpen />);
    expect(screen.getByTestId('scope-count').textContent).toBe('6 people');
    // Person 4 kept one position: absent from the 4-person preview, found by typing.
    expect(personOptions()).not.toContain('Test Person 4');
    fireEvent.change(screen.getByLabelText('People, events, groups'), { target: { value: '4' } });
    expect(personOptions()).toEqual(['Test Person 4']);
    fireEvent.change(screen.getByLabelText('People, events, groups'), { target: { value: 'test' } });
    expect(personOptions()).toHaveLength(6);
  });

  it('with nothing typed the preview is the first 4 in the list order: the people who changed come first', () => {
    wrap(<MovementFilter data={DATA} scope={EVERYONE} onChange={() => {}} signedIn defaultOpen />);
    expect(personOptions()).toEqual(['Test Person 5', 'Test Person 6', 'Test Person 1', 'Test Person 2']);
  });

  it('with dates set, offers only the people the dates keep, matching the "N people" count', () => {
    // Day 1 holds only the second positions of persons 5 and 6; persons 1-4 took theirs on day 0.
    const dated = { ...EVERYONE, from: '2026-09-11', to: '2026-09-11' };
    wrap(<MovementFilter data={DATA} scope={dated} onChange={() => {}} signedIn defaultOpen />);
    expect(screen.getByTestId('scope-count').textContent).toBe('2 people');
    fireEvent.change(screen.getByLabelText('People, events, groups'), { target: { value: 'test' } });
    expect(personOptions()).toEqual(['Test Person 5', 'Test Person 6']);
  });

  it('offers an event or a group whose members are only one-position holders, with the count of them', () => {
    wrap(<MovementFilter data={DATA} scope={EVERYONE} onChange={() => {}} signedIn defaultOpen />);
    expect(screen.getByLabelText('Test Event Keepers, Event · 2 people')).toBeTruthy();
    // The agent member is not counted.
    expect(screen.getByLabelText('Test Group Keepers, 2 people')).toBeTruthy();
  });
});

describe('P1728 PointChangesView', () => {
  it('the tab counts add up to the people listed; people who changed come before people who did not', () => {
    wrap(<PointChangesView data={DATA} scope={EVERYONE} />);
    // Person 6 moved toward disagree (agree to unsure), person 5 toward agree, four kept their position.
    expect(screen.getByRole('button', { name: 'Moved toward disagree (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Same position (4)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Moved toward agree (1)' })).toBeTruthy();
    const names = rowButtons().map(b => /^(Test Person \d)/.exec(b.getAttribute('aria-label')!)![1]);
    expect(names).toEqual(['Test Person 5', 'Test Person 6', 'Test Person 1', 'Test Person 2', 'Test Person 3', 'Test Person 4']);
    // The chart draws every listed person: six first positions and six latest ones.
    const total = (bar: string) => [...document.querySelectorAll(`[data-bar="${bar}"]`)].reduce((s, r) => s + Number(r.getAttribute('data-count')), 0);
    expect(total('before')).toBe(6);
    expect(total('after')).toBe(6);
  });

  it('inside one size of change other than 0 the order is by name, however many positions each took', () => {
    // Person 1: one history row (unsure) and a current row that disagrees (agree), size 2, one entry.
    // Person 2: unsure then agree, size 2, two entries. Both moved, so by name: Person 1 first.
    const readings = readingsOf(
      [h('user-id-0002', P.u!, '2026-01-01T10:00:00Z'), h('user-id-0002', P.a!, '2026-02-01T10:00:00Z'), h('user-id-0001', P.u!, '2026-01-01T10:00:00Z')],
      [cur('user-id-0002', P.a!), cur('user-id-0001', P.a!)],
      [],
    );
    const sorted = [...readings].sort(byChangeThenName(r => (r.userId === 'user-id-0001' ? 'Test Person 1' : 'Test Person 2')));
    expect(sorted.map(r => r.userId)).toEqual(['user-id-0001', 'user-id-0002']);
  });

  it('someone who changed and came back (Same) is listed before the people who took one position', () => {
    // Person 7 went agree -> disagree -> agree: Same, but a mover; by name alone they would sort after persons 1-4.
    const cameBack: PointMovementRows = {
      ...DATA,
      history: [...DATA.history, row(7, 'agree', 0), row(7, 'disagree', 1), row(7, 'agree', 2)],
      current: [...DATA.current, now(7, 'agree')],
      people: new Map([...DATA.people, [uid(7), person(7)] as const]),
    };
    wrap(<PointChangesView data={cameBack} scope={EVERYONE} />);
    expect(screen.getByRole('button', { name: 'Same position (5)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Show all/ }));
    const names = rowButtons().map(b => /^(Test Person \d)/.exec(b.getAttribute('aria-label')!)![1]);
    expect(names).toEqual(['Test Person 5', 'Test Person 6', 'Test Person 7', 'Test Person 1', 'Test Person 2', 'Test Person 3', 'Test Person 4']);
  });

  it('a point whose holders all kept their position shows Same = N, the full list and a Filter pill', () => {
    const allSame: PointMovementRows = {
      ...DATA,
      history: DATA.history.filter(r => ['user-id-0001', 'user-id-0002', 'user-id-0003'].includes(r.userId)),
      current: DATA.current.filter(r => ['user-id-0001', 'user-id-0002', 'user-id-0003'].includes(r.userId)),
    };
    wrap(<PointChangesView data={allSame} scope={EVERYONE} />);
    expect(screen.getByRole('button', { name: 'Same position (3)' })).toBeTruthy();
    expect(rowButtons()).toHaveLength(3);
    expect(screen.queryByTestId('chart-empty')).toBeNull();
    expect(screen.queryByText(/No one here has a position/)).toBeNull();
    expect(offersFilter(allSame, EVERYONE)).toBe(true);
  });

  it('opening a one-position person draws their graph with one dot', () => {
    wrap(<PointChangesView data={DATA} scope={EVERYONE} />);
    fireEvent.click(screen.getByLabelText(/Test Person 1’s positions over time/));
    const chart = screen.getByTestId('log-chart');
    expect(chart.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getAllByTestId('log-position')).toHaveLength(1);
    // The graph scrolls inside its own box rather than widening the page.
    expect(screen.getByTestId('log-chart-scroll').className).toContain('overflow-x-auto');
  });

  it('opening a holder with no history row renders no drawing and no positions list, shows their verification lines as text, and does not throw', () => {
    const noHistory: PointMovementRows = {
      ...DATA,
      history: [],
      current: [now(1, 'agree')],
      stories: [{ id: 'story-id-0001', authorId: uid(2) }],
      verifications: [{ id: 'verification-id-0001', storyId: 'story-id-0001', listenerId: uid(1), accuracyAchieved: true, createdAt: '2026-09-12T12:00:00.000Z' }],
    };
    wrap(<PointChangesView data={noHistory} scope={EVERYONE} />);
    expect(screen.getByRole('button', { name: 'Same position (1)' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Test Person 1’s positions over time: Agree, unchanged/));
    expect(screen.getByTestId('person-log')).toBeTruthy();
    expect(screen.queryByTestId('log-chart')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(within(screen.getByTestId('verification')).getByText(/Test Person 2 verified Test Person 1’s understanding of/)).toBeTruthy();
  });

  it('a holder with no history row and no verification is listed, but their row does not open: nothing is behind it', () => {
    const bare: PointMovementRows = { ...DATA, history: [], current: [now(1, 'agree')], verifications: [] };
    wrap(<PointChangesView data={bare} scope={EVERYONE} />);
    expect(screen.getByRole('button', { name: 'Same position (1)' })).toBeTruthy();
    const row = screen.getByTestId('row-static');
    expect(within(row).getByText('Test Person 1')).toBeTruthy();
    // Screen readers hear one sentence, the button's label, not the name and two badges one by one.
    expect(row.querySelector('[aria-hidden]')!.textContent).toContain('Test Person 1');
    expect(row.querySelector('.sr-only')!.textContent).toBe('Test Person 1’s positions over time: Agree, unchanged');
    expect(screen.queryByRole('button', { name: /positions over time/ })).toBeNull();
    expect(screen.queryByTestId('person-log')).toBeNull();
  });
});

describe('P1728 PersonLog with no entries', () => {
  it('renders only the verification lines as text: no LogChart, no positions list', () => {
    const verifications = [{ storyId: 'story-id-0001', authorName: 'Test Author', at: '2026-09-12T12:00:00.000Z' }];
    expect(() => wrap(<PersonLog entries={[]} verifications={verifications} name="Test Person 1" />)).not.toThrow();
    expect(screen.queryByTestId('log-chart')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    const lines = screen.getAllByTestId('verification');
    expect(lines).toHaveLength(1);
    expect(within(lines[0]!).getByText(/Test Author verified Test Person 1’s understanding of/)).toBeTruthy();
  });

  it('still draws the graph and list when there are entries', () => {
    wrap(<PersonLog entries={[{ level: 2, at: '2026-09-10T12:00:00.000Z' }]} verifications={[]} name="Test Person 1" />);
    expect(screen.getByTestId('log-chart')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
  });
});
