/**
 * @file p1536-x11-root-store.test.ts
 * @description P1536 3c X10/X11, review round 2: ONE batched read for every canvas thread root of a chat, instead of a read per card and per link.
 *  - mount: the visible roots are ONE query (+ one for the versions), however many cards: at 10 cards, 2 requests; with the viewer's slug known, no more
 *  - a hidden tab makes ZERO requests, including on mount; it reads when the tab comes back
 *  - tab return with nothing changed: ONE request, for the roots that can still change (an open draft, or one not known yet), and no detail
 *  - only a card whose draft CHANGED STATE fetches its detail (the versions), and only once for any number of changes
 *  - a reply arriving, the same-tab event for a draft: that root only; "updated" and another draft's events say nothing
 *  - a closed draft never changes again: it is not asked about
 *  - a refused read leaves the first value failed and keeps a known one; a stalled read blocks nothing; an older answer never replaces a newer one
 *  - a tap's own read follows the NEWEST answer (a superseded tap read never decides navigation)
 *  - the null -> open transition is one flush, not two reads
 *  - nothing is kept past the last consumer
 * No timer polls: time passing makes no request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasDraft, CanvasVersionOption } from '@/app/data/canvas-draft-service';

const svc = vi.hoisted(() => ({ getCanvasDraftsByThreads: vi.fn(), listMyCanvasVersions: vi.fn(), getProfileSlug: vi.fn() }));
const arts = vi.hoisted(() => ({ listMyCanvases: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));
vi.mock('@/app/data/canvas-artifacts', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-artifacts')), ...arts }));

import { emitCanvasDraftEvent } from '@/app/data/canvas-draft-events';
import { acquireRoot, invalidateRootDetail, readRootNow, resetCanvasRootStore, retryRoot, rootSnapshot, subscribeRoot, touchRootCount, TAP_READ_MAX_MS } from '@/app/pages/chat/canvas-root-store';

const draft = (n: number, over: Partial<CanvasDraft> = {}): CanvasDraft => ({
  id: `d-${n}`, versionId: `ver-d${n}`, canvasId: `cv-${n}`, baseVersionId: null, conversationId: 'conv', threadRootId: `root-${n}`, state: 'open', runCount: 1, revision: 1, closedAt: null,
  canvasName: `canvas_${n}`, versionName: `canvas_d${n}`, ...over,
});
const version = (n: number): CanvasVersionOption => ({ id: `ver-d${n}`, canvasId: `cv-${n}`, canvasName: `canvas_${n}`, name: `canvas_d${n}`, seq: 1, publishedAt: '2026-10-05T10:00:00Z', hasOpenDraft: false });
const draftsOf = (...ds: CanvasDraft[]) => new Map(ds.map((d) => [d.threadRootId, d]));
const idle = () => new Promise<void>((r) => setTimeout(r, 15));
const act0 = async (fn: () => Promise<void>) => { await fn(); await idle(); };
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
const requests = () => svc.getCanvasDraftsByThreads.mock.calls.length + svc.listMyCanvasVersions.mock.calls.length + arts.listMyCanvases.mock.calls.length + svc.getProfileSlug.mock.calls.length;
const mountRoots = (n: number, slug: string | null = 'test-user') => Array.from({ length: n }, (_v, i) => acquireRoot({ rootId: `root-${i + 1}`, viewerId: 'me', slug }));

let current: Map<string, CanvasDraft>;
beforeEach(() => {
  resetCanvasRootStore();
  vi.clearAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  current = draftsOf(...Array.from({ length: 10 }, (_v, i) => draft(i + 1)));
  svc.getCanvasDraftsByThreads.mockImplementation(async (ids: string[]) => new Map(ids.filter((i) => current.has(i)).map((i) => [i, current.get(i)!])));
  svc.listMyCanvasVersions.mockResolvedValue(Array.from({ length: 10 }, (_v, i) => version(i + 1)));
  svc.getProfileSlug.mockResolvedValue('test-user');
  arts.listMyCanvases.mockResolvedValue([]);
});
afterEach(() => {
  resetCanvasRootStore();
  vi.useRealTimers();
});

describe('mount', () => {
  it('10 cards are 2 requests: one for all their drafts, one for the versions (the request cost of a mount)', async () => {
    mountRoots(10);
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0]).toHaveLength(10);
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
    expect(requests()).toBe(2);
    expect(rootSnapshot('root-3')).toMatchObject({ status: 'ready', draft: { id: 'd-3' }, detail: { slug: 'test-user' } });
  });

  it('with the viewer\'s slug not known, it is read ONCE for the whole batch (not per card)', async () => {
    mountRoots(10, null);
    await idle();
    expect(svc.getProfileSlug).toHaveBeenCalledTimes(1);
    expect(requests()).toBe(3);
    expect(rootSnapshot('root-1').detail?.slug).toBe('test-user');
  });

  it('a hidden tab makes ZERO requests on mount, and reads once when the tab comes back', async () => {
    setVisibility('hidden');
    mountRoots(10);
    await idle();
    expect(requests()).toBe(0);
    expect(rootSnapshot('root-1').status).toBe('pending');
    setVisibility('visible');
    await idle();
    expect(requests()).toBe(2);
    expect(rootSnapshot('root-1').status).toBe('ready');
  });

  it('a root with no readable draft is ready with no draft (its card reads the attached version itself)', async () => {
    current = new Map();
    mountRoots(2);
    await idle();
    expect(rootSnapshot('root-1')).toMatchObject({ status: 'ready', draft: null });
    expect(svc.listMyCanvasVersions).not.toHaveBeenCalled(); // no detail to derive
  });

  it('the owner\'s canvases are read for a title only when a card has no published version to take it from', async () => {
    svc.listMyCanvasVersions.mockResolvedValue([version(1)]);
    mountRoots(2);
    await idle();
    expect(arts.listMyCanvases).toHaveBeenCalledTimes(1);
    expect(requests()).toBe(3);
  });

  it('nothing is kept past the last consumer: releasing every card drops the roots, and a signal then reads nothing', async () => {
    const releases = mountRoots(3);
    await idle();
    releases.forEach((r) => r());
    svc.getCanvasDraftsByThreads.mockClear();
    setVisibility('visible');
    await idle();
    expect(svc.getCanvasDraftsByThreads).not.toHaveBeenCalled();
    expect(rootSnapshot('root-1').status).toBe('pending');
  });

  it('a card and a link on the SAME root share one slot (two consumers, one read); the slot lives until both are gone', async () => {
    const card = acquireRoot({ rootId: 'root-1', viewerId: 'me', slug: 'test-user' });
    const link = acquireRoot({ rootId: 'root-1', viewerId: 'me', slug: 'test-user' });
    await idle();
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0]).toEqual(['root-1']);
    card();
    expect(rootSnapshot('root-1').status).toBe('ready');
    link();
    expect(rootSnapshot('root-1').status).toBe('pending');
  });
});

describe('tab return: the request cost', () => {
  it('10 open drafts, nothing changed: ONE request (the drafts), no versions, no slug', async () => {
    mountRoots(10);
    await idle();
    vi.clearAllMocks();
    setVisibility('visible');
    await idle();
    expect(requests()).toBe(1);
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0]).toHaveLength(10);
  });

  it('only the roots that can still change are asked: a closed draft is never asked about again', async () => {
    current.set('root-2', draft(2, { state: 'published' }));
    current.set('root-3', draft(3, { state: 'discarded' }));
    mountRoots(4);
    await idle();
    vi.clearAllMocks();
    setVisibility('visible');
    await idle();
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0].sort()).toEqual(['root-1', 'root-4']);
  });

  it('when ALL are closed a tab return makes no request at all', async () => {
    current = draftsOf(draft(1, { state: 'published' }), draft(2, { state: 'discarded' }));
    mountRoots(2);
    await idle();
    vi.clearAllMocks();
    setVisibility('visible');
    await idle();
    expect(requests()).toBe(0);
  });

  it('one draft published elsewhere: that root changes, the others are untouched; the detail is read ONCE (2 requests), not once per card', async () => {
    mountRoots(10);
    await idle();
    const before = rootSnapshot('root-4');
    const other = rootSnapshot('root-5');
    vi.clearAllMocks();
    current.set('root-4', draft(4, { state: 'published' }));
    setVisibility('visible');
    await idle();
    expect(requests()).toBe(2);
    expect(rootSnapshot('root-4').draft?.state).toBe('published');
    expect(rootSnapshot('root-4')).not.toBe(before);
    expect(rootSnapshot('root-5')).toBe(other); // same object: nothing re-rendered for a card that did not change
  });

  it('three drafts published at once are STILL one detail read', async () => {
    mountRoots(10);
    await idle();
    vi.clearAllMocks();
    for (const n of [1, 2, 3]) current.set(`root-${n}`, draft(n, { state: 'published' }));
    setVisibility('visible');
    await idle();
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
    expect(requests()).toBe(2);
  });

  it('a hidden tab: a reply, an event and time passing make no request; the return makes one', async () => {
    mountRoots(3);
    await idle();
    vi.clearAllMocks();
    setVisibility('hidden');
    touchRootCount('root-1', 1);
    touchRootCount('root-1', 2);
    emitCanvasDraftEvent({ kind: 'published', draftId: 'd-2' });
    await idle();
    expect(requests()).toBe(0);
    setVisibility('visible');
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
  });
});

describe('the other real signals', () => {
  it('a new reply on one root reads that root only; the first count is not a change; the same count says nothing', async () => {
    mountRoots(3);
    touchRootCount('root-2', 4);
    await idle();
    vi.clearAllMocks();
    touchRootCount('root-2', 4);
    await idle();
    expect(requests()).toBe(0);
    touchRootCount('root-2', 5);
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledWith(['root-2']);
    expect(requests()).toBe(1);
  });

  it('the reply counts that arrive while the FIRST read is out are not replies: they are the chat\'s stats loading, and add no second query (the browser showed exactly this)', async () => {
    let answer: (m: Map<string, CanvasDraft>) => void = () => undefined;
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise<Map<string, CanvasDraft>>((r) => { answer = r; }));
    acquireRoot({ rootId: 'root-1', viewerId: 'me', slug: 'test-user', count: 0 });
    await idle(); // the first read is out
    touchRootCount('root-1', 3); // the stats arrive: 0 -> 3
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    await act0(async () => answer(draftsOf(draft(1))));
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
    touchRootCount('root-1', 4); // a real reply, after the first answer, is a signal
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(2);
  });

  it('replies on several roots in one moment are ONE query', async () => {
    mountRoots(3);
    [1, 2, 3].forEach((n) => touchRootCount(`root-${n}`, 1));
    await idle();
    vi.clearAllMocks();
    [1, 2, 3].forEach((n) => touchRootCount(`root-${n}`, 2));
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(svc.getCanvasDraftsByThreads.mock.calls[0]![0]).toHaveLength(3);
  });

  it('the same-tab event for a draft reads that root; another draft\'s event and an "updated" read nothing', async () => {
    mountRoots(3);
    await idle();
    vi.clearAllMocks();
    emitCanvasDraftEvent({ kind: 'published', draftId: 'another' });
    emitCanvasDraftEvent({ kind: 'updated', draftId: 'd-2' });
    await idle();
    expect(requests()).toBe(0);
    current.set('root-2', draft(2, { state: 'published' }));
    emitCanvasDraftEvent({ kind: 'published', draftId: 'd-2' });
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledWith(['root-2']);
    expect(rootSnapshot('root-2').draft?.state).toBe('published');
  });

  it('no polling: time passing makes no request', async () => {
    vi.useFakeTimers();
    mountRoots(5);
    await vi.advanceTimersByTimeAsync(20);
    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests()).toBe(0);
  });

  it('a rename of a canvas invalidates the detail of its card (the versions are read again, the drafts with them)', async () => {
    mountRoots(2);
    await idle();
    vi.clearAllMocks();
    invalidateRootDetail('root-1');
    await idle();
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
  });
});

describe('item 4: the null -> open transition is one flush', () => {
  it('a root that had no draft and now has an open one: one drafts query and one versions query, no repeated read', async () => {
    current = new Map();
    mountRoots(1);
    await idle();
    expect(rootSnapshot('root-1').draft).toBeNull();
    vi.clearAllMocks();
    current.set('root-1', draft(1));
    touchRootCount('root-1', 1);
    touchRootCount('root-1', 2);
    await idle();
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledTimes(1);
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
    expect(rootSnapshot('root-1')).toMatchObject({ status: 'ready', draft: { state: 'open' }, detail: { slug: 'test-user' } });
  });
});

describe('failures and races', () => {
  it('a refused first read is `failed` (a card shows Retry; a link shows nothing); Retry reads again', async () => {
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline'));
    mountRoots(2);
    await idle();
    expect(rootSnapshot('root-1').status).toBe('failed');
    retryRoot('root-1');
    await idle();
    expect(rootSnapshot('root-1')).toMatchObject({ status: 'ready', draft: { id: 'd-1' } });
  });

  it('a refused RE-read keeps what was known', async () => {
    mountRoots(1);
    await idle();
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline'));
    setVisibility('visible');
    await idle();
    expect(rootSnapshot('root-1')).toMatchObject({ status: 'ready', draft: { id: 'd-1' } });
  });

  it('a read that never answers blocks nothing: a later signal reads again and answers', async () => {
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise(() => undefined));
    mountRoots(1);
    await idle();
    expect(rootSnapshot('root-1').status).toBe('pending');
    setVisibility('visible');
    await idle();
    expect(rootSnapshot('root-1').status).toBe('ready');
  });

  it('an older answer that arrives after a newer one does not replace it', async () => {
    let late: (m: Map<string, CanvasDraft>) => void = () => undefined;
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise<Map<string, CanvasDraft>>((r) => { late = r; }));
    mountRoots(1);
    await idle();
    current.set('root-1', draft(1, { state: 'published' }));
    setVisibility('visible');
    await idle();
    expect(rootSnapshot('root-1').draft?.state).toBe('published');
    late(draftsOf(draft(1)));
    await idle();
    expect(rootSnapshot('root-1').draft?.state).toBe('published');
  });

  it('subscribers hear every change of their root, and only theirs', async () => {
    const hear1 = vi.fn();
    const hear2 = vi.fn();
    mountRoots(2);
    subscribeRoot('root-1', hear1);
    subscribeRoot('root-2', hear2);
    await idle();
    hear1.mockClear();
    hear2.mockClear();
    current.set('root-1', draft(1, { state: 'published' }));
    setVisibility('visible');
    await idle();
    expect(hear1).toHaveBeenCalled();
    expect(hear2).not.toHaveBeenCalled();
  });
});

describe('the tap reads the CURRENT state (item 3: a superseded tap read never decides)', () => {
  it('reads the one root, fresh, and answers what the database says now', async () => {
    mountRoots(1);
    await idle();
    current.set('root-1', draft(1, { state: 'published' }));
    vi.clearAllMocks();
    await expect(readRootNow('root-1', TAP_READ_MAX_MS)).resolves.toMatchObject({ state: 'published' });
    expect(svc.getCanvasDraftsByThreads).toHaveBeenCalledWith(['root-1']);
  });

  it('read A (the tap) sees OPEN and is slow; a publish event\'s read B sees published and returns first: the tap follows B', async () => {
    mountRoots(1);
    await idle();
    let answerA: (m: Map<string, CanvasDraft>) => void = () => undefined;
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise<Map<string, CanvasDraft>>((r) => { answerA = r; }));
    const tap = readRootNow('root-1', TAP_READ_MAX_MS); // A
    current.set('root-1', draft(1, { state: 'published' }));
    emitCanvasDraftEvent({ kind: 'published', draftId: 'd-1' }); // B
    await idle();
    expect(rootSnapshot('root-1').draft?.state).toBe('published');
    answerA(draftsOf(draft(1))); // A answers late, with the stale OPEN
    await expect(tap).resolves.toMatchObject({ state: 'published' });
  });

  it('a draft gone since it was drawn answers null (the link goes)', async () => {
    mountRoots(1);
    await idle();
    current = new Map();
    await expect(readRootNow('root-1', TAP_READ_MAX_MS)).resolves.toBeNull();
  });

  it('a tap read that is refused answers what is known', async () => {
    mountRoots(1);
    await idle();
    svc.getCanvasDraftsByThreads.mockRejectedValueOnce(new Error('offline'));
    await expect(readRootNow('root-1', TAP_READ_MAX_MS)).resolves.toMatchObject({ id: 'd-1', state: 'open' });
  });

  it('a tap read that stalls ends at its (short) deadline and answers what is known', async () => {
    mountRoots(1);
    await idle();
    vi.useFakeTimers();
    svc.getCanvasDraftsByThreads.mockImplementationOnce(() => new Promise(() => undefined));
    let got: CanvasDraft | null | undefined;
    const tap = readRootNow('root-1', TAP_READ_MAX_MS).then((d) => { got = d; });
    await vi.advanceTimersByTimeAsync(TAP_READ_MAX_MS - 1);
    expect(got).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    await tap;
    expect(got).toMatchObject({ id: 'd-1' });
    expect(TAP_READ_MAX_MS).toBeLessThanOrEqual(2_000);
  });

  it('a tap that finds a changed state also schedules the ONE flush that brings the card\'s detail', async () => {
    mountRoots(1);
    await idle();
    current.set('root-1', draft(1, { state: 'published' }));
    vi.clearAllMocks();
    await readRootNow('root-1', TAP_READ_MAX_MS);
    await idle();
    expect(rootSnapshot('root-1').draft?.state).toBe('published');
    expect(svc.listMyCanvasVersions).toHaveBeenCalledTimes(1);
  });
});
