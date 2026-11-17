// @vitest-environment jsdom
/**
 * @file p1675-room-counts-visibility.test.ts
 * @description P1675 Cost Budget, metered-services rule 3: useEventRoomCounts makes no request while the tab is hidden, reads
 * once when it becomes visible, then every 30 s while visible, and stops on unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/event-room-counts', () => ({ getEventRoomCounts: read }));

import { useEventRoomCounts } from '@/app/prototypes/events/components/use-event-room-counts';

let state: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  state = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  read.mockReset().mockResolvedValue({ notHere: 2 });
  state = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
});
afterEach(() => vi.useRealTimers());

describe('useEventRoomCounts polling', () => {
  it('a hidden tab makes no request until it is shown', async () => {
    state = 'hidden';
    renderHook(() => useEventRoomCounts('event-1', true));
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(read).not.toHaveBeenCalled();
    await act(async () => { setVisibility('visible'); });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a visible tab reads at once and every 30 s, and nothing after unmount or while hidden', async () => {
    const { unmount } = renderHook(() => useEventRoomCounts('event-1', true));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { setVisibility('hidden'); vi.advanceTimersByTime(90_000); });
    expect(read).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { setVisibility('visible'); vi.advanceTimersByTime(90_000); });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('not enabled (not a hike, or not the host) reads nothing', async () => {
    renderHook(() => useEventRoomCounts('event-1', false));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(read).not.toHaveBeenCalled();
  });
});
