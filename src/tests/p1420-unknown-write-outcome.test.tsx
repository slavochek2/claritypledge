/**
 * P1420 — a position write whose answer was lost is settled by re-reading the server; the settle
 * acts only while its write is the latest, stops when cancelled, and never reads "not landed yet"
 * as "not saved"; a failure does not block the next write without a probe; own writes patch the
 * offline cache without losing each other. Browser half: e2e/p1420-clear-position-lost-response.spec.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const pointsMock = vi.hoisted(() => ({ setPosition: vi.fn(), removePosition: vi.fn(), readMyPosition: vi.fn() }));
vi.mock('@/app/data/points-service', () => ({ pointsService: pointsMock }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: null }) }));

import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import {
  NEEDS_INTERNET_MESSAGE,
  UNCONFIRMED_WRITE_MESSAGE,
  WriteTimeoutError,
  canSendWrite,
  writeFailureMessage,
} from '@/app/hooks/use-online-write-guard';
import { positionWriteMapSizesForTesting } from '@/app/data/position-write-generation';
import {
  CHECKING_TOAST_ID,
  _resetPositionWritesForTesting,
  beginPositionWrite,
  settlePositionWrite,
} from '@/app/data/position-write-outcome';
import { _resetProbeForTesting } from '@/app/contexts/offline-status-context';
import { recordNetworkFailure, isSupabaseUnreachable, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';
import {
  MemoryEntryStore,
  _setOfflineEntryStoreForTesting,
  _resetOwnWritesForTesting,
  readThrough,
  type OfflineEntryStore,
} from '@/lib/offline-read-cache';
import { patchPointList, recordOwnPosition, withViewerPosition } from '@/app/data/own-position-writes';
import type { PointWithUserPosition, PositionType } from '@/app/types';

let fetchMock: ReturnType<typeof vi.spyOn>;
let store: MemoryEntryStore;
const AUTH_KEY = 'sb-localhost-auth-token';
const signInAs = (id: string) => localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'x', user: { id } }));

beforeEach(() => {
  _resetNetworkOutcomeForTesting();
  _resetOwnWritesForTesting();
  _resetPositionWritesForTesting();
  _resetProbeForTesting();
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  localStorage.clear();
  signInAs('viewer-1');
  for (const m of Object.values(toastMock)) m.mockClear();
  for (const m of Object.values(pointsMock)) m.mockReset();
  fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no network in unit tests'));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockRestore();
});

/** The request reached the server; its answer was lost on the way back. */
const answerLost = async () => { recordNetworkFailure(); throw new TypeError('Failed to fetch'); };
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function setupGuard() {
  const onAfterRemove = vi.fn();
  const hook = renderHook(() => useRemovePositionGuard({ userId: 'viewer-1', onAfterRemove }));
  return { hook, onAfterRemove };
}
async function confirmRemoval(hook: ReturnType<typeof setupGuard>['hook']) {
  await act(async () => { await hook.result.current.guardedRemovePosition('p1'); });
  await act(async () => { await hook.result.current.dialogProps.onConfirm(); });
}

const counts = (o: Partial<Record<PositionType, number>>) => ({
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0, ...o,
});
const point = (id: string, agree: number, mine: PositionType | null): PointWithUserPosition => ({
  id,
  statement: id,
  tags: [],
  positionCounts: counts({ agree }),
  totalPositions: agree,
  userPosition: mine ? { id: 'pp', pointId: id, userId: 'viewer-1', position: mine, createdAt: 'c', updatedAt: 'u' } : undefined,
} as unknown as PointWithUserPosition);
const card = (pt: PointWithUserPosition, onPointRemoved = vi.fn()) => (
  <MemoryRouter>
    <FeedPointCard point={pt} onPointRemoved={onPointRemoved} />
  </MemoryRouter>
);
const pressed = (group: string) => screen.getAllByTestId(`${group}-group`)[0]!;

// ─── 1. an unanswered write is settled, never "nothing was saved" ────────────

