/**
 * @file p1515-canvas-page-access.test.tsx
 * @description P1515 review addendum, at page level: the audience is live, so the Back cache must
 * never keep showing a canvas the viewer can no longer read.
 *   - a read that settles not-found evicts the Back cache entry (Back then asks the server again)
 *   - Back to a canvas served from the cache is followed by a silent fresh read for a READER,
 *     and not for the owner (P1364: the owner's Back shows it as left)
 *   - a refresh whose audience read fails keeps the audience already loaded
 *
 * Each "no longer" assertion has a control showing the same step while access still holds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const auth = vi.hoisted(() => ({ viewerId: 'reader-1' }));
const getCanvas = vi.hoisted(() => vi.fn());
const getAudience = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId }, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({
    success: true,
    data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false },
  })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience } }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: vi.fn(async () => ['sales']) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({
  useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }),
}));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found">not found</div> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => null }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
// The owner's control: the entries the page handed it are the audience it shows.
vi.mock('@/app/components/canvas/canvas-share-control', () => ({
  CanvasShareControl: ({ entries }: { entries: Array<{ name: string }> | null }) => (
    <div data-testid="share-control">{entries === null ? 'audience unknown' : entries.map(e => e.name).join('|') || 'no entries'}</div>
  ),
}));

import { CanvasPage } from '@/app/pages/canvas-page';
import { canvasPath } from '@/lib/canvas-boxes';
import { clearListReturnCache, listReturnCacheKey, readListReturnCache } from '@/lib/list-return-cache';

const point = {
  id: 'p1', statement: 'Point one', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null,
  totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
} as unknown as PointWithUserPosition;

const canvasView = (isOwner: boolean) => ({
  points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(),
  visibility: 'shared' as const, isOwner, admitted: true,
  via: isOwner ? null : { kind: 'event' as const, name: 'Sales mastermind', slug: 'sales-mastermind' },
});
/** What get_canvas returns to anyone it does not admit. */
const noCanvas = { points: [], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: null, isOwner: false, admitted: false, via: null };

const cacheKey = (viewer: string) => listReturnCacheKey(viewer, canvasPath('ana', 'sales'));
const cached = (viewer: string) => readListReturnCache(cacheKey(viewer), 'canvas');

/** The page as a browser opens it from history: a POP navigation, so a cached canvas is served. */
function page() {
  return render(
    <MemoryRouter initialEntries={['/p/ana/canvas/sales']}>
      <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
    </MemoryRouter>,
  );
}
const grid = () => screen.findByTestId('canvas-grid');
/** The tab was away and returns: the page's own refetch trigger. */
const leaveAndReturn = () => act(async () => {
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
});

beforeEach(() => {
  clearListReturnCache();
  auth.viewerId = 'reader-1';
  getCanvas.mockReset();
  getAudience.mockReset();
  getAudience.mockResolvedValue([]);
});
afterEach(() => { cleanup(); clearListReturnCache(); });

describe('access that ends is not served again from the Back cache', () => {
  it('a read that settles not-found evicts the entry, so Back asks the server and shows not-found', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    const first = page();
    await grid();
    // CONTROL: while access holds, the read is cached.
    expect(cached('reader-1')).toBeDefined();

    // Access ends; the tab regains focus and the page re-reads.
    getCanvas.mockResolvedValue(noCanvas);
    await leaveAndReturn();
    await screen.findByTestId('canvas-not-found');
    expect(cached('reader-1')).toBeUndefined();

    // Back: no cached canvas to serve; it asks again and still says not-found.
    first.unmount();
    getCanvas.mockClear();
    page();
    await screen.findByTestId('canvas-not-found');
    expect(screen.queryByTestId('canvas-grid')).toBeNull();
    expect(getCanvas).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: while access holds, Back serves the cached canvas at once', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    const first = page();
    await grid();
    first.unmount();
    getCanvas.mockClear();
    getCanvas.mockReturnValue(new Promise(() => undefined)); // the follow-up read never settles
    page();
    // Shown with no wait for the server.
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
  });
});

describe('Back to a cached canvas', () => {
  it('a reader gets a silent fresh read after the cache is served; no longer admitted becomes not-found', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    const first = page();
    await grid();
    first.unmount();

    getCanvas.mockClear();
    getCanvas.mockResolvedValue(noCanvas);
    page();
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument(); // served from the cache first
    await screen.findByTestId('canvas-not-found');
    expect(getCanvas).toHaveBeenCalledTimes(1);
    expect(cached('reader-1')).toBeUndefined();
  });

  it('a reader who is still admitted keeps the canvas through that read (and a failing read changes nothing)', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    const first = page();
    await grid();
    first.unmount();

    getCanvas.mockClear();
    getCanvas.mockRejectedValue(new Error('offline'));
    page();
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-not-found')).toBeNull();
  });

  it('CONTROL: the owner\'s Back shows the canvas as left, with no read (P1364)', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true));
    const first = page();
    await grid();
    first.unmount();

    getCanvas.mockClear();
    getAudience.mockClear();
    page();
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
    await act(async () => undefined);
    expect(getCanvas).not.toHaveBeenCalled();
  });
});

describe('the owner\'s audience survives a failed refresh', () => {
  const sales = { kind: 'event', id: 'e1', name: 'Sales mastermind', slug: 'sales', public: true, ownerAdmitted: true, count: 2, names: [] };

  it('a refresh whose audience read fails keeps the entries already shown', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true));
    getAudience.mockResolvedValueOnce([sales]);
    page();
    await waitFor(() => expect(screen.getByTestId('share-control')).toHaveTextContent('Sales mastermind'));

    getAudience.mockRejectedValue(new Error('offline'));
    await leaveAndReturn();
    await waitFor(() => expect(getAudience).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(screen.getByTestId('share-control')).toHaveTextContent('Sales mastermind');
  });

  it('CONTROL: a first load whose audience read fails has none to keep, and says so', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true));
    getAudience.mockRejectedValue(new Error('offline'));
    page();
    await waitFor(() => expect(screen.getByTestId('share-control')).toHaveTextContent('audience unknown'));
  });

  it('CONTROL: a refresh whose audience read succeeds shows the new entries', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true));
    getAudience.mockResolvedValueOnce([sales]);
    page();
    await waitFor(() => expect(screen.getByTestId('share-control')).toHaveTextContent('Sales mastermind'));

    getAudience.mockResolvedValue([{ ...sales, name: 'Founders circle' }]);
    await leaveAndReturn();
    await waitFor(() => expect(screen.getByTestId('share-control')).toHaveTextContent('Founders circle'));
  });
});
