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
import { render, screen, waitFor, act, cleanup, fireEvent, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
const getTags = vi.hoisted(() => vi.fn(async () => ['sales']));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: getTags } }));
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
import { clearLinkTokens, useClearLinkTokensOnAuthChange } from '@/lib/canvas-link-token';
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
function Where() {
  const location = useLocation();
  return <output data-testid="where" data-state={JSON.stringify(location.state ?? null)}>{location.pathname}{location.search}{location.hash}</output>;
}
function page(at = '/p/ana/canvas/sales') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Where />
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
  clearLinkTokens();
  clearListReturnCache();
  auth.viewerId = 'reader-1';
  getCanvas.mockReset();
  getAudience.mockReset();
  getAudience.mockResolvedValue([]);
  getTags.mockReset();
  getTags.mockResolvedValue(['sales']);
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
    clearLinkTokens();
    getCanvas.mockClear();
    auth.viewerId = null;
    page('/p/ana/canvas/sales?k=tok123');
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', undefined, 'tok123');
    cleanup();
    clearLinkTokens();
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
    clearLinkTokens();
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


describe('a read whose settle could be dropped: the load never gets stuck (rid / key guards)', () => {
  const pointB = { ...point, id: 'p2', statement: 'Point two' } as unknown as PointWithUserPosition;
  const tree = (at: string, strict = false) => {
    const body = (
      <MemoryRouter initialEntries={[at]}>
        <Jump />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </MemoryRouter>
    );
    return strict ? <StrictMode>{body}</StrictMode> : body;
  };
  /** a button that changes the address inside the router (the ?k= token the page keys its read on) */
  function Jump() {
    const navigate = useNavigate();
    return <button data-testid="jump" onClick={() => navigate('/p/ana/canvas/sales?k=B')}>go</button>;
  }
  const held = <T,>() => {
    let resolve: (v: T) => void = () => undefined;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
  };

  it('the viewer changes while the first read is out (signed out, then the owner): the late first answer is dropped and the page ends READY for the owner', async () => {
    auth.viewerId = null;
    const first = held<ReturnType<typeof canvasView> | typeof noCanvas>();
    getCanvas.mockReturnValueOnce(first.promise).mockResolvedValue(canvasView(true));
    const view = render(tree('/p/ana/canvas/sales'));
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(1)); // the signed-out read is out
    auth.viewerId = 'owner-1';
    view.rerender(tree('/p/ana/canvas/sales')); // the session arrives: a NEW key, a new read
    await grid();
    expect(screen.getByTestId('canvas-point-card-p1')).toBeInTheDocument();
    first.resolve(noCanvas); // the signed-out answer lands late: not-found must NOT replace the owner's canvas
    await act(async () => undefined);
    expect(screen.queryByTestId('canvas-not-found')).toBeNull();
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false');
  });

  it('the link token in the address changes while the first read is out: the old token\'s late answer is dropped, the new one shows', async () => {
    auth.viewerId = 'reader-1';
    const first = held<ReturnType<typeof canvasView>>();
    getCanvas
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(canvasView(false, { points: [pointB], via: null, generalAccess: 'link' }));
    render(tree('/p/ana/canvas/sales?k=A'));
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(1));
    act(() => { screen.getByTestId('jump').click(); });
    await grid();
    expect(screen.getByTestId('canvas-point-card-p2')).toBeInTheDocument();
    first.resolve(canvasView(false)); // token A answers late with point p1
    await act(async () => undefined);
    expect(screen.queryByTestId('canvas-point-card-p1')).toBeNull();
    expect(screen.getByTestId('canvas-point-card-p2')).toBeInTheDocument();
    expect(getCanvas).toHaveBeenLastCalledWith('owner-1', 'sales', 'reader-1', 'B');
  });

  it('StrictMode (the dev double effect) ends READY on a fresh load, and the owner\'s POP-served canvas makes no read; CONTROL: a reader\'s makes silent reads and still ends ready', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true));
    const first = render(tree('/p/ana/canvas/sales', true));
    await grid();
    expect(getCanvas.mock.calls.length).toBeGreaterThanOrEqual(1);
    first.unmount();
    getCanvas.mockClear();
    render(tree('/p/ana/canvas/sales', true));
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false');
    await act(async () => undefined);
    expect(getCanvas).not.toHaveBeenCalled();
    cleanup();
    clearListReturnCache();
    // CONTROL: a reader
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false));
    const r1 = render(tree('/p/ana/canvas/sales', true));
    await grid();
    r1.unmount();
    getCanvas.mockClear();
    render(tree('/p/ana/canvas/sales', true));
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false'); // served from the cache at once
    await waitFor(() => expect(getCanvas).toHaveBeenCalled()); // then silent reads
    await act(async () => undefined);
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('canvas-not-found')).toBeNull();
  });
});

