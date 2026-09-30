/**
 * P1369 — regressions for defects confirmed by review after the first implementation (the
 * browser-observable ones live in e2e/offline/p1369-regressions.spec.ts).
 *
 *   1  a read decides from ITS OWN outcome, not the app-wide last outcome
 *   2  an uncached read on a silently hanging network resolves to needs-connection
 *   3  room-code partitions are collision-resistant (FNV-1a 32-bit collided)
 *   4  a failure in the same millisecond as a success is not lost
 *   5  the offline bar is a state of the shared SessionBar, not a look-alike component
 *   6  offline, the transcription bar keeps a local "Stop microphone"
 *   9  a cache served by the deadline counts as network trouble, so reconnect refreshes the page
 *  10  sign-out never waits unbounded on a wedged IndexedDB
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readThrough,
  offlineCacheOwner,
  MemoryEntryStore,
  clearOfflineReadCacheWithin,
  _setOfflineEntryStoreForTesting,
  type OfflineEntryStore,
} from '@/lib/offline-read-cache';
import {
  isSupabaseUnreachable,
  recordNetworkFailure,
  recordNetworkSuccess,
  subscribeNetworkOutcome,
  _resetNetworkOutcomeForTesting,
} from '@/lib/network-outcome';
import { holdRoomCode, _resetHeldRoomCodesForTesting } from '@/lib/room-capability';
import { SessionBar } from '@/app/components/session/session-bar';

const supabaseMock = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: supabaseMock.signOut } } }));

const roomCapture = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => roomCapture.value }));
const connectivity = vi.hoisted(() => ({ offline: false }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: connectivity.offline, reconnectTick: 0 }),
}));

import { signOut } from '@/app/data/api';
import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';

let store: MemoryEntryStore;

beforeEach(() => {
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetNetworkOutcomeForTesting();
  _resetHeldRoomCodesForTesting();
  localStorage.clear();
  supabaseMock.signOut.mockReset().mockResolvedValue({ error: null });
  connectivity.offline = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const seed = async (type: 'story' | 'point', id: string, data: unknown) => {
  await readThrough(type, id, async () => data);
  await vi.waitFor(async () => expect((await store.listType(type)).length).toBeGreaterThan(0));
};

describe('defect 1: a read decides from its own outcome', () => {
  it("this read's request failed, a sibling succeeded after it: the cached copy, not 'not found', and the copy is kept", async () => {
    await seed('point', 'p1', { statement: 'seen' });
    const r = await readThrough('point', 'p1', async () => {
      recordNetworkFailure(); // the point row request never reached the server (service returned null)
      recordNetworkSuccess(); // a sibling request (positions) did — the app-wide last outcome is "success"
      return null;
    });
    expect(r.source).toBe('cache');
    expect(r.source === 'cache' && r.data).toEqual({ statement: 'seen' });
    await new Promise((res) => setTimeout(res, 10));
    expect((await store.listType('point')).length).toBe(1);
  });

  it('same, with nothing cached: needs-connection (offline), never "not found"', async () => {
    const r = await readThrough('point', 'never', async () => {
      recordNetworkFailure();
      recordNetworkSuccess();
      return null;
    });
    expect(r).toEqual({ source: 'offline' });
  });

  it('control: a request that failed BEFORE this read began does not make its not-found non-authoritative', async () => {
    await seed('point', 'p1', { statement: 'seen' });
    recordNetworkFailure();
    recordNetworkSuccess();
    expect(await readThrough('point', 'p1', async () => null)).toEqual({ source: 'network', data: null });
    await vi.waitFor(async () => expect((await store.listType('point')).length).toBe(0));
  });

  it('a read whose request failed never writes its (possibly partial) result over the cached copy', async () => {
    await seed('point', 'p1', { holders: ['a', 'b'] });
    const r = await readThrough('point', 'p1', async () => {
      recordNetworkFailure(); // positions failed
      recordNetworkSuccess(); // everything else reached the server
      return { holders: [] };
    });
    expect(r).toEqual({ source: 'network', data: { holders: [] } });
    await new Promise((res) => setTimeout(res, 10));
    const again = await readThrough('point', 'p1', async () => {
      recordNetworkFailure();
      return null;
    });
    expect(again.source === 'cache' && again.data).toEqual({ holders: ['a', 'b'] });
  });
});

describe('defect 2: an uncached read on a silently hanging network', () => {
  it('resolves to offline after the uncached deadline, with no failure recorded', async () => {
    const r = await readThrough('story', 'never', () => new Promise(() => {}), { deadlineMs: 10, uncachedDeadlineMs: 40 });
    expect(r).toEqual({ source: 'offline' });
  });
});

describe('defect 9: a deadline-served answer is network trouble', () => {
  it('after a cache served by the deadline, the app counts as unreachable until the next success (which is the reconnect)', async () => {
    await seed('story', 's1', { v: 1 });
    expect(isSupabaseUnreachable()).toBe(false);
    const r = await readThrough('story', 's1', () => new Promise(() => {}), { deadlineMs: 10 });
    expect(r.source).toBe('cache');
    expect(isSupabaseUnreachable()).toBe(true);
    recordNetworkSuccess();
    expect(isSupabaseUnreachable()).toBe(false);
  });

  it('after an uncached deadline (needs-connection), the same', async () => {
    const r = await readThrough('story', 'never', () => new Promise(() => {}), { deadlineMs: 10, uncachedDeadlineMs: 20 });
    expect(r).toEqual({ source: 'offline' });
    expect(isSupabaseUnreachable()).toBe(true);
  });
});

describe('defect 3: room-code partitions', () => {
  it('A9GZ2X and 29ONUL (an FNV-1a 32-bit collision) get distinct partitions, and no raw code is in the key', async () => {
    holdRoomCode('A9GZ2X');
    const a = await offlineCacheOwner();
    _resetHeldRoomCodesForTesting();
    holdRoomCode('29ONUL');
    const b = await offlineCacheOwner();
    expect(a).not.toBe(b);
    expect(a).not.toContain('A9GZ2X');
    expect(b).not.toContain('29ONUL');
  });

  it('a copy cached under one code is not readable under the colliding code', async () => {
    holdRoomCode('A9GZ2X');
    await seed('story', 's1', { roomOnly: 'A' });
    _resetHeldRoomCodesForTesting();
    holdRoomCode('29ONUL');
    expect(await readThrough('story', 's1', async () => { recordNetworkFailure(); return null; })).toEqual({ source: 'offline' });
  });
});

describe('defect 4: outcomes within one millisecond', () => {
  it('a failure recorded in the same millisecond as a success is not lost', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    recordNetworkSuccess();
    recordNetworkFailure();
    expect(isSupabaseUnreachable()).toBe(true);
  });

  it('a success in the same millisecond as a failure is the reconnect, and listeners hear it', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const heard = vi.fn();
    subscribeNetworkOutcome(heard);
    recordNetworkFailure();
    heard.mockClear();
    recordNetworkSuccess();
    expect(isSupabaseUnreachable()).toBe(false);
    expect(heard).toHaveBeenCalled();
  });
});

describe('defect 5: the offline bar is a state of the shared SessionBar', () => {
  const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8');

  it('session-bar.tsx exports ONE bar component', () => {
    const src = read('src/app/components/session/session-bar.tsx');
    expect(src).not.toMatch(/SessionBarOffline/);
    expect(src.match(/export function \w+/g)).toEqual(['export function SessionBar']);
  });

  it('both wrappers render SessionBar for their offline state too', () => {
    for (const f of ['src/app/components/session/live-session-bar.tsx', 'src/app/components/session/room-capture-bar.tsx']) {
      expect(read(f)).not.toMatch(/SessionBarOffline/);
      expect(read(f)).toMatch(/tone="offline"|tone: 'offline'|tone=\{'offline'\}/);
    }
  });

  it('offline tone: grey, title + one line, no buttons when no actions are given', () => {
    render(<SessionBar tone="offline" ariaLabel="Active session" text="Session paused while offline" detail="Rejoin comes back when you reconnect." />);
    const bar = screen.getByRole('status', { name: 'Active session' });
    expect(bar.className).toContain('bg-slate-100');
    expect(bar.className).toContain('border-slate-200');
    expect(bar.getAttribute('data-testid')).toBe('session-bar-offline');
    expect(screen.getByText('Session paused while offline').className).toContain('text-slate-800');
    expect(screen.getByText('Rejoin comes back when you reconnect.').className).toContain('text-xs');
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('online tone is unchanged: blue with its two actions', () => {
    render(
      <SessionBar
        ariaLabel="Active session"
        text="In session"
        primary={{ label: 'Rejoin Session', onClick: () => {} }}
        secondary={{ label: 'End Session', onClick: () => {} }}
      />,
    );
    expect(screen.getByRole('status', { name: 'Active session' }).className).toContain('bg-blue-50');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Rejoin Session', 'End Session']);
  });
});

describe('defect 6: offline transcription bar keeps a local "Stop microphone"', () => {
  it('offline: "● Transcribing, but offline", the may-not-be-saved line, and ONE button, Stop microphone, that ends this capture', () => {
    const endMyCapture = vi.fn().mockReturnValue(new Promise(() => {}));
    roomCapture.value = { phase: 'capturing', roomId: 'r1', open: vi.fn(), endMyCapture };
    connectivity.offline = true;
    render(<RoomCaptureBar />);
    expect(screen.getByText('● Transcribing, but offline')).toBeTruthy();
    expect(screen.getByText('Words said while offline may not be saved.')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Stop microphone']);
    fireEvent.click(buttons[0]);
    expect(endMyCapture).toHaveBeenCalledWith('r1');
    // The End RPC is still in flight (offline): the button says so instead of inviting a second tap.
    expect(screen.getByRole('button').textContent).toBe('Stopping…');
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('defect 10: sign-out and a wedged IndexedDB', () => {
  const wedged = (): OfflineEntryStore => ({
    get: () => new Promise(() => {}),
    put: () => new Promise(() => {}),
    delete: () => new Promise(() => {}),
    listType: () => new Promise(() => {}),
    clear: () => new Promise(() => {}),
  });

  it('signOut still signs out when clearing the cache never completes (bounded)', async () => {
    vi.useFakeTimers();
    _setOfflineEntryStoreForTesting(wedged());
    let done = false;
    const p = signOut({ scope: 'local' }).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(done).toBe(true);
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('when the clear can complete, it completes BEFORE the network sign-out', async () => {
    await seed('story', 's1', { v: 1 });
    supabaseMock.signOut.mockImplementation(async () => {
      expect(await store.listType('story')).toEqual([]);
      return { error: null };
    });
    await signOut();
    expect(supabaseMock.signOut).toHaveBeenCalledTimes(1);
  });

  it('clearOfflineReadCacheWithin reports whether the clear finished in time', async () => {
    expect(await clearOfflineReadCacheWithin(50)).toBe(true);
    _setOfflineEntryStoreForTesting(wedged());
    expect(await clearOfflineReadCacheWithin(20)).toBe(false);
  });
});
