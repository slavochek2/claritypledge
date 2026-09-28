/**
 * @file p1364-list-return-cache.test.tsx
 * @description P1364 §5/§6 — Back to /feed or /stake returns to the list exactly as it was left.
 *
 * The cache rules, each a spec line: served only on POP; no background refresh on POP; keyed by
 * viewer + pathname + query; cleared on auth change; written through on surgical removals. And
 * the feed's URL state: tab/sort/version REPLACE, tag string drives the fetch, `?q=` is
 * debounced, replaced, and filters client-side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { FeedPage } from '@/app/pages/feed-page';
import { StakePage } from '@/app/pages/stake-page';
import {
  __listReturnCacheSize,
  clearListReturnCache,
  listReturnCacheKey,
  readListReturnCache,
  updateListReturnCache,
  useClearListReturnCacheOnAuthChange,
  writeListReturnCache,
} from '@/lib/list-return-cache';
import type { PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';

const getPoints = vi.hoisted(() => vi.fn());
const getStories = vi.hoisted(() => vi.fn());
const getPointsForStories = vi.hoisted(() => vi.fn());
const getStoriesForPoints = vi.hoisted(() => vi.fn());

vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: getPoints } }));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getPublicStoriesFeed: getStories, getPointsForStories, getStoriesForPoints },
}));
const viewer = vi.hoisted(() => ({ id: 'u1' as string | undefined }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: viewer.id ? { user: { id: viewer.id } } : null }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
// Stub cards expose the removal callback, which is what a withdrawn last position calls.
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point, linkedStories, onPointRemoved }: {
    point: PointWithUserPosition;
    linkedStories?: unknown[];
    onPointRemoved?: (id: string, pos: PositionType | null) => void;
  }) => (
    <div data-testid="point-card" data-id={point.id} data-linked={linkedStories === undefined ? 'not-loaded' : String(linkedStories.length)}>
      {point.statement}
      <button type="button" onClick={() => onPointRemoved?.(point.id, 'agree')}>withdraw {point.id}</button>
    </div>
  ),
}));
vi.mock('@/app/components/feed/feed-story-card', () => ({
  FeedStoryCard: ({ story }: { story: StoryWithAuthor }) => <div data-testid="story-card">{story.content}</div>,
}));

const point = (id: string, total = 1) =>
  ({ id, statement: `point ${id}`, tags: ['t'], systemTags: [], positionCounts: { agree: total }, totalPositions: total } as unknown as PointWithUserPosition);
const story = (id: string) => ({ id, content: `story ${id}`, tags: ['t'] } as unknown as StoryWithAuthor);

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}
const where = () => screen.getByTestId('where').textContent ?? '';

function renderApp(entries: string[], index = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <NavGrab />
      <Where />
      <Routes>
        <Route path="/start" element={<div data-testid="start" />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/stake/:tag" element={<StakePage />} />
        <Route path="/story/:id" element={<div data-testid="story-page" />} />
        <Route path="/point/:id" element={<div data-testid="point-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

const go = (to: string | number) => act(() => { if (typeof to === 'number') nav(to); else nav(to); });
const pointIds = () => screen.queryAllByTestId('point-card').map(c => c.getAttribute('data-id'));

beforeEach(() => {
  viewer.id = 'u1';
  getPoints.mockReset().mockResolvedValue([point('p1'), point('p2', 3)]);
  getStories.mockReset().mockResolvedValue([story('s1')]);
  getPointsForStories.mockReset().mockResolvedValue(new Map());
  getStoriesForPoints.mockReset().mockResolvedValue(new Map([['p1', [{ id: 's1' }]]]));
});

describe('P1364 cache store rules', () => {
  it('the key carries the viewer, the pathname and the query', () => {
    expect(listReturnCacheKey('u1', '/feed', '?tab=stories')).not.toBe(listReturnCacheKey('u2', '/feed', '?tab=stories'));
    expect(listReturnCacheKey('u1', '/feed', '?tab=stories')).not.toBe(listReturnCacheKey('u1', '/feed', ''));
    expect(listReturnCacheKey(undefined, '/feed', '')).not.toBe(listReturnCacheKey('u1', '/feed', ''));
  });

  it("another viewer's key misses; a surface mismatch misses", () => {
    writeListReturnCache(listReturnCacheKey('u1', '/feed', ''), 'feed', { rows: 1 });
    expect(readListReturnCache(listReturnCacheKey('u2', '/feed', ''), 'feed')).toBeUndefined();
    expect(readListReturnCache(listReturnCacheKey('u1', '/feed', ''), 'stake')).toBeUndefined();
    expect(readListReturnCache(listReturnCacheKey('u1', '/feed', ''), 'feed')).toEqual({ rows: 1 });
  });

  it('write-through rewrites every entry of the surface, and only that surface', () => {
    writeListReturnCache('a', 'feed', { n: 1 });
    writeListReturnCache('b', 'feed', { n: 2 });
    writeListReturnCache('c', 'stake', { n: 3 });
    updateListReturnCache<{ n: number }>('feed', d => ({ n: d.n * 10 }));
    expect(readListReturnCache('a', 'feed')).toEqual({ n: 10 });
    expect(readListReturnCache('b', 'feed')).toEqual({ n: 20 });
    expect(readListReturnCache('c', 'stake')).toEqual({ n: 3 });
  });

  it('is bounded — the oldest entries go first', () => {
    for (let i = 0; i < 30; i++) writeListReturnCache(`k${i}`, 'feed', i);
    expect(__listReturnCacheSize()).toBe(20);
    expect(readListReturnCache('k0', 'feed')).toBeUndefined();
    expect(readListReturnCache('k29', 'feed')).toBe(29);
  });

  it('an auth change (sign-in, sign-out, user switch) clears it; an unchanged viewer does not', () => {
    const { rerender } = renderHook(({ id }) => useClearListReturnCacheOnAuthChange(id), {
      initialProps: { id: 'u1' as string | undefined },
    });
    writeListReturnCache('x', 'feed', 1);
    rerender({ id: 'u1' });
    expect(__listReturnCacheSize()).toBe(1);
    rerender({ id: undefined }); // sign-out
    expect(__listReturnCacheSize()).toBe(0);
    writeListReturnCache('x', 'feed', 1);
    rerender({ id: 'u2' }); // sign-in as someone else
    expect(__listReturnCacheSize()).toBe(0);
    clearListReturnCache();
  });
});

describe('P1364 /feed — Back returns to the list as it was left', () => {
  it('POP serves the cached list: no refetch (list or links), no skeleton on the first frame', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    await waitFor(() => expect(screen.getAllByTestId('point-card')[0]!.getAttribute('data-linked')).toBe('1'));
    go('/story/s1');
    expect(screen.getByTestId('story-page')).toBeTruthy();
    go(-1);
    // Synchronously after the POP: rows, footers, and no skeleton — nothing to wait for.
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(pointIds()).toEqual(['p1', 'p2']);
    expect(screen.getAllByTestId('point-card')[0]!.getAttribute('data-linked')).toBe('1');
    await act(async () => {}); // let any stray effect fire
    expect(getPoints).toHaveBeenCalledTimes(1);
    expect(getStoriesForPoints).toHaveBeenCalledTimes(1);
  });

  it('a PUSH to /feed (the nav Feed tab) fetches fresh', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    go('/story/s1');
    getPoints.mockResolvedValue([point('p9')]);
    go('/feed');
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    await waitFor(() => expect(pointIds()).toEqual(['p9']));
    expect(getPoints).toHaveBeenCalledTimes(2);
  });

  it("another viewer never gets the previous viewer's rows", async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    go('/story/s1');
    viewer.id = 'u2';
    getPoints.mockResolvedValue([point('other')]);
    go(-1);
    await waitFor(() => expect(pointIds()).toEqual(['other']));
    expect(getPoints).toHaveBeenCalledTimes(2);
  });

  it('a removed point stays gone after open item → Back (write-through)', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getByRole('button', { name: 'withdraw p1' })); // last position → P543 drop
    expect(pointIds()).toEqual(['p2']);
    go('/point/p2');
    go(-1);
    expect(pointIds()).toEqual(['p2']);
    expect(getPoints).toHaveBeenCalledTimes(1);
  });

  it('a removal is written through to OTHER cached feed entries too (an earlier tag filter)', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    go('/feed?tag=t'); // tag selection pushes (D2)
    await waitFor(() => expect(getPoints).toHaveBeenCalledTimes(3)); // filtered + cloud call
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getAllByRole('button', { name: 'withdraw p1' })[0]!);
    go(-1); // back to the unfiltered /feed entry, served from the cache
    expect(where()).toBe('/feed');
    await waitFor(() => expect(pointIds()).toEqual(['p2']));
  });

  it('a tab change REPLACES: Back leaves the feed, the list is not refetched and no skeleton shows', async () => {
    renderApp(['/start', '/feed']);
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getByRole('tab', { name: /stories/i }));
    expect(where()).toBe('/feed?tab=stories');
    expect(screen.queryByTestId('skeleton')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /points/i }));
    expect(getPoints).toHaveBeenCalledTimes(1);
    go(-1);
    expect(screen.getByTestId('start')).toBeTruthy();
  });

  it('sort and version toggles REPLACE too', async () => {
    renderApp(['/start', '/feed']);
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getByRole('button', { name: /newest first/i }));
    fireEvent.click(screen.getByRole('switch', { name: /latest versions/i }));
    await waitFor(() => expect(where()).toBe('/feed?sort=oldest&version=latest'));
    go(-1);
    expect(screen.getByTestId('start')).toBeTruthy();
  });

  it('search: no request while typing, `?q=` written by replace after a pause, and it survives open item → Back', async () => {
    renderApp(['/start', '/feed']);
    await screen.findAllByTestId('point-card');
    const input = screen.getByPlaceholderText(/search stories and points/i);
    fireEvent.change(input, { target: { value: 'p2' } });
    expect(pointIds()).toEqual(['p2']); // client-side filter, immediately
    await waitFor(() => expect(where()).toBe('/feed?q=p2'));
    expect(getPoints).toHaveBeenCalledTimes(1);
    expect(getStoriesForPoints).toHaveBeenCalledTimes(1);
    go('/point/p2');
    go(-1);
    expect((screen.getByPlaceholderText(/search stories and points/i) as HTMLInputElement).value).toBe('p2');
    expect(pointIds()).toEqual(['p2']);
    go(-1); // the search added no history entry
    expect(screen.getByTestId('start')).toBeTruthy();
  });

  it('a pending search write never lands on the next page', async () => {
    renderApp(['/feed']);
    await screen.findAllByTestId('point-card');
    fireEvent.change(screen.getByPlaceholderText(/search stories and points/i), { target: { value: 'zz' } });
    go('/story/s1'); // leave before the debounce fires
    await new Promise(r => setTimeout(r, 400));
    expect(where()).toBe('/story/s1');
  });
});

describe('P1364 /stake — Back returns to the same tab and list', () => {
  beforeEach(() => {
    getPoints.mockResolvedValue([point('p1'), point('p2')]);
    getStories.mockResolvedValue([story('s1')]);
  });

  it('POP serves the cached list on the same tab with no refetch', async () => {
    renderApp(['/stake/topic?tab=stories']);
    await screen.findAllByTestId('story-card');
    go('/story/s1');
    go(-1);
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getAllByTestId('story-card')).toHaveLength(1);
    expect(screen.getByTestId('stake-tab-stories').getAttribute('aria-selected')).toBe('true');
    await act(async () => {});
    expect(getPoints).toHaveBeenCalledTimes(1);
    expect(getPointsForStories).toHaveBeenCalledTimes(1);
  });

  it('a removal on /stake is written through, so Back does not bring the point back', async () => {
    renderApp(['/stake/topic']);
    await screen.findAllByTestId('point-card');
    fireEvent.click(screen.getByRole('button', { name: 'withdraw p1' })); // off the standing instruments → dropped
    expect(pointIds()).toEqual(['p2']);
    go('/point/p2');
    go(-1);
    expect(pointIds()).toEqual(['p2']);
    expect(getPoints).toHaveBeenCalledTimes(1);
  });
});