/** What App.tsx mounts once next to the routes: the auth-lifecycle reset of the stored link tokens. */
function AuthReset() {
  useClearLinkTokensOnAuthChange(auth.viewerId ?? undefined);
  return null;
}

describe('the link token is taken off the address on arrival (a capability must not linger in history or analytics)', () => {
  const linkView = () => canvasView(false, { via: null, generalAccess: 'link' });
  const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token

  it('the address loses ?k= after arrival while the read and the writes still send it; other parameters stay', async () => {
    getCanvas.mockResolvedValue(linkView());
    page(`/p/ana/canvas/sales?k=${TOKEN}&with=u1`);
    await screen.findByTestId('canvas-shared-link');
    await waitFor(() => expect(screen.getByTestId('where').textContent).not.toContain('k='));
    expect(screen.getByTestId('where').textContent).not.toContain(TOKEN);
    expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/sales?with=u1'); // CONTROL: only the token went
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    expect(getCanvas).not.toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', undefined); // no read lost it on the way
  });

  it('the writes send the stored token after the address lost it', async () => {
    getCanvas.mockResolvedValue(linkView());
    page(`/p/ana/canvas/sales?k=${TOKEN}`);
    await screen.findByTestId('canvas-shared-link');
    await waitFor(() => expect(screen.getByTestId('where').textContent).not.toContain('k='));
    cardProps.canvas = undefined;
    fireEvent.click(await screen.findByTestId('canvas-point-card-p1')); // opens the panel: the card with the write bindings
    await screen.findByTestId('point-card');
    await act(async () => { await cardProps.canvas!.setPosition('agree'); });
    expect(setPosition).toHaveBeenCalledWith('owner-1', 'sales', 'p1', 'agree', TOKEN);
  });

  it('opening a point from an address that carries the token never writes the token into history (the point-anchor navigations)', async () => {
    getCanvas.mockResolvedValue(linkView());
    const urls: string[] = [];
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    window.history.replaceState(null, '', `/p/ana/canvas/sales?k=${TOKEN}&point=p1`);
    replace.mockClear();
    render(
      <BrowserRouter>
        <Where />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </BrowserRouter>,
    );
    await screen.findByTestId('point-card');
    await waitFor(() => expect(window.location.search).not.toContain('k='));
    await act(async () => undefined);
    for (const call of [...push.mock.calls, ...replace.mock.calls]) urls.push(String(call[2]));
    expect(urls.length, 'the router navigated').toBeGreaterThan(0);
    expect(urls.filter(u => u.includes(TOKEN)), 'no history write carries the token').toEqual([]);
    expect(window.location.search).toContain('point=p1'); // CONTROL: the open point survives
    push.mockRestore();
    replace.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  it('a refresh or Back in the same tab (the address has no token now) still reads with the stored one; CONTROL: a canvas never visited has none', async () => {
    getCanvas.mockResolvedValue(linkView());
    const first = page(`/p/ana/canvas/sales?k=${TOKEN}`);
    await screen.findByTestId('canvas-shared-link');
    first.unmount();
    clearListReturnCache();
    getCanvas.mockClear();
    page('/p/ana/canvas/sales');
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    cleanup();
    getCanvas.mockClear();
    render(<MemoryRouter initialEntries={['/p/ana/canvas/other']}><Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'other', 'reader-1', undefined);
  });

  it('signing out (or switching person) forgets the stored token; CONTROL: a visitor who signs in keeps it', async () => {
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = null;
    const tree = (at: string) => (
      <MemoryRouter initialEntries={[at]}>
        <AuthReset />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </MemoryRouter>
    );
    const view = render(tree(`/p/ana/canvas/sales?k=${TOKEN}`));
    await screen.findByTestId('canvas-shared-link');
    // signed out -> signed in: the same person carries on
    auth.viewerId = 'reader-1';
    view.rerender(tree('/p/ana/canvas/sales'));
    await waitFor(() => expect(getCanvas).toHaveBeenLastCalledWith('owner-1', 'sales', 'reader-1', TOKEN));
    // signed in -> signed out: forgotten
    auth.viewerId = null;
    view.rerender(tree('/p/ana/canvas/sales'));
    await waitFor(() => expect(getCanvas).toHaveBeenLastCalledWith('owner-1', 'sales', undefined, undefined));
    expect(sessionStorage.getItem(Object.keys(sessionStorage).find(k => k.startsWith('canvas-link:')) ?? 'none')).toBeNull();
  });
});

describe('the page keeps no copy of the token: a clear under a mounted page is seen at once (a sign-out in another tab reaches an anonymous tab)', () => {
  const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token
  const linkView = () => canvasView(false, { via: null, generalAccess: 'link' });

  it('an anonymous tab arrives with the token, the tokens are cleared with no viewer change, then the focus refetch sends NO token and a later sign-in inherits none', async () => {
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = null;
    const tree = (at: string) => (
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </MemoryRouter>
    );
    const view = render(tree(`/p/ana/canvas/sales?k=${TOKEN}`));
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenLastCalledWith('owner-1', 'sales', undefined, TOKEN);
    // the same-device sign-out in another tab reaches this tab as a clear; viewerId stays undefined
    getCanvas.mockClear();
    getCanvas.mockResolvedValue(noCanvas);
    act(() => { clearLinkTokens(); });
    await leaveAndReturn(); // the focus refetch
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    for (const call of getCanvas.mock.calls) expect(call[3], 'every read after the clear').toBeUndefined();
    await waitFor(() => expect(screen.getByTestId('canvas-not-found')).toBeInTheDocument());
    // a later sign-in on this tab inherits nothing
    getCanvas.mockClear();
    auth.viewerId = 'reader-2';
    view.rerender(tree('/p/ana/canvas/sales'));
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    for (const call of getCanvas.mock.calls) expect(call[3], 'the next person sends none').toBeUndefined();
  });

  it('CONTROL: with no clear, the same focus refetch still sends the stored token', async () => {
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = null;
    page(`/p/ana/canvas/sales?k=${TOKEN}`);
    await screen.findByTestId('canvas-shared-link');
    getCanvas.mockClear();
    await leaveAndReturn();
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    for (const call of getCanvas.mock.calls) expect(call[3]).toBe(TOKEN);
  });

  it('a clear drops what the Back cache holds for the canvas (it was read with the token)', async () => {
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = 'reader-1';
    page(`/p/ana/canvas/sales?k=${TOKEN}`);
    await grid();
    const keyWithToken = listReturnCacheKey('reader-1', canvasPath('ana', 'sales'), TOKEN);
    expect(readListReturnCache(keyWithToken, 'canvas')).toBeDefined();
    getCanvas.mockResolvedValue(noCanvas);
    act(() => { clearLinkTokens(); });
    await waitFor(() => expect(readListReturnCache(keyWithToken, 'canvas')).toBeUndefined());
  });

  it('writes read the token when they run: a write made through a card captured BEFORE the clear sends none; CONTROL: before the clear it sends the token', async () => {
    getCanvas.mockResolvedValue(linkView());
    page(`/p/ana/canvas/sales?k=${TOKEN}&point=p1`);
    await screen.findByTestId('point-card');
    const captured = cardProps.canvas!.setPosition; // what a card holds from an earlier render
    await captured('agree');
    expect(setPosition).toHaveBeenLastCalledWith('owner-1', 'sales', 'p1', 'agree', TOKEN);
    act(() => { clearLinkTokens(); });
    await captured('agree');
    expect(setPosition).toHaveBeenLastCalledWith('owner-1', 'sales', 'p1', 'agree', undefined);
  });
});

describe('the stored link token does not outlive the person, even when the canvas page is not mounted', () => {
  const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token
  const linkView = () => canvasView(false, { via: null, generalAccess: 'link' });
  const Elsewhere = () => <div data-testid="elsewhere">another page</div>;

  it('visit a link canvas, navigate away, sign out, come back: no token is sent; CONTROL: signing in from anonymous keeps it', async () => {
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = 'reader-1';
    const app = (showCanvas: boolean) => (
      <MemoryRouter initialEntries={[`/p/ana/canvas/sales?k=${TOKEN}`]}>
        <AuthReset />
        {showCanvas
          ? <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
          : <Elsewhere />}
      </MemoryRouter>
    );
    const view = render(app(true));
    await screen.findByTestId('canvas-shared-link');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    // navigate away: CanvasPage is unmounted, the tab still holds the token
    view.rerender(app(false));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
    expect(Object.keys(sessionStorage).some(k => k.startsWith('canvas-link:'))).toBe(true);
    // sign out while the canvas page is NOT mounted
    auth.viewerId = null;
    view.rerender(app(false));
    expect(Object.keys(sessionStorage).filter(k => k.startsWith('canvas-link:'))).toEqual([]);
    // come back (no token in the address): the read carries none
    getCanvas.mockClear();
    getCanvas.mockResolvedValue(noCanvas);
    view.unmount();
    clearListReturnCache();
    render(
      <MemoryRouter initialEntries={['/p/ana/canvas/sales']}>
        <AuthReset />
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', undefined, undefined);
    cleanup();
    // CONTROL: an anonymous visitor who signs in keeps the token (the same person carries on)
    clearLinkTokens();
    getCanvas.mockResolvedValue(linkView());
    auth.viewerId = null;
    const anon = render(app(true));
    await screen.findByTestId('canvas-shared-link');
    anon.rerender(app(false));
    auth.viewerId = 'reader-1';
    anon.rerender(app(false));
    expect(Object.keys(sessionStorage).some(k => k.startsWith('canvas-link:'))).toBe(true);
  });

  it('switching to another person also clears it', () => {
    sessionStorage.setItem('canvas-link:ana/sales', TOKEN);
    auth.viewerId = 'reader-1';
    const view = render(<MemoryRouter><AuthReset /></MemoryRouter>);
    auth.viewerId = 'reader-2';
    view.rerender(<MemoryRouter><AuthReset /></MemoryRouter>);
    expect(sessionStorage.getItem('canvas-link:ana/sales')).toBeNull();
  });
});

describe('an owner whose canvas has no current points but has a record keeps the share control', () => {
  const emptyOwner = (canvasExists: boolean) => canvasView(true, { points: [], canvasExists, visibility: 'shared', generalAccess: 'link' });

  it('owner + record + no points: the canvas page with the share control and an empty note, not not-found', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(emptyOwner(true));
    page();
    await grid();
    expect(screen.getByTestId('share-control')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-empty-owner')).toHaveTextContent('This canvas has no points yet.');
    expect(screen.queryByTestId('canvas-not-found')).toBeNull();
  });

  it('CONTROLS: the owner with NO record (a made-up address), a reader and a signed-out visitor still get not-found', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(emptyOwner(false));
    page();
    await screen.findByTestId('canvas-not-found');
    cleanup();
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, { points: [], canvasExists: false }));
    page();
    await screen.findByTestId('canvas-not-found');
    cleanup();
    auth.viewerId = null;
    getCanvas.mockResolvedValue(noCanvas);
    page();
    await screen.findByTestId('canvas-not-found');
    // even a non-owner who somehow got canvasExists true is not given the canvas
    cleanup();
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, { points: [], canvasExists: true }));
    page();
    await screen.findByTestId('canvas-not-found');
  });
});

