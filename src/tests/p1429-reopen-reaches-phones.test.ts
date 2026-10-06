/**
 * P1429 A3: past the clock's close (event start + 12h grace) a phone on Close stopped reading the
 * rounds, so the host's Reopen never reached it. It now keeps reading once a minute while the tab
 * is visible, for up to 6 hours after the last round ended.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EMPTY_ROUNDS_STATE, ROUNDS_POLL_MS, type EventRound, type EventRoundsState } from '@/app/data/event-rounds-service';

const getEventRoundsState = vi.fn<(id: string) => Promise<EventRoundsState>>();
vi.mock('@/app/data/event-rounds-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-rounds-service')>()),
  getEventRoundsState: (id: string) => getEventRoundsState(id),
}));

import { roundsPolling, useEventRounds, REOPEN_POLL_MS, REOPEN_WATCH_MS } from '@/app/prototypes/events/rounds/use-event-rounds';

const HOUR = 60 * 60 * 1000;
const round = (no: number, endedAt: string | null): EventRound =>
  ({ id: `r${no}`, roundNo: no, groupSize: 3, startedAt: new Date(0).toISOString(), endedAt } as unknown as EventRound);
const state = (rounds: EventRound[]): EventRoundsState => ({ ...EMPTY_ROUNDS_STATE, rounds });

describe('roundsPolling', () => {
  const now = Date.UTC(2026, 9, 7, 9, 0);
  const endedAgo = (ms: number) => state([round(1, new Date(now - ms).toISOString())]);

  it('before the close, polls fast as before', () => {
    expect(roundsPolling({ ended: false, liveSeen: false, state: EMPTY_ROUNDS_STATE, now })).toEqual({ active: true, intervalMs: ROUNDS_POLL_MS, visibleOnly: false });
  });
  it('a round on past the close keeps polling fast', () => {
    expect(roundsPolling({ ended: true, liveSeen: true, state: state([round(1, null)]), now })).toEqual({ active: true, intervalMs: ROUNDS_POLL_MS, visibleOnly: false });
  });
  it('past the close, within 6h of the last round ending, watches for a Reopen once a minute while visible', () => {
    expect(roundsPolling({ ended: true, liveSeen: false, state: endedAgo(5 * HOUR), now })).toEqual({ active: true, intervalMs: 60_000, visibleOnly: true });
  });
  it('stops after 6h, and when there never was a round', () => {
    expect(roundsPolling({ ended: true, liveSeen: false, state: endedAgo(REOPEN_WATCH_MS + 1000), now }).active).toBe(false);
    expect(roundsPolling({ ended: true, liveSeen: false, state: EMPTY_ROUNDS_STATE, now }).active).toBe(false);
  });
});

describe('useEventRounds slow watch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getEventRoundsState.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('sees a Reopen within a minute, and skips reads while the tab is hidden', async () => {
    getEventRoundsState.mockResolvedValue(state([round(1, new Date().toISOString())]));
    const { result } = renderHook(() => useEventRounds('ev', true, true, { intervalMs: REOPEN_POLL_MS, visibleOnly: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(getEventRoundsState).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(REOPEN_POLL_MS); });
    expect(getEventRoundsState).toHaveBeenCalledTimes(1);

    // The host reopens; the tab comes back into view and reads at once.
    getEventRoundsState.mockResolvedValue(state([round(1, new Date().toISOString()), round(2, null)]));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.state.rounds.at(-1)?.endedAt).toBeNull();

    // And a visible tab picks it up on the minute.
    getEventRoundsState.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(REOPEN_POLL_MS); });
    expect(getEventRoundsState).toHaveBeenCalledTimes(1);
  });
});
