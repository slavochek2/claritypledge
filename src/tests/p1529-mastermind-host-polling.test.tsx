/**
 * P1529 (metered-services rule 3): the host screen's and the projector's repeating reads make no request while the tab is
 * hidden, and read at once when it is visible again. A failed read of the previous session is disclosed and retried.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRound, RoundSeat } from '@/app/data/event-rounds-service';
import type { EventRoomMember } from '@/app/types';

const h = vi.hoisted(() => ({
  getMastermindHostState: vi.fn(),
  getPreviousSessionPartners: vi.fn(),
  getCanvasUpdateStep: vi.fn(),
  getMastermindUpdateStates: vi.fn(),
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  ...h,
}));

import { useMastermindHost, HOST_STATE_POLL_MS } from '@/app/prototypes/events/rounds/use-mastermind-host';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

const round = (id: string, no: number, ended: boolean): EventRound => ({
  id, roundNo: no, groupSize: 4, startedAt: new Date(0).toISOString(), endedAt: ended ? new Date(1).toISOString() : null,
  seatingS: 120, firstS: 450, secondS: 450, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false,
});
// Round 2 has ended and the host's canvas-update step is on: every repeating read is live.
const ROUNDS = [round('r1', 1, true), round('r2', 2, true)];
const SEATS = new Map<string, RoundSeat[]>();
const MEMBERS: EventRoomMember[] = [];

const mount = (screen: boolean) =>
  renderHook(() => useMastermindHost({ eventId: 'ev-1', active: true, screen, rounds: ROUNDS, seatsByRound: SEATS, members: MEMBERS }));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
  h.getMastermindHostState.mockReset().mockResolvedValue(new Map());
  h.getPreviousSessionPartners.mockReset().mockResolvedValue([]);
  h.getCanvasUpdateStep.mockReset().mockResolvedValue({ afterRoundId: 'r2', startedAt: new Date().toISOString() });
  h.getMastermindUpdateStates.mockReset().mockResolvedValue(new Map());
});
afterEach(() => { setVisibility('visible'); vi.useRealTimers(); });

describe('hidden tab: no requests, and one read when it returns', () => {
  it('the host state, the owners\' update states', async () => {
    mount(false);
    await tick(100);
    const state0 = h.getMastermindHostState.mock.calls.length;
    const owners0 = h.getMastermindUpdateStates.mock.calls.length;
    expect(state0).toBeGreaterThan(0);
    expect(owners0).toBeGreaterThan(0);
    setVisibility('hidden');
    await tick(HOST_STATE_POLL_MS * 4);
    expect(h.getMastermindHostState, 'host state while hidden').toHaveBeenCalledTimes(state0);
    expect(h.getMastermindUpdateStates, 'owner states while hidden').toHaveBeenCalledTimes(owners0);
    setVisibility('visible');
    await tick(10);
    expect(h.getMastermindHostState).toHaveBeenCalledTimes(state0 + 1);
    expect(h.getMastermindUpdateStates).toHaveBeenCalledTimes(owners0 + 1);
  });

  it('the projector\'s step read', async () => {
    mount(true);
    await tick(100);
    const step0 = h.getCanvasUpdateStep.mock.calls.length;
    expect(step0).toBeGreaterThan(0);
    setVisibility('hidden');
    await tick(60_000);
    expect(h.getCanvasUpdateStep, 'step while hidden').toHaveBeenCalledTimes(step0);
    expect(h.getMastermindHostState).not.toHaveBeenCalled();
    setVisibility('visible');
    await tick(10);
    expect(h.getCanvasUpdateStep).toHaveBeenCalledTimes(step0 + 1);
  });

  it('a screen opened in a background tab reads nothing until it is shown', async () => {
    setVisibility('hidden');
    mount(false);
    await tick(HOST_STATE_POLL_MS * 2);
    expect(h.getMastermindHostState).not.toHaveBeenCalled();
    expect(h.getPreviousSessionPartners).not.toHaveBeenCalled();
    expect(h.getMastermindUpdateStates).not.toHaveBeenCalled();
    setVisibility('visible');
    await tick(10);
    expect(h.getMastermindHostState).toHaveBeenCalled();
  });
});

describe('the previous session (§4)', () => {
  it('a failed read is disclosed, plans without that rule, and is retried until it answers', async () => {
    h.getPreviousSessionPartners.mockRejectedValueOnce(new Error('offline'));
    const { result } = mount(false);
    await tick(100);
    expect(result.current.previousFailed).toBe(true);
    expect(result.current.ready).toBe(true);
    await tick(HOST_STATE_POLL_MS + 100);
    expect(h.getPreviousSessionPartners).toHaveBeenCalledTimes(2);
    expect(result.current.previousFailed).toBe(false);
    await tick(HOST_STATE_POLL_MS * 3);
    expect(h.getPreviousSessionPartners, 'stops once it has answered').toHaveBeenCalledTimes(2);
  });
});
