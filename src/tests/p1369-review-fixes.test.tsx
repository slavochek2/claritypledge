/**
 * P1369 — pre-ship review findings (unit half; the browser half is in
 * e2e/offline/p1369-regressions.spec.ts).
 *
 *   R1  feed/stake vote writes: guarded, reverted on failure, and a hanging save is bounded
 *   R2  the offline pack re-warms its route chunks after a deploy (the stamp carries the build)
 *   R3  a 5xx/429/status-0 answer is server trouble: it never deletes, overwrites or is cached
 *   R4  a failed cache clear is reported truthfully and blocks cached reads until a clear succeeds
 *   R5  resource keys do not depend on the React auth user (the owner already partitions)
 *   R6  story page: a failed vote restores the selection AND the counts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const pointsMock = vi.hoisted(() => ({ setPosition: vi.fn(), removePosition: vi.fn() }));
vi.mock('@/app/data/points-service', () => ({ pointsService: pointsMock }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: null }) }));
// Route chunks the pack warms: here they must not load the real pages.
const chunkLoads = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/app/pages/stake-page', () => { chunkLoads.n += 1; return {}; });
vi.mock('@/app/pages/letter-reading-page', () => ({}));
vi.mock('@/app/pages/feed-page', () => ({}));
vi.mock('@/app/pages/org-directory-page', () => ({}));

import {
  readThrough,
  MemoryEntryStore,
  clearOfflineReadCacheWithin,
  retryPendingOfflineClear,
  isOfflineClearPending,
  _setOfflineEntryStoreForTesting,
  type OfflineEntryStore,
} from '@/lib/offline-read-cache';
import {
  withNetworkOutcome,
  recordNetworkFailure,
  _resetNetworkOutcomeForTesting,
} from '@/lib/network-outcome';
import { NEEDS_INTERNET_MESSAGE, WRITE_TIMEOUT_MS } from '@/app/hooks/use-online-write-guard';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import { stakeRead, feedRead } from '@/app/data/offline-reads';
import { offlinePackDue, runOfflinePack, OFFLINE_PACK_REFRESH_MS } from '@/lib/offline-pack';
import type { PointWithUserPosition, PointSummary } from '@/app/types';

const AUTH_KEY = 'sb-localhost-auth-token';
const signInAs = (id: string) => localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'x', user: { id } }));

let store: MemoryEntryStore;

beforeEach(() => {
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
  toastMock.error.mockReset();
  pointsMock.setPosition.mockReset();
  pointsMock.removePosition.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const seed = async (type: 'story' | 'event-access', id: string, data: unknown) => {
  await readThrough(type, id, async () => data);
  await vi.waitFor(async () => expect((await store.listType(type)).length).toBeGreaterThan(0));
};

// ─── R1 ──────────────────────────────────────────────────────────────────────

const aPoint = {
  id: 'p1',
  statement: 'a point',
  tags: [],
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1,
  userPosition: null,
} as unknown as PointWithUserPosition;

function renderFeedPointCard() {
  return render(
    <MemoryRouter>
      <FeedPointCard point={aPoint} />
    </MemoryRouter>,
  );
}
const agree = () => screen.getAllByTestId('agree-group')[0]!;
const disagree = () => screen.getAllByTestId('disagree-group')[0]!;

describe('R1: feed/stake point card votes', () => {
  it('captive portal: the write never reaches the server → needs-internet message, vote not left selected', async () => {
    pointsMock.setPosition.mockImplementation(async () => {
      recordNetworkFailure();
      throw new Error('fetch failed');
    });
    renderFeedPointCard();
    await act(async () => { fireEvent.click(agree()); });
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
  });

  it('known unreachable: the write is blocked before it is sent', async () => {
    recordNetworkFailure();
    renderFeedPointCard();
    await act(async () => { fireEvent.click(agree()); });
    expect(pointsMock.setPosition).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
  });

  it('a save that never answers does not look saved forever: bounded, then reverted with the needs-internet message', async () => {
    vi.useFakeTimers();
    pointsMock.setPosition.mockImplementation(() => new Promise(() => {}));
    renderFeedPointCard();
    await act(async () => { fireEvent.click(agree()); });
    expect(agree()).toHaveAttribute('aria-pressed', 'true'); // optimistic, while in flight
    await act(async () => { await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS + 100); });
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
  });

  it('two clicks that both fail leave no vote showing (reverts do not restore an unsaved vote)', async () => {
    const pending: Array<(e: Error) => void> = [];
    pointsMock.setPosition.mockImplementation(() => new Promise((_, reject) => { pending.push(reject); }));
    renderFeedPointCard();
    await act(async () => { fireEvent.click(agree()); });
    await act(async () => { fireEvent.click(disagree()); });
    await act(async () => { pending[0]!(new Error('boom')); });
    await act(async () => { await Promise.resolve(); pending[1]?.(new Error('boom')); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
    expect(disagree()).toHaveAttribute('aria-pressed', 'false');
  });

  it('control: a save that lands keeps the vote and shows no error', async () => {
    pointsMock.setPosition.mockResolvedValue(undefined);
    renderFeedPointCard();
    await act(async () => { fireEvent.click(agree()); });
    expect(agree()).toHaveAttribute('aria-pressed', 'true');
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

describe("R1: a story card's nested point (QuotedPointCard) reverts when the write did not land", () => {
  const summary = { id: 'p2', statement: 'nested', positionCounts: {}, userPosition: null } as unknown as PointSummary;
  const renderQuoted = (onPositionSelect: (p: unknown) => unknown) =>
    render(
      <MemoryRouter>
        <QuotedPointCard
          point={summary}
          authorId="a"
          authorName="A"
          authorHasPledged={false}
          currentUserId="viewer-1"
          onPositionSelect={onPositionSelect as never}
        />
      </MemoryRouter>,
    );

  it('the handler reports failure (false): the optimistic vote is taken back', async () => {
    renderQuoted(async () => false);
    await act(async () => { fireEvent.click(agree()); });
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
  });

  it('two clicks that both fail, failures arriving in click order: no vote left showing', async () => {
    const results: Array<(v: boolean) => void> = [];
    renderQuoted(() => new Promise<boolean>((r) => { results.push(r); }));
    await act(async () => { fireEvent.click(agree()); });
    await act(async () => { fireEvent.click(disagree()); });
    await act(async () => { results[0]!(false); });
    await act(async () => { results[1]!(false); });
    expect(agree()).toHaveAttribute('aria-pressed', 'false');
    expect(disagree()).toHaveAttribute('aria-pressed', 'false');
  });

  it('control: the handler reports nothing (the profile caller): the vote stays', async () => {
    renderQuoted(() => undefined);
    await act(async () => { fireEvent.click(agree()); });
    expect(agree()).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── R2 ──────────────────────────────────────────────────────────────────────

describe('R2: the offline pack after a deploy', () => {
  const setEntry = (src: string) => {
    document.querySelectorAll('script[data-test-entry]').forEach((s) => s.remove());
    const s = document.createElement('script');
    s.type = 'module';
    s.setAttribute('src', src);
    s.setAttribute('data-test-entry', '1');
    document.head.appendChild(s);
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
  });

  it('a new build within the refresh window re-warms the route chunks (and only them)', async () => {
    setEntry('/assets/index-AAAA.js');
    expect((await runOfflinePack(undefined)).ran).toBe(true);
    expect(await offlinePackDue()).toMatchObject({ due: false, reason: 'fresh' });

    setEntry('/assets/index-BBBB.js'); // deploy B, an hour later
    const due = await offlinePackDue();
    expect(due).toMatchObject({ due: true, chunksOnly: true });
    const r = await runOfflinePack(undefined);
    expect(r).toMatchObject({ ran: true, attempted: 0 }); // no data re-fetched: data is still fresh
    // Bounded: once per build.
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'fresh' });
  });

  it('after the refresh window, a full run as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setEntry('/assets/index-AAAA.js');
    await runOfflinePack(undefined);
    vi.setSystemTime(Date.now() + OFFLINE_PACK_REFRESH_MS + 1);
    const r = await runOfflinePack(undefined);
    expect(r.ran).toBe(true);
    expect(r.attempted).toBeGreaterThan(0);
  });
});

// ─── R3 ──────────────────────────────────────────────────────────────────────

describe('R3: server trouble (5xx, 429, status 0) is not "reached the server"', () => {
  const troubled = (status: number) =>
    withNetworkOutcome(async () => (status === 0 ? ({ status: 0, ok: false } as Response) : new Response('{}', { status })));

  for (const status of [500, 503, 429, 0]) {
    it(`${status}: a swallowed null does not delete the cached copy — the copy is shown`, async () => {
      await seed('story', 's1', { v: 'good' });
      const f = troubled(status);
      const r = await readThrough('story', 's1', async () => {
        await f('https://x.supabase.co/rest/v1/stories');
        return null; // the service swallowed the error into "not found"
      });
      expect(r).toMatchObject({ source: 'cache', data: { v: 'good' } });
      expect((await store.listType('story')).length).toBe(1);
    });
  }

  it('503: a swallowed "not registered" never overwrites the cached "registered" (event access)', async () => {
    await seed('event-access', 'e1', { registered: true });
    const f = troubled(503);
    const r = await readThrough('event-access', 'e1', async () => {
      await f('https://x.supabase.co/rest/v1/event_rsvps');
      return { registered: false };
    });
    expect(r).toMatchObject({ source: 'cache', data: { registered: true } });
    await new Promise((res) => setTimeout(res, 20));
    const again = await readThrough('event-access', 'e1', async () => {
      recordNetworkFailure();
      return null;
    });
    expect(again).toMatchObject({ source: 'cache', data: { registered: true } });
  });

  it('500 with nothing cached: the result is shown but never cached', async () => {
    const f = troubled(500);
    const r = await readThrough('story', 's9', async () => {
      await f('https://x.supabase.co/rest/v1/stories');
      return { partial: true };
    });
    expect(r).toMatchObject({ source: 'network', data: { partial: true } });
    await new Promise((res) => setTimeout(res, 20));
    expect(await store.listType('story')).toEqual([]);
  });

  it('control: a 404 / 200 still reaches the server (a real not-found deletes)', async () => {
    await seed('story', 's1', { v: 'good' });
    const f = troubled(404);
    const r = await readThrough('story', 's1', async () => {
      await f('https://x.supabase.co/rest/v1/stories');
      return null;
    });
    expect(r).toEqual({ source: 'network', data: null });
  });
});

// ─── R4 ──────────────────────────────────────────────────────────────────────

describe('R4: a cache clear that fails', () => {
  const failing = (inner: MemoryEntryStore, destroyOk: boolean): OfflineEntryStore => ({
    get: (k) => inner.get(k),
    put: (e) => inner.put(e),
    delete: (k) => inner.delete(k),
    listType: (t) => inner.listType(t),
    clear: async () => { throw new Error('clear failed'); },
    destroy: async () => {
      if (!destroyOk) throw new Error('deleteDatabase failed');
      await inner.clear();
    },
  });

  it('clear fails, deleteDatabase works: success, nothing left', async () => {
    await seed('story', 's1', { v: 1 });
    _setOfflineEntryStoreForTesting(failing(store, true));
    expect(await clearOfflineReadCacheWithin(500)).toBe(true);
    expect(await store.listType('story')).toEqual([]);
    expect(isOfflineClearPending()).toBe(false);
  });

  it('both fail: reported as failure, and cached rows are never served until a clear succeeds', async () => {
    await seed('story', 's1', { v: 1 });
    _setOfflineEntryStoreForTesting(failing(store, false));
    expect(await clearOfflineReadCacheWithin(500)).toBe(false);
    expect(isOfflineClearPending()).toBe(true);
    const r = await readThrough('story', 's1', async () => { recordNetworkFailure(); return null; });
    expect(r).toEqual({ source: 'offline' });

    // Next start: the retry succeeds and lifts the block.
    _setOfflineEntryStoreForTesting(store);
    expect(await retryPendingOfflineClear()).toBe(true);
    expect(isOfflineClearPending()).toBe(false);
    expect(await store.listType('story')).toEqual([]);
  });
});

// ─── R5 ──────────────────────────────────────────────────────────────────────

describe('R5: resource keys do not depend on the React auth user', () => {
  it('stake and feed ids are the same whether or not the profile has loaded', () => {
    expect(stakeRead('cmp7', 'viewer-1').id).toBe(stakeRead('cmp7', undefined).id);
    expect(feedRead('viewer-1', false, undefined).id).toBe(feedRead(undefined, false, undefined).id);
  });

  it('a read fetched for a viewer who is not the stored session owner is never cached under that owner', async () => {
    signInAs('viewer-1');
    await readThrough('story', 's1', async () => ({ forAnon: true }), { viewerId: undefined });
    await new Promise((res) => setTimeout(res, 20));
    expect(await store.listType('story')).toEqual([]);
    await readThrough('story', 's1', async () => ({ forViewer: true }), { viewerId: 'viewer-1' });
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
  });
});

// ─── R1: the removal path (guardedRemovePosition → confirm) ─────────────────

import { renderHook } from '@testing-library/react';
import { useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';

describe('R1: removing a vote (guardedRemovePosition confirm)', () => {
  const setup = () => {
    const onAfterRemove = vi.fn();
    const hook = renderHook(() => useRemovePositionGuard({ userId: 'viewer-1', onAfterRemove }));
    return { hook, onAfterRemove };
  };

  it('captive portal: the removal never reaches the server → needs-internet message, not removed', async () => {
    pointsMock.removePosition.mockImplementation(async () => { recordNetworkFailure(); throw new Error('fetch failed'); });
    const { hook, onAfterRemove } = setup();
    await act(async () => { await hook.result.current.guardedRemovePosition('p1'); });
    await act(async () => { await hook.result.current.dialogProps.onConfirm(); });
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
    expect(onAfterRemove).not.toHaveBeenCalled();
  });

  it('a removal that never answers is bounded: needs-internet message, spinner stops', async () => {
    vi.useFakeTimers();
    pointsMock.removePosition.mockImplementation(() => new Promise(() => {}));
    const { hook, onAfterRemove } = setup();
    await act(async () => { await hook.result.current.guardedRemovePosition('p1'); });
    act(() => { void hook.result.current.dialogProps.onConfirm(); });
    expect(hook.result.current.dialogProps.isRemoving).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS + 100); });
    expect(hook.result.current.dialogProps.isRemoving).toBe(false);
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
    expect(onAfterRemove).not.toHaveBeenCalled();
  });

  it('known unreachable: the removal is not sent', async () => {
    recordNetworkFailure();
    const { hook } = setup();
    await act(async () => { await hook.result.current.guardedRemovePosition('p1'); });
    await act(async () => { await hook.result.current.dialogProps.onConfirm(); });
    expect(pointsMock.removePosition).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
  });
});
