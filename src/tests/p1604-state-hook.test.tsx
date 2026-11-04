/**
 * P1604 review 3: the transcript view's state follows the room it shows and the state it is given. A reused view (another session
 * opened, or the list's fresh state arriving) must not keep the state of the room before it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const states = vi.hoisted(() => ({ next: new Map<string, string>() }));
vi.mock('@/app/data/room-transcription-state', () => ({
  getMyRoomStates: vi.fn(async (ids: string[]) => new Map(ids.filter((i) => states.next.has(i)).map((i) => [i, { state: states.next.get(i), chatName: null }]))),
}));

import { useRoomTranscriptionState, STATE_POLL_MS } from '@/app/pages/use-room-transcription-state';

describe('useRoomTranscriptionState follows its inputs', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); states.next.clear(); });
  afterEach(() => vi.useRealTimers());

  it('a different room starts from ITS initial state, not the previous room\'s', () => {
    const { result, rerender } = renderHook(({ room, initial }) => useRoomTranscriptionState(room, initial, () => undefined),
      { initialProps: { room: 'r1', initial: 'processing' as const } });
    expect(result.current).toBe('processing');
    rerender({ room: 'r2', initial: 'failed' as never });
    expect(result.current).toBe('failed');
  });

  it('a new initial state for the same room wins (the list learned the text is ready)', () => {
    const { result, rerender } = renderHook(({ initial }) => useRoomTranscriptionState('r1', initial, () => undefined),
      { initialProps: { initial: 'processing' as const } });
    rerender({ initial: 'ready' as never });
    expect(result.current).toBe('ready');
  });

  it('polls only while processing, follows the poll, and tells the view once when the text is ready', async () => {
    const ready = vi.fn();
    const { result } = renderHook(() => useRoomTranscriptionState('r1', 'processing', ready));
    states.next.set('r1', 'ready');
    await act(async () => { await vi.advanceTimersByTimeAsync(STATE_POLL_MS + 100); });
    expect(result.current).toBe('ready');
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('after a poll result, switching to another room does not carry that result over', async () => {
    const { result, rerender } = renderHook(({ room }) => useRoomTranscriptionState(room, 'processing', () => undefined),
      { initialProps: { room: 'r1' } });
    states.next.set('r1', 'ready');
    await act(async () => { await vi.advanceTimersByTimeAsync(STATE_POLL_MS + 100); });
    expect(result.current).toBe('ready');
    rerender({ room: 'r2' });
    expect(result.current, 'r2 starts from its own initial state').toBe('processing');
  });
});
