/**
 * @file p1179-no-refetch-on-position.test.tsx
 * @description P1179 AC-9 — no refetch is wired to a position change.
 *
 * The guard that keeps optimistic counts from causing a loading flash must not
 * be reintroduced. This asserts on the OBSERVED CALL COUNT across a position
 * change, which is the same thing the e2e spec asserts on network requests —
 * a claim that "the dependency array looks right" is not evidence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StakePage } from '@/app/pages/stake-page';
import type { PointWithUserPosition } from '@/app/types';

const getPoints = vi.hoisted(() => vi.fn());
const getStories = vi.hoisted(() => vi.fn());

vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: getPoints } }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getPublicStoriesFeed: getStories } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
// The card exposes its removal callback as a button so the parent's reaction to
// a position change is observable without driving the real card's internals.
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point, onPointRemoved }: { point: PointWithUserPosition; onPointRemoved?: (id: string, p: null) => void }) => (
    <div data-testid="point-card">
      {point.statement}
      <button data-testid={`withdraw-${point.id}`} onClick={() => onPointRemoved?.(point.id, null)}>withdraw</button>
    </div>
  ),
}));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: () => null }));

const point = (id: string, statement: string, total = 2) => ({
  id, statement, tags: ['cmp7'], positionCounts: {}, totalPositions: total,
} as unknown as PointWithUserPosition);

beforeEach(() => {
  getPoints.mockReset().mockResolvedValue([point('p1', 'first'), point('p2', 'second')]);
  getStories.mockReset().mockResolvedValue([]);
});

function renderStake() {
  return render(
    <MemoryRouter initialEntries={['/stake/cmp7']}>
      <Routes><Route path="/stake/:tag" element={<StakePage />} /></Routes>
    </MemoryRouter>
  );
}

describe('P1179 AC-9 — a position change triggers no refetch and no loading flash', () => {
  it('fetches exactly ONCE on mount', async () => {
    renderStake();
    await screen.findAllByTestId('point-card');
    expect(getPoints).toHaveBeenCalledTimes(1);
  });

  it('a position change does NOT refetch the list', async () => {
    renderStake();
    await screen.findAllByTestId('point-card');
    const before = getPoints.mock.calls.length;
    await userEvent.click(screen.getByTestId('withdraw-p1'));
    await waitFor(() => expect(screen.getAllByTestId('point-card')).toHaveLength(2));
    expect(getPoints).toHaveBeenCalledTimes(before);
  });

  it('the skeleton never returns after the first load — that IS the loading flash', async () => {
    renderStake();
    await screen.findAllByTestId('point-card');
    expect(screen.queryByTestId('skeleton')).toBeNull();
    await userEvent.click(screen.getByTestId('withdraw-p1'));
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getAllByTestId('point-card')).toHaveLength(2);
  });

  it('withdrawing the LAST position removes the point locally, still with no refetch', async () => {
    getPoints.mockResolvedValue([point('p1', 'first', 1), point('p2', 'second', 2)]);
    renderStake();
    await screen.findAllByTestId('point-card');
    await userEvent.click(screen.getByTestId('withdraw-p1'));
    await waitFor(() => expect(screen.getAllByTestId('point-card')).toHaveLength(1));
    expect(getPoints).toHaveBeenCalledTimes(1);
  });

  it('the source wires no refetch to a position change — the guard is not reintroduced', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/app/pages/stake-page.tsx'), 'utf8');
    // handlePointRemoved must not call fetchData, directly or via an effect dep.
    const handler = src.slice(src.indexOf('handlePointRemoved'), src.indexOf('const showTabs'));
    expect(handler).not.toContain('fetchData');
  });
});