describe('the reader line', () => {
  it('an event the canvas was shared through is styled as the link it is (blue, underline on hover); a group is plain text', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    page();
    const via = await screen.findByTestId('canvas-shared-via');
    expect(via.tagName).toBe('A');
    expect(via.getAttribute('href')).toBe('/events/sales-mastermind');
    expect(via.className).toMatch(/text-blue-600/);
    expect(via.className).not.toMatch(/text-foreground/);
    cleanup();
    clearListReturnCache(); // the first read is cached: Back would serve it
    getCanvas.mockResolvedValue(canvasView(false, { via: { kind: 'group', name: 'Founders', slug: 'founders' } }));
    page();
    const group = await screen.findByTestId('canvas-shared-via');
    expect(group.tagName).toBe('SPAN'); // CONTROL: no link where the contract has none
  });
});

describe('the token in the FRAGMENT (#k=, the form Copy link produces; a browser never sends a fragment to the server)', () => {
  const linkView = () => canvasView(false, { via: null, generalAccess: 'link' });
  const TOKEN = '3f9a0c7be214d85e6a1b9c0d4e7f2a58'; // gitleaks:allow — synthetic link-token fixture, matches no real token

  it('is read, sent with the read and stripped from the address while other query and fragment parameters stay', async () => {
    getCanvas.mockResolvedValue(linkView());
    page(`/p/ana/canvas/sales?with=u1#box=canvas%3Aproblem&k=${TOKEN}`);
    await screen.findByTestId('canvas-shared-link');
    await waitFor(() => expect(screen.getByTestId('where').textContent).not.toContain('k='));
    expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/sales?with=u1#box=canvas%3Aproblem');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
    expect(getCanvas).not.toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', undefined);
  });

  it('a fragment with only the token leaves a clean address; the stored token serves a reload with no fragment', async () => {
    getCanvas.mockResolvedValue(linkView());
    const first = page(`/p/ana/canvas/sales#k=${TOKEN}`);
    await screen.findByTestId('canvas-shared-link');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/sales'));
    first.unmount();
    clearListReturnCache();
    getCanvas.mockClear();
    page('/p/ana/canvas/sales');
    await waitFor(() => expect(getCanvas).toHaveBeenCalled());
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', TOKEN);
  });

  it('CONTROL: a fragment that is not the token (a plain anchor) is left alone and no token is invented', async () => {
    getCanvas.mockResolvedValue(canvasView(false));
    page('/p/ana/canvas/sales#top');
    await screen.findByTestId('canvas-grid');
    expect(screen.getByTestId('where').textContent).toBe('/p/ana/canvas/sales#top');
    expect(getCanvas).toHaveBeenCalledWith('owner-1', 'sales', 'reader-1', undefined);
  });
});


