/**
 * @file p1364-own-write-invalidation.test.tsx
 * @description P1364 review finding 1 — Back must never serve the list from BEFORE the reader's
 * own write.
 *
 * Unlike the other P1364 tests, this one does NOT mock `@/app/data/points-service` or
 * `@/app/data/stories-service`: those modules are the wrapper under test (mechanism 1 in list-return-cache.ts; they wrap the
 * implementations so every write clears the cache). Only the implementations underneath —
 * `*-service-real` and `*-service-mock` — are stubbed, identically, so whichever the env flag
 * selects is the stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import type { PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';

const svc = vi.hoisted(() => ({
  getPublicPointsFeed: vi.fn(),
  setPosition: vi.fn(async () => undefined),
  removePosition: vi.fn(async () => undefined),
  createPoint: vi.fn(async () => ({})),
  getPublicStoriesFeed: vi.fn(),
  getPointsForStories: vi.fn(async () => new Map()),
  getStoriesForPoints: vi.fn(async () => new Map()),
  updateStory: vi.fn(async () => ({})),
  deleteStory: vi.fn(async () => true),
  linkPointToStory: vi.fn(async () => true),
  unlinkPointFromStory: vi.fn(async () => true),
  createStory: vi.fn(async () => ({})),
}));
vi.mock('@/app/data/points-service-real', () => ({ realPointsService: svc }));
vi.mock('@/app/data/points-service-mock', () => ({ mockPointsService: svc }));
vi.mock('@/app/data/stories-service-real', () => ({ realStoriesService: svc }));
vi.mock('@/app/data/stories-service-mock', () => ({ mockStoriesService: svc }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

// The stub card writes through the REAL (wrapped) service module, as FeedPointCard does, and
// shows the position the page handed it.
vi.mock('@/app/components/feed/feed-point-card', async () => {
  const { pointsService } = await import('@/app/data/points-service');
  const { setAnonPosition } = await import('@/app/hooks/useAnonPosition');
  return {
    FeedPointCard: ({ point, onPointRemoved }: {
      point: PointWithUserPosition;
      onPointRemoved?: (id: string, pos: PositionType | null) => void;
    }) => (
      <div data-testid="point-card" data-id={point.id} data-user-position={point.userPosition?.position ?? 'none'}>
        <button type="button" onClick={() => void pointsService.setPosition(point.id, 'u1', 'agree' as PositionType)}>
          take {point.id}
        </button>
        <button type="button" onClick={() => setAnonPosition(point.id, 'agree')}>anon {point.id}</button>
        <button type="button" onClick={() => onPointRemoved?.(point.id, 'agree')}>withdraw {point.id}</button>
      </div>
    ),
  };
});
vi.mock('@/app/components/feed/feed-story-card', async () => {
  const { storiesService } = await import('@/app/data/stories-service');
  return {
    FeedStoryCard: ({ story }: { story: StoryWithAuthor }) => (
      <div data-testid="story-card">
        {story.content}
        <button type="button" onClick={() => void storiesService.updateStory(story.id, { content: 'edited' } as never)}>
          edit {story.id}
        </button>
      </div>
    ),
  };
});

import { FeedPage } from '@/app/pages/feed-page';
import { StakePage } from '@/app/pages/stake-page';

const point = (id: string, extra: Partial<PointWithUserPosition> = {}) =>
  ({ id, statement: `point ${id}`, tags: ['t'], systemTags: [], positionCounts: { agree: 1 }, totalPositions: 1, ...extra } as unknown as PointWithUserPosition);
// The viewer's own position, in the shape the feed service returns (PointPosition).
const mine = { id: 'pp1', pointId: 'p1', userId: 'u1', position: 'agree' as PositionType, createdAt: '2026-09-28', updatedAt: '2026-09-28' };
const story = (id: string) => ({ id, content: `story ${id}`, tags: ['t'] } as unknown as StoryWithAuthor);

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function renderApp(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <NavGrab />
      <Routes>
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/stake/:tag" element={<StakePage />} />
        <Route path="/point/:id" element={<div data-testid="point-page" />} />
      </Routes>
    </MemoryRouter>
  );
}
const go = (to: string | number) => act(() => { if (typeof to === 'number') nav(to); else nav(to); });
const card = (id: string) => screen.getAllByTestId('point-card').find(c => c.getAttribute('data-id') === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  // First load: no position. Any later load: the server has the reader's position.
  svc.getPublicPointsFeed.mockReset()
    .mockResolvedValueOnce([point('p1'), point('p2')])
    .mockResolvedValue([point('p1', { userPosition: mine, totalPositions: 2 }), point('p2')]);
  svc.getPublicStoriesFeed.mockReset().mockResolvedValue([story('s1')]);
});

describe('P1364 finding 1 — an own write invalidates the Back cache', () => {
  it('/feed: a position taken on a card → open an item → Back shows the position (refetched), not the stale row', async () => {
    renderApp(['/feed?tab=points']);
    await screen.findAllByTestId('point-card');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'take p1' })); });
    expect(svc.setPosition).toHaveBeenCalledTimes(1);
    go('/point/p1');
    go(-1);
    await waitFor(() => expect(card('p1').getAttribute('data-user-position')).toBe('agree'));
    expect(svc.getPublicPointsFeed).toHaveBeenCalledTimes(2);
  });

  it('/feed: rows still on screen after the write cannot re-fill the cache (a later tab switch writes nothing)', async () => {
    renderApp(['/feed?tab=points']);
    await screen.findAllByTestId('point-card');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'take p1' })); });
    fireEvent.click(screen.getByRole('tab', { name: /stories/i })); // links arrive → state changes
    await screen.findAllByTestId('story-card');
    fireEvent.click(screen.getByRole('tab', { name: /points/i }));
    go('/point/p1');
    go(-1);
    await waitFor(() => expect(card('p1').getAttribute('data-user-position')).toBe('agree'));
  });

  it('/feed: an anonymous position invalidates too', async () => {
    renderApp(['/feed?tab=points']);
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getByRole('button', { name: 'anon p1' }));
    go('/point/p1');
    go(-1);
    await waitFor(() => expect(svc.getPublicPointsFeed).toHaveBeenCalledTimes(2));
  });

  it('/feed: a story edit invalidates too', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('story-card');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'edit s1' })); });
    go('/point/p1');
    go(-1);
    await waitFor(() => expect(svc.getPublicPointsFeed).toHaveBeenCalledTimes(2));
  });

  it('/stake: a position taken on a card → open an item → Back refetches', async () => {
    renderApp(['/stake/topic']);
    await screen.findAllByTestId('point-card');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'take p1' })); });
    go('/point/p1');
    go(-1);
    await waitFor(() => expect(card('p1').getAttribute('data-user-position')).toBe('agree'));
    expect(svc.getPublicPointsFeed).toHaveBeenCalledTimes(2);
  });

  it('without a write, Back is still served from the cache (the invalidation is not a blanket refetch)', async () => {
    renderApp(['/feed?tab=points']);
    await screen.findAllByTestId('point-card');
    go('/point/p1');
    go(-1);
    await act(async () => {});
    expect(svc.getPublicPointsFeed).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['points', 'setPosition'], ['points', 'removePosition'], ['points', 'createPoint'],
    ['stories', 'createStory'], ['stories', 'updateStory'], ['stories', 'deleteStory'],
    ['stories', 'linkPointToStory'], ['stories', 'unlinkPointFromStory'],
  ] as const)('%s service: %s clears the cache', async (which, method) => {
    const cache = await import('@/lib/list-return-cache');
    cache.writeListReturnCache('k', 'feed', 1);
    const mod = which === 'points'
      ? (await import('@/app/data/points-service')).pointsService
      : (await import('@/app/data/stories-service')).storiesService;
    await (mod as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]!('a', 'b', 'c');
    expect(cache.readListReturnCache('k', 'feed')).toBeUndefined();
  });
});

describe('P1364 finding 1 — the feed removal clears the viewer\'s own position', () => {
  it('withdrawing (with other holders left) drops userPosition, so the button is not re-lit', async () => {
    svc.getPublicPointsFeed.mockReset().mockResolvedValue([
      point('p1', { userPosition: mine, totalPositions: 3, positionCounts: { agree: 3 } as never }),
    ]);
    renderApp(['/feed?tab=points']);
    await screen.findAllByTestId('point-card');
    expect(card('p1').getAttribute('data-user-position')).toBe('agree');
    fireEvent.click(screen.getByRole('button', { name: 'withdraw p1' }));
    expect(card('p1').getAttribute('data-user-position')).toBe('none');
  });
});
