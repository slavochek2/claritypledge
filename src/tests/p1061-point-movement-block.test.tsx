/**
 * P1061: the point page's positions block with its Positions | Changes switch, and the point card's spread.
 * Changes, the first-to-today spread and the movement read itself exist only where the viewer can read every
 * holder's history (a public point, or a non-public point's first validator); `?view=changes` opens Changes; a
 * failed read says so, with a retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { PointMovementRows } from '@/app/data/movement-service';
import type { HistoryRow } from '@/lib/position-movement';

const getPointMovement = vi.fn();
vi.mock('@/app/data/movement-service', () => ({ getPointMovement: (id: string) => getPointMovement(id) }));
// The real block is the canvas's too and is tested on its own; here it only has to show where the switch goes.
vi.mock('@/app/components/social/point-positions-block', () => ({
  PointPositionsBlock: ({ header }: { header?: ReactNode }) => <div data-testid="positions-block">{header}</div>,
}));

import { PointCardSpread, PointPositionsWithChanges } from '@/app/components/movement/point-movement-block';
import { readsAllHistory } from '@/app/components/movement/use-point-movement';

const POINT = 'point-id-0001';
const counts = { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 1, strongly_disagree: 0 };
const h = (n: number, user: string, position: HistoryRow['position'], day: number): HistoryRow =>
  ({ id: `row-id-000${n}`, pointId: POINT, userId: user, position, changedAt: `2026-09-1${day}T12:00:00.000Z` });

const rows: PointMovementRows = {
  pointId: POINT, stories: [], verifications: [], agentIds: [], events: [], groups: [],
  history: [h(1, 'user-id-0001', 'disagree', 0), h(2, 'user-id-0001', 'agree', 1), h(3, 'user-id-0002', 'disagree', 2)],
  current: [{ pointId: POINT, userId: 'user-id-0001', position: 'agree' }, { pointId: POINT, userId: 'user-id-0002', position: 'disagree' }],
  people: new Map([['user-id-0001', { id: 'user-id-0001', name: 'Test Person 1', slug: null, avatarUrl: null, avatarColor: null, hasPledged: false }]]),
};

const block = (point: { id: string; visibility: string; firstValidatorId: string }, viewerId: string | undefined, url = '/point/x') => render(
  <MemoryRouter initialEntries={[url]}>
    <PointPositionsWithChanges
      point={point} signedIn={!!viewerId} viewerId={viewerId}
      positions={[]} counts={counts} stories={[]} filter="all" onFilterChange={() => {}} expandedId={null} onExpandedChange={() => {}}
    />
  </MemoryRouter>,
);

// A block body: a function returned from beforeEach would run as its cleanup.
beforeEach(() => { getPointMovement.mockReset(); });

describe('P1061 the positions block on the point page', () => {
  it('a non-public point, for someone who is not its first validator: today\'s block, no switch, no read', () => {
    block({ id: POINT, visibility: 'private', firstValidatorId: 'user-id-0009' }, 'user-id-0001');
    expect(screen.getByTestId('positions-block')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull();
    expect(getPointMovement).not.toHaveBeenCalled();
  });

  it('a non-public point, for its first validator: the switch', async () => {
    getPointMovement.mockResolvedValue(rows);
    block({ id: POINT, visibility: 'private', firstValidatorId: 'user-id-0001' }, 'user-id-0001');
    expect(screen.getByRole('tab', { name: 'Changes' })).toBeTruthy();
    await waitFor(() => expect(getPointMovement).toHaveBeenCalledWith(POINT));
  });

  it('?view=changes opens Changes: loading, then the people', async () => {
    let release: (r: PointMovementRows) => void = () => {};
    getPointMovement.mockReturnValue(new Promise<PointMovementRows>(r => { release = r; }));
    block({ id: POINT, visibility: 'public', firstValidatorId: 'user-id-0009' }, undefined, '/point/x?view=changes');
    expect(screen.getByTestId('changes-loading')).toBeTruthy();
    release(rows);
    await waitFor(() => expect(screen.getByTestId('changes-block')).toBeTruthy());
    expect(screen.getByText('Test Person 1')).toBeTruthy();
  });

  it('a failed read says so and asks again on "Try again"; Positions stays', async () => {
    getPointMovement.mockRejectedValueOnce(new Error('Could not load how positions changed'));
    block({ id: POINT, visibility: 'public', firstValidatorId: 'user-id-0009' }, undefined, '/point/x?view=changes');
    await waitFor(() => expect(screen.getByTestId('changes-error')).toBeTruthy());
    getPointMovement.mockResolvedValueOnce(rows);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('changes-block')).toBeTruthy());
    expect(getPointMovement).toHaveBeenCalledTimes(2);
  });
});

describe('P1061 who reads all history fails closed', () => {
  it('a point object without its visibility is not public', () => {
    expect(readsAllHistory({ firstValidatorId: 'user-id-0001' }, 'user-id-0002')).toBe(false);
    expect(readsAllHistory({ visibility: null, firstValidatorId: 'user-id-0001' }, undefined)).toBe(false);
  });
});

describe('P1061 the point card spread', () => {
  const spread = (point: { id: string; visibility: string; firstValidatorId: string }, viewer: { id: string } | null) =>
    render(<PointCardSpread point={point} viewer={viewer} counts={counts} />);

  it('first positions → today once someone\'s first differs from their current one', async () => {
    getPointMovement.mockResolvedValue(rows);
    spread({ id: POINT, visibility: 'public', firstValidatorId: 'user-id-0009' }, null);
    await waitFor(() => expect(screen.getByTestId('spread-shift')).toBeTruthy());
    expect(screen.getByTestId('position-spread-first')).toBeTruthy();
  });

  it('today\'s row alone while the rows count other people than the counts on screen', async () => {
    getPointMovement.mockResolvedValue({ ...rows, current: rows.current.slice(0, 1) });
    spread({ id: POINT, visibility: 'public', firstValidatorId: 'user-id-0009' }, null);
    await waitFor(() => expect(getPointMovement).toHaveBeenCalled());
    expect(screen.queryByTestId('spread-shift')).toBeNull();
    expect(screen.getByTestId('point-spread-row')).toBeTruthy();
  });

  it('a non-public point for someone else: today\'s row, no read', () => {
    spread({ id: POINT, visibility: 'private', firstValidatorId: 'user-id-0009' }, { id: 'user-id-0001' });
    expect(screen.getByTestId('point-spread-row')).toBeTruthy();
    expect(getPointMovement).not.toHaveBeenCalled();
  });
});
