// @vitest-environment jsdom
/**
 * P1562 (the :222 race; round 7 design): the room's first roster read can run before the viewer's own join has written
 * their row. Once the viewer's row is known and the subscription's first successful snapshot lacks them, the hook asks
 * the subscription for ONE more read through its own loop (`refresh()`), so the read is ordered after every other one
 * and hidden-tab aware (both covered at the service level in p1562-roster-hidden-tab.test.ts).
 *  - only after a SUCCESSFUL first answer of THIS event, and only when the snapshot lacks the viewer;
 *  - at most one refresh per event and viewer;
 *  - another event starts from an empty roster.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EventRoomMember } from '@/app/types';

const svc = vi.hoisted(() => ({
  onUpdate: null as null | ((r: unknown[]) => void),
  onFailed: null as null | (() => void),
  refresh: vi.fn(),
  subscribed: [] as string[],
}));
vi.mock('@/app/data/event-room-service', () => ({
  // The service's contract (P1586 onStatus): `pending` at once; a successful read says `ready`, then hands over its
  // rows; a failed first read reports [] then `failed`. `svc.onUpdate` / `svc.onFailed` play those two answers.
  subscribeToRoomRoster: (id: string, onUpdate: (r: unknown[]) => void, onStatus?: (s: 'pending' | 'ready' | 'failed') => void) => {
    svc.subscribed.push(id);
    onStatus?.('pending');
    svc.onUpdate = (r) => { onStatus?.('ready'); onUpdate(r); };
    svc.onFailed = () => { onUpdate([]); onStatus?.('failed'); };
    return Object.assign(() => {}, { refresh: () => svc.refresh(id) });
  },
}));

import { useRoomRoster } from '@/app/prototypes/events/components/use-room-roster';

const member = (id: string, name: string) => ({ id, eventId: 'ev-1', displayName: name, optedIn: null } as EventRoomMember);
const other = member('m-other', 'Ben');
const me = member('m-me', 'Ana');

beforeEach(() => {
  svc.onUpdate = null;
  svc.onFailed = null;
  svc.refresh.mockReset();
  svc.subscribed = [];
});

type Props = { eventId: string; self: { id: string } | null };
// The third argument is the viewer's own room row (EventRoomMeet passes `self`).
const mount = (initial: Props) =>
  renderHook(({ eventId, self }: Props) => useRoomRoster(eventId, () => {}, self), { initialProps: initial });

describe("the refresh once the viewer's join has landed", () => {
  it('the first snapshot ran before the join: one refresh of this event, then the viewer arrives through the loop', () => {
    const { result, rerender } = mount({ eventId: 'ev-1', self: null });
    act(() => svc.onUpdate!([other])); // the pre-join snapshot
    rerender({ eventId: 'ev-1', self: { id: 'm-me' } }); // the join landed
    expect(svc.refresh).toHaveBeenCalledTimes(1);
    expect(svc.refresh).toHaveBeenCalledWith('ev-1');
    act(() => svc.onUpdate!([other, me])); // the loop's (last) read
    expect(result.current.roster.map((m) => m.id)).toEqual(['m-other', 'm-me']);
  });

  it('no refresh when the snapshot already shows the viewer', () => {
    const { rerender } = mount({ eventId: 'ev-1', self: null });
    act(() => svc.onUpdate!([other, me]));
    rerender({ eventId: 'ev-1', self: { id: 'm-me' } });
    expect(svc.refresh).not.toHaveBeenCalled();
  });

  it("waits for the subscription's first answer", () => {
    mount({ eventId: 'ev-1', self: { id: 'm-me' } });
    expect(svc.refresh).not.toHaveBeenCalled();
    act(() => svc.onUpdate!([other]));
    expect(svc.refresh).toHaveBeenCalledTimes(1);
  });

  it('after a FAILED first read there is no refresh — the poll retries; only a successful snapshot opens it', () => {
    const { rerender } = mount({ eventId: 'ev-1', self: null });
    act(() => svc.onFailed!());
    rerender({ eventId: 'ev-1', self: { id: 'm-me' } });
    expect(svc.refresh).not.toHaveBeenCalled();
  });

  it('at most one refresh per event and viewer, marked when asked (the loop guarantees it runs)', () => {
    const { rerender } = mount({ eventId: 'ev-1', self: null });
    act(() => svc.onUpdate!([other]));
    rerender({ eventId: 'ev-1', self: { id: 'm-me' } });
    act(() => svc.onUpdate!([other])); // still lacking the viewer
    rerender({ eventId: 'ev-1', self: null });
    rerender({ eventId: 'ev-1', self: { id: 'm-me' } });
    expect(svc.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('the refresh is keyed to the event', () => {
  it("an event switch never refreshes the new event off the old event's success (Codex repro)", () => {
    const { rerender } = mount({ eventId: 'ev-1', self: { id: 'm-me' } });
    act(() => svc.onUpdate!([other, me])); // ev-1 answered with the viewer in it
    rerender({ eventId: 'ev-2', self: { id: 'm-me' } }); // ev-2 has not answered yet
    expect(svc.refresh).not.toHaveBeenCalled();
    act(() => svc.onUpdate!([other])); // ev-2's first answer, without the viewer
    expect(svc.refresh).toHaveBeenCalledTimes(1);
    expect(svc.refresh).toHaveBeenCalledWith('ev-2');
  });

  it("another event starts from an empty roster — the previous event's people are gone at once", () => {
    const { result, rerender } = mount({ eventId: 'ev-1', self: null });
    act(() => svc.onUpdate!([other, me]));
    expect(result.current.roster).toHaveLength(2);
    rerender({ eventId: 'ev-2', self: null });
    expect(result.current.roster).toEqual([]);
    expect(result.current.status).toBe('pending');
  });
});

describe('round 8 (F1): the self-status follow-up waits for a visible tab', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }
  const show = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };

  it('a snapshot that lands while hidden is applied, but onRoster runs only once the tab is shown — once for several', () => {
    const onRoster = vi.fn();
    try {
      const { result } = renderHook(() => useRoomRoster('ev-1', onRoster, null));
      setVisibility('hidden');
      act(() => svc.onUpdate!([other]));
      act(() => svc.onUpdate!([other, me]));
      expect(result.current.roster.map((m) => m.id)).toEqual(['m-other', 'm-me']);
      expect(onRoster).not.toHaveBeenCalled();
      act(() => show());
      expect(onRoster).toHaveBeenCalledTimes(1);
      act(() => svc.onUpdate!([other])); // visible: at once
      expect(onRoster).toHaveBeenCalledTimes(2);
    } finally {
      setVisibility('visible');
    }
  });

  it('an unmount while the follow-up waits cancels it', () => {
    const onRoster = vi.fn();
    try {
      const { unmount } = renderHook(() => useRoomRoster('ev-1', onRoster, null));
      setVisibility('hidden');
      act(() => svc.onUpdate!([other]));
      unmount();
      show();
      expect(onRoster).not.toHaveBeenCalled();
    } finally {
      setVisibility('visible');
    }
  });
});