describe('goal 1: a lost answer is settled from the server', () => {
  it('removal applied, answer lost → no row → treated as removed, no failure toast', async () => {
    pointsMock.removePosition.mockImplementation(answerLost);
    pointsMock.readMyPosition.mockResolvedValue(null);
    const { hook, onAfterRemove } = setupGuard();
    await confirmRemoval(hook);
    expect(toastMock.loading).toHaveBeenCalledWith(UNCONFIRMED_WRITE_MESSAGE, { id: CHECKING_TOAST_ID });
    expect(onAfterRemove).toHaveBeenCalledWith('p1');
    expect(toastMock.dismiss).toHaveBeenCalledWith(CHECKING_TOAST_ID);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(hook.result.current.dialogProps.open).toBe(false);
  });

  it('removal NOT applied (request answered with an error, row still there) → "not removed"', async () => {
    pointsMock.removePosition.mockImplementation(answerLost);
    pointsMock.readMyPosition.mockResolvedValue('agree');
    const { hook, onAfterRemove } = setupGuard();
    await confirmRemoval(hook);
    expect(onAfterRemove).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Your position was not removed. Try again.');
  });

  it('writeFailureMessage never says "nothing was saved" for a write that was sent', () => {
    expect(writeFailureMessage(new WriteTimeoutError(), 'fallback')).not.toMatch(/nothing was saved/i);
    expect(writeFailureMessage({ name: 'NetworkBlipError' }, 'fallback')).not.toMatch(/nothing was saved/i);
  });

  it('[review item 1] while the raw request is still out, the old value is "not landed yet": no "not saved", no revert', async () => {
    vi.useFakeTimers();
    const raw = deferred<undefined>();
    pointsMock.setPosition.mockReturnValue(raw.promise); // timed out client-side, still in flight
    pointsMock.readMyPosition.mockResolvedValue(null); // the server does not have it YET
    render(card(point('p1', 1, null)));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(12_100 + 2_000 + 4_000); }); // timeout + 3 reads
    expect(pointsMock.readMyPosition.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'true');
    // It lands; the next read sees it → confirmed, the vote stays, no error.
    pointsMock.readMyPosition.mockResolvedValue('agree');
    await act(async () => { raw.resolve(undefined); await vi.advanceTimersByTimeAsync(8_100); });
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── 2. one generation per (viewer, point), checked before every effect ──────

describe('goal 2 / review item 2: a settle acts only while its write is the latest', () => {
  it('[Codex race 1] removal settle resolving null AFTER a newer Disagree does not erase Disagree', async () => {
    const read = deferred<PositionType | null>();
    pointsMock.removePosition.mockImplementation(answerLost);
    pointsMock.readMyPosition.mockReturnValueOnce(read.promise);
    pointsMock.setPosition.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 })); // the connection is back
    const onPointRemoved = vi.fn();
    render(card(point('p1', 2, 'agree'), onPointRemoved));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /Clear position/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove position' })); });
    await act(async () => { fireEvent.click(pressed('disagree')); }); // newer write, saved
    expect(pressed('disagree')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { read.resolve(null); }); // the old removal's delayed answer
    expect(pressed('disagree')).toHaveAttribute('aria-pressed', 'true');
    expect(onPointRemoved).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('rows refreshed in place before a removal settles: the parent is not asked to lower them again', async () => {
    const read = deferred<PositionType | null>();
    pointsMock.removePosition.mockImplementation(answerLost);
    pointsMock.readMyPosition.mockReturnValueOnce(read.promise);
    const onPointRemoved = vi.fn();
    const view = render(card(point('p1', 2, 'agree'), onPointRemoved));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /Clear position/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove position' })); });
    view.rerender(card(point('p1', 1, null), onPointRemoved)); // the server row already excludes the viewer
    await act(async () => { read.resolve(null); });
    expect(onPointRemoved).not.toHaveBeenCalled();
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a newer vote made while a lost answer settles is not overwritten by the old answer', async () => {
    const read = deferred<PositionType | null>();
    pointsMock.setPosition
      .mockImplementationOnce(answerLost) // Agree: answer lost
      .mockResolvedValueOnce(undefined) // Disagree: saved
      .mockRejectedValueOnce(new Error('rejected by the server')); // Unsure: a real failure
    pointsMock.readMyPosition.mockReturnValueOnce(read.promise);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    render(card(point('p1', 1, null)));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(pressed('disagree')); });
    await act(async () => { read.resolve('agree'); });
    expect(pressed('disagree')).toHaveAttribute('aria-pressed', 'true');
    // The last SAVED vote is still Disagree: a failing next click reverts to it.
    await act(async () => { fireEvent.click(pressed('unsure')); });
    expect(pressed('disagree')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── 4. cancellable ──────────────────────────────────────────────────────────

describe('review item 4: a settle stops on unmount, sign-out and supersession', () => {
  it('unmount: no more reads, the checking toast is dismissed, no effects', async () => {
    vi.useFakeTimers();
    pointsMock.setPosition.mockImplementation(answerLost);
    pointsMock.readMyPosition.mockRejectedValue(new Error('still offline'));
    const view = render(card(point('p1', 1, null)));
    await act(async () => { fireEvent.click(pressed('agree')); });
    const readsBefore = pointsMock.readMyPosition.mock.calls.length;
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(pointsMock.readMyPosition.mock.calls.length).toBe(readsBefore);
    expect(toastMock.dismiss).toHaveBeenCalledWith(CHECKING_TOAST_ID);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('sign-out (or another account) mid-settle: superseded, nothing applied', async () => {
    const read = deferred<PositionType | null>();
    pointsMock.readMyPosition.mockReturnValueOnce(read.promise);
    const generation = beginPositionWrite('viewer-1', 'p1');
    const settle = settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation, expected: 'agree', delays: [0] });
    localStorage.removeItem(AUTH_KEY);
    read.resolve('agree');
    await expect(settle).resolves.toEqual({ kind: 'superseded' });
  });

  it('a newer write supersedes: the old settle stops reading', async () => {
    vi.useFakeTimers();
    pointsMock.readMyPosition.mockRejectedValue(new Error('offline'));
    const generation = beginPositionWrite('viewer-1', 'p1');
    const settle = settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation, expected: 'agree' });
    await vi.advanceTimersByTimeAsync(10);
    beginPositionWrite('viewer-1', 'p1');
    const reads = pointsMock.readMyPosition.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(settle).resolves.toEqual({ kind: 'superseded' });
    expect(pointsMock.readMyPosition.mock.calls.length).toBe(reads);
  });
});

// ─── 8. one shared checking toast ────────────────────────────────────────────

describe('review item 8: one "Checking…" toast across pending writes', () => {
  it('two settles in flight show one toast, dismissed when the last one finishes', async () => {
    const a = deferred<PositionType | null>();
    const b = deferred<PositionType | null>();
    pointsMock.readMyPosition.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const s1 = settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation: beginPositionWrite('viewer-1', 'p1'), expected: 'agree', delays: [0] });
    const s2 = settlePositionWrite({ userId: 'viewer-1', pointId: 'p2', generation: beginPositionWrite('viewer-1', 'p2'), expected: 'agree', delays: [0] });
    await vi.waitFor(() => expect(pointsMock.readMyPosition).toHaveBeenCalledTimes(2));
    expect(toastMock.loading).toHaveBeenCalledTimes(1);
    a.resolve('agree');
    await s1;
    expect(toastMock.dismiss).not.toHaveBeenCalled();
    b.resolve('agree');
    await s2;
    expect(toastMock.dismiss).toHaveBeenCalledTimes(1);
  });
});

