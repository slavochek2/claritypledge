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

const auth = vi.hoisted(() => ({ viewerId: 'reader-1' as string | null }));
const getCanvas = vi.hoisted(() => vi.fn());
const getAudience = vi.hoisted(() => vi.fn());
const setPosition = vi.hoisted(() => vi.fn(async () => undefined));
const cardProps = vi.hoisted(() => ({ canvas: undefined as undefined | { setPosition: (p: string) => Promise<void> } }));

vi.mock('@/auth', () => ({
  useAuth: () => (auth.viewerId
    ? { session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId }, sessionChecked: true }
    : { session: null, user: null, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({
    success: true,
    data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false },
  })),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { getCanvas, getAudience, setPosition } }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: vi.fn(async () => ['sales']) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({
  useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }),
}));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found">not found</div> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ canvas }: { canvas?: { readOnly?: boolean; setPosition: (p: string) => Promise<void> } }) => {
    cardProps.canvas = canvas;
    return <div data-testid="point-card" data-readonly={String(!!canvas?.readOnly)} />;
  },
}));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
// The owner's control: the entries the page handed it are the audience it shows.
vi.mock('@/app/components/canvas/canvas-share-control', () => ({
  CanvasShareControl: ({ entries, generalAccess }: { entries: Array<{ name: string }> | null; generalAccess?: string }) => (
    <div data-testid="share-control" data-general-access={generalAccess}>{entries === null ? 'audience unknown' : entries.map(e => e.name).join('|') || 'no entries'}</div>
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

const canvasView = (isOwner: boolean, over: Record<string, unknown> = {}) => ({
  points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(),
  visibility: 'shared' as const, isOwner, admitted: true, generalAccess: 'restricted' as const,
  via: isOwner ? null : { kind: 'event' as const, name: 'Sales mastermind', slug: 'sales-mastermind' },
  ...over,
});
/** What get_canvas returns to anyone it does not admit. */
const noCanvas = { points: [], stories: new Map(), addedStoryIds: [], positions: new Map(), visibility: null, isOwner: false, admitted: false, generalAccess: 'restricted', via: null };

const cacheKey = (viewer: string) => listReturnCacheKey(viewer, canvasPath('ana', 'sales'));
const cached = (viewer: string) => readListReturnCache(cacheKey(viewer), 'canvas');

/** The page as a browser opens it from history: a POP navigation, so a cached canvas is served. */
function page(at = '/p/ana/canvas/sales') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
    </MemoryRouter>,
  );
}
/** The canvas is READY (read applied), not merely on screen: the grid element renders while loading, with
 *  aria-busy="true". Waiting only for the element let a test unmount before the first read had settled
 *  (so nothing was cached and Back, correctly, read again): the intermittent "owner's Back makes a read". */
const grid = async () => {
  const el = await screen.findByTestId('canvas-grid');
  await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
  return el;
};
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

describe('why a test must wait for READY before leaving the page', () => {
  it('REPRO of the intermittent "owner\'s Back makes a read": leaving before the first read settled caches nothing, so Back reads again (the grid element exists while loading)', async () => {
    auth.viewerId = 'owner-1';
    let release: () => void = () => undefined;
    getCanvas.mockReturnValueOnce(new Promise(resolve => { release = () => resolve(canvasView(true)); }));
    const first = page();
    const el = await screen.findByTestId('canvas-grid'); // what the tests used to wait for
    expect(el, 'the grid is on screen while the read is still out').toHaveAttribute('aria-busy', 'true');
    first.unmount();
    getCanvas.mockClear();
    getCanvas.mockResolvedValue(canvasView(true));
    page(); // Back: the first read never settled, so there is no cache entry to serve
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(1));
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'owner-1', undefined); // the exact call the failing control saw
    release();
  });

  it('CONTROL: once the first read has settled (ready), the owner\'s Back makes no read', async () => {
    auth.viewerId = 'owner-1';
    let release: () => void = () => undefined;
    getCanvas.mockReturnValueOnce(new Promise(resolve => { release = () => resolve(canvasView(true)); }));
    const first = page();
    const el = await screen.findByTestId('canvas-grid');
    release();
    await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
    first.unmount();
    getCanvas.mockClear();
    page();
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false'); // served from the cache at once
    await act(async () => undefined);
    expect(getCanvas).not.toHaveBeenCalled();
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


describe('a canvas open to anyone with the link (phase 3)', () => {
  const linkView = (over: Record<string, unknown> = {}) => canvasView(false, { via: null, generalAccess: 'link', ...over });

  it('a signed-out visitor is asked, reads the canvas, sees the link line, and gets a read-only card', async () => {
    auth.viewerId = null;
    getCanvas.mockResolvedValue(linkView());
    page('/p/ana/canvas/sales?point=p1');
    expect(await screen.findByTestId('canvas-shared-link')).toHaveTextContent('Anyone with the link can see this canvas');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', undefined, undefined);
    expect(screen.getByTestId('canvas-grid')).toBeInTheDocument();
    expect((await screen.findByTestId('point-card')).getAttribute('data-readonly')).toBe('true');
  });

  it('CONTROL: a signed-in reader of the same canvas gets a card that is not read-only', async () => {
    getCanvas.mockResolvedValue(linkView());
    page('/p/ana/canvas/sales?point=p1');
    expect(await screen.findByTestId('canvas-shared-link')).toBeInTheDocument();
    expect((await screen.findByTestId('point-card')).getAttribute('data-readonly')).toBe('false');
  });

  it('a signed-out visitor of a canvas that is NOT open still gets not-found (the empty answer), with no hint', async () => {
    auth.viewerId = null;
    getCanvas.mockResolvedValue(noCanvas);
    page();
    await screen.findByTestId('canvas-not-found');
    expect(getCanvas).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('canvas-grid')).toBeNull();
    expect(screen.queryByTestId('canvas-shared-link')).toBeNull();
  });

  it('a person entry\'s reader line names the owner, and has no link line', async () => {
    getCanvas.mockResolvedValue(canvasView(false, { via: { kind: 'person', id: 'p', name: 'Ana', slug: 'ana' } }));
    page();
    expect(await screen.findByTestId('canvas-shared-via')).toHaveTextContent('Ana');
    expect(screen.getByTestId('canvas-shared-with-you')).toHaveTextContent('Shared with you by Ana');
    expect(screen.queryByTestId('canvas-shared-link')).toBeNull();
  });

  it('the owner\'s control is told the general access the canvas was read with', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true, { generalAccess: 'link' }));
    page();
    await waitFor(() => expect(screen.getByTestId('share-control')).toHaveAttribute('data-general-access', 'link'));
  });
});


