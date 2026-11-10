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
  getEveningEnd: vi.fn(),
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  ...h,
}));

import { useMastermindHost, HOST_STATE_POLL_MS } from '@/app/prototypes/events/rounds/use-mastermind-host';
import { GAP_POLL_MS } from '@/app/prototypes/events/rounds/mastermind-round-helpers';

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
  h.getEveningEnd.mockReset().mockResolvedValue(null);
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

  it('the projector\'s reads in the gap after round 2 (the step not started, the evening not ended): none while hidden, one when shown', async () => {
    h.getCanvasUpdateStep.mockResolvedValue(null);
    mount(true);
    await tick(100);
    const step0 = h.getCanvasUpdateStep.mock.calls.length;
    const evening0 = h.getEveningEnd.mock.calls.length;
    expect(step0).toBeGreaterThan(0);
    expect(evening0).toBeGreaterThan(0);
    setVisibility('hidden');
    await tick(60_000);
    expect(h.getCanvasUpdateStep, 'step while hidden').toHaveBeenCalledTimes(step0);
    expect(h.getEveningEnd, 'evening stamp while hidden').toHaveBeenCalledTimes(evening0);
    expect(h.getMastermindHostState).not.toHaveBeenCalled();
    setVisibility('visible');
    await tick(10);
    expect(h.getCanvasUpdateStep).toHaveBeenCalledTimes(step0 + 1);
    expect(h.getEveningEnd).toHaveBeenCalledTimes(evening0 + 1);
  });

  it('the gap is read every GAP_POLL_MS and no faster: 450 an hour per visible screen', async () => {
    h.getCanvasUpdateStep.mockResolvedValue(null);
    mount(true);
    await tick(100);
    const before = h.getEveningEnd.mock.calls.length;
    await tick(GAP_POLL_MS * 5 + 100);
    expect(h.getEveningEnd.mock.calls.length - before).toBe(5);
    expect(3600_000 / GAP_POLL_MS).toBe(450);
  });

  it('once the evening is over nothing polls: the stamp is read once, the step is not read again, on the host and on the projector', async () => {
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() + 1000).toISOString());
    for (const screen of [false, true]) {
      h.getEveningEnd.mockClear();
      h.getCanvasUpdateStep.mockClear();
      const view = mount(screen);
      await tick(100);
      expect(h.getEveningEnd, 'read once').toHaveBeenCalledTimes(1);
      const step0 = h.getCanvasUpdateStep.mock.calls.length;
      await tick(GAP_POLL_MS * 10);
      expect(h.getEveningEnd, `no stamp poll once over (screen ${screen})`).toHaveBeenCalledTimes(1);
      expect(h.getCanvasUpdateStep, `no step poll once over (screen ${screen})`).toHaveBeenCalledTimes(step0);
      view.unmount();
    }
  });

  it('a round that is running reads no stamp, and a stamp from before the newest round is not the end', async () => {
    const running = [round('r1', 1, true), { ...round('r2', 2, false), startedAt: new Date(5000).toISOString() }];
    const live = renderHook(() => useMastermindHost({ eventId: 'ev-1', active: true, screen: false, rounds: running, seatsByRound: SEATS, members: MEMBERS }));
    await tick(GAP_POLL_MS * 3);
    expect(h.getEveningEnd).not.toHaveBeenCalled();
    live.unmount();
    h.getEveningEnd.mockResolvedValue(new Date(1000).toISOString()); // the evening ended in round 1's time; round 2 reopened it
    const ended = [round('r1', 1, true), { ...round('r2', 2, true), startedAt: new Date(5000).toISOString() }];
    const view = renderHook(() => useMastermindHost({ eventId: 'ev-1', active: true, screen: false, rounds: ended, seatsByRound: SEATS, members: MEMBERS }));
    await tick(100);
    expect(view.result.current.eveningOver).toBe(false);
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

describe('the evening\'s stamp wins over the canvas-update step it came after', () => {
  it('a stamp at or after the step\'s start ends the step; a stamp from before it does not', async () => {
    const stepStart = new Date(Date.now() - 60_000).toISOString();
    h.getCanvasUpdateStep.mockResolvedValue({ afterRoundId: 'r2', startedAt: stepStart });
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() - 1000).toISOString());
    const after = mount(false);
    await tick(100);
    expect(after.result.current.eveningOver).toBe(true);
    expect(after.result.current.stepOn, 'the evening ended during the step').toBe(false);
    after.unmount();
    h.getEveningEnd.mockResolvedValue(new Date(10).toISOString());
    const before = mount(false);
    await tick(100);
    expect(before.result.current.stepOn, 'a stamp from before the step does not end it').toBe(true);
  });

  it('the host\'s End the evening reads the stamp and the rounds before it returns', async () => {
    const refreshRounds = vi.fn().mockResolvedValue(undefined);
    const endRounds = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/app/data/event-rounds-service', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()), hostEndRounds: endRounds }));
    vi.resetModules();
    const { useMastermindHost: fresh } = await import('@/app/prototypes/events/rounds/use-mastermind-host');
    const view = renderHook(() => fresh({ eventId: 'ev-1', active: true, screen: false, rounds: ROUNDS, seatsByRound: SEATS, members: MEMBERS, refreshRounds }));
    await tick(100);
    const reads = h.getEveningEnd.mock.calls.length;
    await act(async () => { await view.result.current.endEvening(); });
    expect(endRounds).toHaveBeenCalledWith('ev-1');
    expect(h.getEveningEnd.mock.calls.length).toBeGreaterThan(reads);
    expect(refreshRounds).toHaveBeenCalledTimes(1);
    vi.doUnmock('@/app/data/event-rounds-service');
  });

  it('the host\'s End round waits for the rounds to be read', async () => {
    const refreshRounds = vi.fn().mockResolvedValue(undefined);
    const endRound = vi.fn().mockResolvedValue(true);
    vi.doMock('@/app/data/event-rounds-service', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()), hostEndRound: endRound }));
    vi.resetModules();
    const { useMastermindHost: fresh } = await import('@/app/prototypes/events/rounds/use-mastermind-host');
    const view = renderHook(() => fresh({ eventId: 'ev-1', active: true, screen: false, rounds: ROUNDS, seatsByRound: SEATS, members: MEMBERS, refreshRounds }));
    await act(async () => { await view.result.current.endRound(); });
    expect(endRound).toHaveBeenCalledWith('ev-1');
    expect(refreshRounds).toHaveBeenCalledTimes(1);
    vi.doUnmock('@/app/data/event-rounds-service');
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