// ─── 2/5. probe before refusing, coalesced ──────────────────────────────────

describe('goal 2 / review item 5: probe first, one shared probe', () => {
  it('after a failure, the retry probes and is SENT when the probe answers', async () => {
    recordNetworkFailure();
    expect(isSupabaseUnreachable()).toBe(true);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    pointsMock.removePosition.mockResolvedValue(undefined);
    const { hook, onAfterRemove } = setupGuard();
    await confirmRemoval(hook);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pointsMock.removePosition).toHaveBeenCalledWith('p1', 'viewer-1');
    expect(onAfterRemove).toHaveBeenCalledWith('p1');
  });

  it('when the probe fails too, the write is blocked with the needs-internet message', async () => {
    recordNetworkFailure();
    const { hook } = setupGuard();
    await confirmRemoval(hook);
    expect(pointsMock.removePosition).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(NEEDS_INTERNET_MESSAGE);
  });

  it('concurrent writes share one probe; a failed probe is reused for a short cooldown', async () => {
    recordNetworkFailure();
    const probe = deferred<Response>();
    fetchMock.mockReturnValueOnce(probe.promise);
    const both = Promise.all([canSendWrite(), canSendWrite()]);
    probe.reject(new TypeError('Failed to fetch'));
    await expect(both).resolves.toEqual([false, false]);
    await expect(canSendWrite()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('browser offline: blocked without a probe', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await expect(canSendWrite()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── 6. withdrawn survives a refresh that agrees with it ────────────────────

describe('review item 6: the withdrawal resets on a changed VALUE, not a new object', () => {
  it('a refreshed row object with the same (stale) position keeps a confirmed removal unlit', async () => {
    pointsMock.removePosition.mockResolvedValue(undefined);
    const view = render(card(point('p1', 2, 'agree')));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /Clear position/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove position' })); });
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'false');
    view.rerender(card(point('p1', 2, 'agree'))); // a new object, same value (a stale refresh)
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─── 4 (goal). own writes patch the offline cache ────────────────────────────

describe('goal 4: own writes patch the offline cache and reads in flight', () => {
  it('withViewerPosition removes the viewer and their count, and is idempotent', () => {
    const once = withViewerPosition(point('p1', 2, 'agree'), 'viewer-1', null);
    expect(once.userPosition).toBeUndefined();
    expect(once.positionCounts.agree).toBe(1);
    expect(withViewerPosition(once, 'viewer-1', null)).toBe(once);
  });

  it('patchPointList drops a point left with no positions only when asked', () => {
    expect(patchPointList([point('p1', 1, 'agree')], 'p1', 'viewer-1', null, true)).toEqual([]);
    expect(patchPointList([point('p1', 1, 'agree')], 'p1', 'viewer-1', null, false)).toHaveLength(1);
  });

  it('a stored /feed copy loses the removed position (other owners untouched, age kept)', async () => {
    const rows = { points: [point('p1', 2, 'agree')], cloudPoints: [point('p1', 2, 'agree')], stories: [], cloudStories: [] };
    await store.put({ key: 'u:viewer-1|feed|desc:', type: 'feed', data: rows, storedAt: 1 });
    await store.put({ key: 'u:someone-else|feed|desc:', type: 'feed', data: rows, storedAt: 1 });
    await recordOwnPosition('p1', 'viewer-1', null, 1);
    const mine = (await store.get('u:viewer-1|feed|desc:'))!;
    expect((mine.data as typeof rows).points[0]!.userPosition).toBeUndefined();
    expect(mine.storedAt).toBe(1);
    const theirs = (await store.get('u:someone-else|feed|desc:'))!;
    expect((theirs.data as typeof rows).points[0]!.userPosition).toBeDefined();
  });

  it('[Codex race 2] two concurrent patches on one cached feed keep each other (newer Unsure is not lost)', async () => {
    // A store whose reads are slow: without a per-key lock both patches read the same old entry.
    const inner = new MemoryEntryStore();
    const slow: OfflineEntryStore = {
      get: async (k) => { const e = await inner.get(k); await new Promise((r) => setTimeout(r, 5)); return e; },
      put: (e) => inner.put(e),
      delete: (k) => inner.delete(k),
      listType: (t) => inner.listType(t),
      clear: () => inner.clear(),
    };
    _setOfflineEntryStoreForTesting(slow);
    const rows = { points: [point('p1', 2, 'agree'), point('p2', 1, null)], cloudPoints: [], stories: [], cloudStories: [] };
    await inner.put({ key: 'u:viewer-1|feed|desc:', type: 'feed', data: rows, storedAt: 1 });
    await Promise.all([recordOwnPosition('p1', 'viewer-1', null, 1), recordOwnPosition('p2', 'viewer-1', 'unsure', 2)]);
    const after = (await inner.get('u:viewer-1|feed|desc:'))!.data as typeof rows;
    expect(after.points.find((p) => p.id === 'p1')!.userPosition).toBeUndefined();
    expect(after.points.find((p) => p.id === 'p2')!.userPosition?.position).toBe('unsure');
  });

  it('a read that started before the removal shows and stores its rows with the removal applied', async () => {
    type Rows = { points: PointWithUserPosition[]; cloudPoints: PointWithUserPosition[]; stories: unknown[]; cloudStories: unknown[] };
    const answer = deferred<Rows>();
    const pending = readThrough<Rows>('feed', 'desc:', () => answer.promise, { viewerId: 'viewer-1' });
    await recordOwnPosition('p1', 'viewer-1', null, 1);
    answer.resolve({ points: [point('p1', 2, 'agree')], cloudPoints: [], stories: [], cloudStories: [] });
    const result = await pending;
    if (result.source !== 'network' || !result.data) throw new Error(`expected a network result, got ${result.source}`);
    expect(result.data.points[0]!.userPosition).toBeUndefined();
    await vi.waitFor(async () => {
      const stored = await store.get('u:viewer-1|feed|desc:');
      expect((stored?.data as Rows).points[0]!.userPosition).toBeUndefined();
    });
  });
});

// ─── round 3 ─────────────────────────────────────────────────────────────────

describe('round 3 item 1: cache patches are ordered by when the write was MADE', () => {
  it('[Codex] an older Disagree recorded after a newer Unsure does not overwrite it', async () => {
    const rows = { points: [point('p1', 1, 'agree')], cloudPoints: [], stories: [], cloudStories: [] };
    await store.put({ key: 'u:viewer-1|feed|desc:', type: 'feed', data: rows, storedAt: 1 });
    await recordOwnPosition('p1', 'viewer-1', 'unsure', 20); // newer write, answered first
    await recordOwnPosition('p1', 'viewer-1', 'disagree', 10); // older write, answered later
    const after = (await store.get('u:viewer-1|feed|desc:'))!.data as typeof rows;
    expect(after.points[0]!.userPosition?.position).toBe('unsure');
  });

  it('the same rule holds for a read in flight', async () => {
    type Rows = { points: PointWithUserPosition[]; cloudPoints: PointWithUserPosition[]; stories: unknown[]; cloudStories: unknown[] };
    const answer = deferred<Rows>();
    const pending = readThrough<Rows>('feed', 'desc:', () => answer.promise, { viewerId: 'viewer-1' });
    await recordOwnPosition('p1', 'viewer-1', 'unsure', 20);
    await recordOwnPosition('p1', 'viewer-1', 'disagree', 10);
    answer.resolve({ points: [point('p1', 1, 'agree')], cloudPoints: [], stories: [], cloudStories: [] });
    const result = await pending;
    if (result.source !== 'network' || !result.data) throw new Error('expected a network result');
    expect(result.data.points[0]!.userPosition?.position).toBe('unsure');
  });
});

describe('round 3 item 3: cancellation is prompt', () => {
  it('an already-aborted signal: no read, superseded at once, toast released', async () => {
    const controller = new AbortController();
    controller.abort();
    const generation = beginPositionWrite('viewer-1', 'p1');
    const result = await settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation, expected: 'agree', signal: controller.signal });
    expect(result).toEqual({ kind: 'superseded' });
    expect(pointsMock.readMyPosition).not.toHaveBeenCalled();
    expect(toastMock.dismiss).toHaveBeenCalledWith(CHECKING_TOAST_ID);
  });

  it('a read that never answers is abandoned the moment the caller aborts', async () => {
    pointsMock.readMyPosition.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const generation = beginPositionWrite('viewer-1', 'p1');
    const settle = settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation, expected: 'agree', signal: controller.signal });
    await vi.waitFor(() => expect(pointsMock.readMyPosition).toHaveBeenCalled());
    controller.abort();
    expect(toastMock.dismiss).toHaveBeenCalledWith(CHECKING_TOAST_ID); // released at once
    await expect(settle).resolves.toEqual({ kind: 'superseded' });
  });

  it('a long wait between reads ends the moment a newer write starts', async () => {
    pointsMock.readMyPosition.mockRejectedValue(new Error('offline'));
    const generation = beginPositionWrite('viewer-1', 'p1');
    const settle = settlePositionWrite({ userId: 'viewer-1', pointId: 'p1', generation, expected: 'agree', delays: [0, 60_000] });
    await vi.waitFor(() => expect(pointsMock.readMyPosition).toHaveBeenCalledTimes(1));
    beginPositionWrite('viewer-1', 'p1'); // real timers: without a prompt cancel this would wait 60s
    await expect(settle).resolves.toEqual({ kind: 'superseded' });
  });
});

describe('round 3 item 4: re-voting after a withdrawal', () => {
  // No parent lowering the counts (an embed without onPointRemoved): the fetched row keeps the
  // viewer's Agree in its counts, so a withdrawal that stayed set across the re-vote added it twice.
  it('Agree held → removed → Agree again: counted once, not twice', async () => {
    pointsMock.removePosition.mockResolvedValue(undefined);
    pointsMock.setPosition.mockResolvedValue(undefined);
    render(card(point('p1', 2, 'agree'))); // the viewer and one other person agree
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: /Clear position/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove position' })); });
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { fireEvent.click(pressed('agree')); });
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('agree')).toHaveTextContent('2');
    expect(pressed('agree')).not.toHaveTextContent('3');
  });
});

describe('round 3 item 5: a superseded write that succeeded still moves the baseline', () => {
  it('Agree (succeeds late) then Disagree (fails): rolls back to Agree — the server state', async () => {
    const agree = deferred<undefined>();
    pointsMock.setPosition
      .mockReturnValueOnce(agree.promise)
      .mockRejectedValueOnce(new Error('rejected by the server'));
    render(card(point('p1', 1, null)));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(pressed('disagree')); }); // queued behind Agree
    await act(async () => { agree.resolve(undefined); });
    await vi.waitFor(() => expect(pointsMock.setPosition).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(pressed('agree')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('disagree')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('round 3 item 6: bookkeeping is bounded', () => {
  it('after writes finish, no generation entries remain', async () => {
    pointsMock.setPosition.mockResolvedValue(undefined);
    render(card(point('p1', 1, null)));
    await act(async () => { fireEvent.click(pressed('agree')); });
    await act(async () => { fireEvent.click(pressed('disagree')); });
    await vi.waitFor(() => expect(pointsMock.setPosition).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(positionWriteMapSizesForTesting()).toEqual({ latest: 0, active: 0 });
  });
});