describe('the link token in the address (?k=)', () => {
  const linkView = () => canvasView(false, { via: null, generalAccess: 'link' });

  it('is sent to get_canvas for a signed-in reader and for a signed-out visitor; CONTROL: no ?k= sends none', async () => {
    getCanvas.mockResolvedValue(linkView());
    page('/p/ana/canvas/sales?k=tok123');
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', 'tok123');
    cleanup();
    getCanvas.mockClear();
    auth.viewerId = null;
    page('/p/ana/canvas/sales?k=tok123');
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', undefined, 'tok123');
    cleanup();
    getCanvas.mockClear();
    page('/p/ana/canvas/sales');
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', undefined, undefined);
  });

  it('rides the position write too; CONTROL: without it none is sent', async () => {
    getCanvas.mockResolvedValue(linkView());
    page('/p/ana/canvas/sales?k=tok123&point=p1');
    await screen.findByTestId('point-card');
    await cardProps.canvas!.setPosition('agree');
    expect(setPosition).toHaveBeenCalledWith('owner-1', 'sales', 'p1', 'agree', 'tok123');
    cleanup();
    setPosition.mockClear();
    page('/p/ana/canvas/sales?point=p1');
    await screen.findByTestId('point-card');
    await cardProps.canvas!.setPosition('agree');
    expect(setPosition).toHaveBeenCalledWith('owner-1', 'sales', 'p1', 'agree', undefined);
  });

  it('is part of the Back cache key: a canvas read with one token is not served for another', async () => {
    getCanvas.mockResolvedValue(linkView());
    const first = page('/p/ana/canvas/sales?k=tokA');
    await screen.findByTestId('canvas-shared-link');
    expect(readListReturnCache(listReturnCacheKey('reader-1', canvasPath('ana', 'sales'), 'tokA'), 'canvas')).toBeDefined();
    expect(readListReturnCache(listReturnCacheKey('reader-1', canvasPath('ana', 'sales'), 'tokB'), 'canvas')).toBeUndefined();
    first.unmount();
    // the other token: nothing cached to serve, so the page reads (and the server decides)
    getCanvas.mockClear();
    getCanvas.mockResolvedValue(noCanvas);
    page('/p/ana/canvas/sales?k=tokB');
    await screen.findByTestId('canvas-not-found');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', 'tokB');
  });
});
