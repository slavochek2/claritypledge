/**
 * @file p1061-movement-components.test.tsx
 * @description P1061: render tests of the position-movement components against the spec's UI Contract.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MovedChip, StoryCountChip } from '@/app/components/movement/movement-bits';
import { chipHint, strengthHint } from '@/app/components/movement/movement-copy';
import { MovementFilter } from '@/app/components/movement/movement-filter';
import { PointChangesView } from '@/app/components/movement/point-changes';
import { StoryMovementPanel } from '@/app/components/movement/story-movement-panel';
import type { MovementPerson, PointMovementRows } from '@/app/data/movement-service';
import type { PositionType } from '@/app/types';
import { EVERYONE, type HistoryRow, type StoryMovement, type StrengthCounts } from '@/lib/position-movement';

const counts = (switched: number, other: number, same: number): StrengthCounts => ({ switched, other, same });
const movement = (moved: number, notVerified: StrengthCounts): StoryMovement => ({
  storyId: 'story-id-0001',
  verifiedCount: 5,
  moved,
  points: [{ pointId: 'point-id-0001', arrows: { left: 1, same: 0, right: 2 }, verified: counts(1, 1, 1), notVerified }],
});
const POINTS = [{ id: 'point-id-0001', statement: 'Test statement one' }];

const person = (n: number): MovementPerson => ({ id: `user-id-000${n}`, name: `Test Person ${n}`, slug: null, avatarUrl: null, avatarColor: null, hasPledged: false });
let rows = 0;
const hist = (n: number | string, position: PositionType, d: number): HistoryRow => ({
  id: `row-id-${String(++rows).padStart(4, '0')}`, pointId: 'point-id-0001', userId: typeof n === 'number' ? `user-id-000${n}` : n, position, changedAt: `2026-09-${10 + d}T12:00:00.000Z`,
});
const DATA: PointMovementRows = {
  pointId: 'point-id-0001',
  stories: [],
  verifications: [],
  history: [hist(1, 'agree', 0), hist(1, 'disagree', 1), hist(2, 'agree', 0), hist(3, 'agree', 0), hist(3, 'unsure', 1), hist('user-id-0099', 'agree', 0), hist('user-id-0099', 'disagree', 1)],
  current: [
    { pointId: 'point-id-0001', userId: 'user-id-0001', position: 'disagree' },
    { pointId: 'point-id-0001', userId: 'user-id-0002', position: 'agree' },
    { pointId: 'point-id-0001', userId: 'user-id-0003', position: 'unsure' },
    { pointId: 'point-id-0001', userId: 'user-id-0099', position: 'disagree' },
  ],
  agentIds: ['user-id-0099'],
  people: new Map([1, 2, 3].map(n => [`user-id-000${n}`, person(n)] as const)),
  events: [{ id: 'event-id-0001', title: 'Test Event A', datetime: '2026-09-10T12:00:00.000Z', memberIds: ['user-id-0001'] }],
  groups: [{ id: 'group-id-0001', name: 'Test Group A', memberIds: ['user-id-0001', 'user-id-0003'] }],
};

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('P1061 movement components', () => {
  it('StoryCountChip renders nothing at moved=0 and "3 moved" at 3', () => {
    const { container, rerender } = wrap(<StoryCountChip movement={movement(0, counts(0, 0, 0))} authorName="Test Person 1" pointCount={1} />);
    expect(container.querySelector('[data-testid="count-chip"]')).toBeNull();
    rerender(<MemoryRouter><StoryCountChip movement={movement(3, counts(0, 0, 0))} authorName="Test Person 1" pointCount={1} /></MemoryRouter>);
    expect(screen.getByTestId('count-chip').textContent).toContain('3 moved');
  });

  it('MovedChip label counts both sides', () => {
    wrap(<MovedChip arrows={{ left: 1, same: 4, right: 2 }} authorName="Test Person 1" />);
    expect(screen.getByLabelText(/1 moved toward disagree, 2 moved toward agree/)).toBeTruthy();
  });

  it('the corrected sentences read as in the UI Contract', () => {
    expect(chipHint({ left: 1, same: 2, right: 3 }, 'A')).toMatch(/2 ended where they started\.$/);
    expect(chipHint({ left: 1, same: 2, right: 3 }, 'A')).not.toContain('kept their position');
    const hint = strengthHint('A');
    expect(hint).toContain('Each person is counted from the position they held at the explain-back to their latest one, also when they have not changed it since.');
    expect(hint).toContain('The second bar is drawn only for five or more people.');
    expect(hint).not.toContain('singled out');
  });

  it('StoryMovementPanel withholds the second bar for 4 and draws it for 5', () => {
    const { unmount } = wrap(<StoryMovementPanel movement={movement(3, counts(1, 2, 1))} authorName="Test Person 1" points={POINTS} defaultOpen />);
    expect(screen.getByTestId('strength-withheld').getAttribute('aria-label')).toContain('not shown for fewer than 5 people');
    expect(screen.queryByTestId('strength-not-verified')).toBeNull();
    unmount();
    wrap(<StoryMovementPanel movement={movement(3, counts(1, 2, 2))} authorName="Test Person 1" points={POINTS} defaultOpen />);
    expect(screen.getByTestId('strength-not-verified')).toBeTruthy();
    expect(screen.queryByTestId('strength-withheld')).toBeNull();
  });

  it('MovementFilter Reset is the blue-bordered outline pill', () => {
    wrap(<MovementFilter data={DATA} scope={{ ...EVERYONE, people: ['user-id-0001'] }} onChange={() => {}} signedIn defaultOpen />);
    expect(screen.getByRole('button', { name: 'Reset' }).className).toContain('border-blue-600');
  });

  it('MovementFilter offers no events or groups when signed out, and does when signed in', () => {
    const { unmount } = wrap(<MovementFilter data={DATA} scope={EVERYONE} onChange={() => {}} signedIn={false} defaultOpen />);
    const dialog = screen.getByTestId('scope-dialog');
    expect(within(dialog).queryByText('Test Event A')).toBeNull();
    expect(within(dialog).queryByText('Test Group A')).toBeNull();
    expect(within(dialog).getByText('Test Person 1')).toBeTruthy();
    unmount();
    wrap(<MovementFilter data={DATA} scope={EVERYONE} onChange={() => {}} signedIn defaultOpen />);
    expect(screen.getByText('Test Event A')).toBeTruthy();
    expect(screen.getByText('Event · 1 person')).toBeTruthy();
    expect(screen.getByText('Test Group A')).toBeTruthy();
    expect(screen.getByLabelText('Test Group A, 2 people')).toBeTruthy();
  });

  it('PointChangesView lists only holders with two positions and never an agent', () => {
    wrap(<PointChangesView data={DATA} scope={EVERYONE} />);
    const rows = screen.getAllByTestId('row-change');
    expect(rows).toHaveLength(2);
    expect(screen.getByLabelText(/Test Person 1’s positions over time/)).toBeTruthy();
    expect(screen.getByLabelText(/Test Person 3’s positions over time/)).toBeTruthy();
    expect(screen.queryByLabelText(/Test Person 2’s positions/)).toBeNull();
    expect(screen.queryByText(/user-id-0099/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Test Person 1’s positions over time/));
    expect(screen.getByTestId('person-log')).toBeTruthy();
  });
});