describe('P1515 phase 4: the header row', () => {
  const withOtherPosition = () => new Map([['p1', [{
    userId: 'u2', userName: 'Ben', userSlug: 'ben', userAvatarUrl: null, userAvatarColor: '#3b82f6', userHasPledged: false,
  }]]]);

  const versions2 = { version: 'sales_v2', versions: [{ name: 'sales_v2', createdAt: '2026-10-22T10:00:00Z' }, { name: 'sales', createdAt: '2026-10-01T10:00:00Z' }] };

  it('Share sits in the same row as Compare, immediately right of it; the version switcher is an outline button with the name and a chevron', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true, { positions: withOtherPosition(), ...versions2 }));
    page();
    await grid();
    const compare = screen.getByTestId('canvas-compare-picker');
    const share = screen.getByTestId('share-control');
    expect(compare.parentElement!.parentElement).toBe(share.parentElement); // one container: Compare, then Share
    expect(compare.parentElement!.nextElementSibling).toBe(share);
    expect(screen.getByTestId('canvas-actions').closest('[data-testid="canvas-header-row"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-byline').closest('[data-testid="canvas-header-row"]')).not.toBeNull();
    const picker = screen.getByTestId('canvas-version-picker');
    expect(picker.className).toMatch(/\bborder\b/);
    expect(picker.className).toMatch(/bg-muted/);
    expect(picker.querySelector('svg')).not.toBeNull(); // the chevron
    expect(within(picker).getByRole('combobox', { name: 'Version' })).toHaveValue('sales_v2');
  });

  it('a reader sees the plain canvas name: no picker, no chevron, no Share (control: an owner with one version is plain too, whatever other canvases they have)', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-project-picker')).toBeNull();
    expect(screen.getByTestId('canvas-project-tag').tagName).toBe('SPAN');
    expect(screen.queryByTestId('share-control')).toBeNull();
    cleanup();
    auth.viewerId = 'owner-1';
    getTags.mockResolvedValue(['sales', 'other', 'another']); // the owner's other canvases are not listed here (P1545)
    getCanvas.mockResolvedValue(canvasView(true));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-project-picker')).toBeNull();
    expect(screen.queryByTestId('canvas-version-picker')).toBeNull();
    expect(screen.getByTestId('canvas-project-tag').tagName).toBe('SPAN');
    expect(getTags).not.toHaveBeenCalled(); // the page no longer reads the owner's canvas list
  });

  it('V1/V2: the switcher has a visible border (outline button) and keeps its muted fill; on a phone it takes the row beside Share (flex-1, Share shrink-0 and ordered next to it)', async () => {
    auth.viewerId = 'owner-1';
    getCanvas.mockResolvedValue(canvasView(true, { positions: withOtherPosition(), ...versions2 }));
    page();
    await grid();
    const picker = screen.getByTestId('canvas-version-picker');
    expect(picker.className).toMatch(/border-foreground\/40/);
    expect(picker.className).toMatch(/bg-muted/);
    expect(screen.getByTestId('canvas-project-slot').className).toMatch(/max-sm:flex-1/);
    expect(screen.getByTestId('canvas-project-slot').className).toMatch(/max-sm:order-2/);
    expect(screen.getByTestId('canvas-controls').className).toMatch(/max-sm:order-4/); // Compare drops under the picker row
    expect(screen.getByTestId('canvas-controls').className).toMatch(/max-sm:basis-full/); // and takes its own line, so the picker is not squeezed
    expect(screen.getByTestId('canvas-byline').className).toMatch(/max-sm:contents/);
    expect(screen.getByTestId('canvas-actions').className).toMatch(/max-sm:contents/);
  });
});

describe('P1515 phase 5: the version switcher', () => {
  const V = (name: string, createdAt: string | null = '2026-10-01T10:00:00Z') => ({ name, createdAt });
  const two = { version: 'sales_v2', versions: [V('sales_v2', '2026-10-22T10:00:00Z'), V('sales', '2026-10-01T10:00:00Z')] };

  it('W1: a reader admitted to a two-version canvas gets an outline switcher listing versions newest first with a date, the open one selected', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, two));
    page();
    await grid();
    const picker = screen.getByTestId('canvas-version-picker');
    expect(picker.className).toMatch(/\bborder\b/);
    expect(picker.className).toMatch(/bg-muted/);
    const select = within(picker).getByRole('combobox', { name: 'Version' }) as HTMLSelectElement;
    expect(select.value).toBe('sales_v2');
    const options = within(select).getAllByRole('option');
    expect(options.map(o => (o as HTMLOptionElement).value)).toEqual(['sales_v2', 'sales']);
    expect(options[0]!.textContent).toMatch(/^sales_v2 · /); // name, then the date
    expect(screen.queryByTestId('canvas-project-tag')).toBeNull();
  });

  it('W2: a one-version canvas shows the plain name, unchanged (also an answer with no versions at all)', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, { version: 'sales', versions: [V('sales')] }));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-version-picker')).toBeNull();
    expect(screen.getByTestId('canvas-project-tag')).toHaveTextContent('sales');
    cleanup();
    getCanvas.mockResolvedValue(canvasView(false));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-version-picker')).toBeNull();
  });

  it('W3: no ?v asks for the newest (no version sent); ?v=older sends it', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, two));
    page();
    await grid();
    expect(getCanvas.mock.calls.at(-1)![4]).toBeUndefined();
    cleanup();
    getCanvas.mockClear();
    page('/p/ana/canvas/sales?v=sales');
    await grid();
    expect(getCanvas.mock.calls.at(-1)![4]).toBe('sales');
  });

  it('W4: choosing a version puts it in the address (?v=) and reads that version; the owner gets the same switcher', async () => {
    auth.viewerId = 'owner-1';
    getTags.mockResolvedValue(['sales', 'sales_v2', 'other']);
    getCanvas.mockResolvedValue(canvasView(true, two));
    page();
    await grid();
    fireEvent.change(within(screen.getByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' }), { target: { value: 'sales' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?v=sales'));
    await waitFor(() => expect(getCanvas.mock.calls.at(-1)![4]).toBe('sales'));
  });

  it('X1: the dropdown lists the versions of THIS canvas only, for the owner too: no canvas picker even when the owner has other canvases; it takes the full line on a phone', async () => {
    auth.viewerId = 'owner-1';
    getTags.mockResolvedValue(['sales', 'sales_v2', 'other']);
    getCanvas.mockResolvedValue(canvasView(true, two));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-project-picker')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Canvas' })).toBeNull();
    const versions = within(screen.getByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' });
    expect(within(versions).getAllByRole('option').map(o => (o as HTMLOptionElement).value)).toEqual(['sales_v2', 'sales']);
    expect(screen.getByTestId('canvas-version-picker').className).toMatch(/max-sm:w-full/);
  });

  it('X1b: an owner with ONE canvas (several versions) sees only the version switcher', async () => {
    auth.viewerId = 'owner-1';
    getTags.mockResolvedValue(['sales', 'sales_v2']);
    getCanvas.mockResolvedValue(canvasView(true, two));
    page();
    await grid();
    expect(screen.queryByTestId('canvas-project-picker')).toBeNull();
    expect(screen.getByTestId('canvas-version-picker')).toBeInTheDocument();
  });

  it('X2: choosing a version pushes history WITHOUT the panel state, so closing a panel never steps Back to the previous version', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, two));
    page('/p/ana/canvas/sales?v=sales_v2');
    await grid();
    fireEvent.change(within(screen.getByTestId('canvas-version-picker')).getByRole('combobox', { name: 'Version' }), { target: { value: 'sales' } });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?v=sales'));
    expect(screen.getByTestId('where').getAttribute('data-state')).toBe('null');
  });

  it('X3: with no ?v and several versions the resolved version is written into the address (replace) once, with no second read; a one-version canvas keeps its address', async () => {
    auth.viewerId = 'reader-1';
    getCanvas.mockResolvedValue(canvasView(false, two));
    page();
    await grid();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?v=sales_v2'));
    await waitFor(() => expect(getCanvas).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('canvas-version-picker')).toBeInTheDocument(); // still on screen, not reloaded
    cleanup();
    getCanvas.mockClear();
    getCanvas.mockResolvedValue(canvasView(false, { version: 'sales', versions: [{ name: 'sales', createdAt: null }] }));
    page();
    await grid();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/p\/ana\/canvas\/sales$/);
  });
});
