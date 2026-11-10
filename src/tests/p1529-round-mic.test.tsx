/**
 * P1529 (founder 2026-11-10): mic first, one thing at a time, on the mastermind's round card. A seated person whose mic is not
 * capturing sees only the table, what it discusses, "Start your mic" and "Continue without mic". The room capture context is a fake
 * the test sets; what is under test is what the card shows and which call each tap makes.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRound, EventRoundsState, RoundSeat } from '@/app/data/event-rounds-service';

const h = vi.hoisted(() => ({
  state: null as unknown,
  capture: {} as Record<string, unknown>,
  startCapture: vi.fn(),
  reconnectMic: vi.fn(),
}));

vi.mock('@/app/prototypes/events/rounds/use-event-rounds', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/prototypes/events/rounds/use-event-rounds')>();
  return { ...real, useEventRounds: () => ({ state: h.state, loaded: true, refresh: async () => {} }) };
});
vi.mock('@/app/data/event-mastermind-service', () => ({
  recordCanvasOpen: vi.fn(),
  makeMyNextVersion: vi.fn(),
  getMyRoundCanvas: vi.fn().mockResolvedValue({ ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: 'launch_plan', shared: true }),
  getMyNextVersionOffer: vi.fn().mockResolvedValue({ state: 'none', roundId: null }),
  getMyUpdateState: vi.fn().mockResolvedValue({ state: 'not_tapped', draftId: null, revision: null, runId: null }),
  getCanvasUpdateStep: vi.fn().mockResolvedValue(null),
  getMyDraftRef: vi.fn().mockResolvedValue(null),
  getMyEventCanvas: vi.fn().mockResolvedValue(null),
  getEveningEnd: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listSharedWithEvent: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/app/data/canvas-draft-service', () => ({ publishCanvasDraft: vi.fn(), retryCanvasRun: vi.fn(), getCanvasDraftState: vi.fn() }));
vi.mock('@/app/prototypes/events/prep/EventCanvasCard', () => ({ EventCanvasCard: () => <div /> }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => h.capture }));

import { MastermindRoundCard } from '@/app/prototypes/events/rounds/MastermindRoundCard';
import { RESTORE_WAIT_MS } from '@/app/prototypes/events/rounds/use-round-mic';
import { resetTaskOpen } from '@/app/prototypes/events/rounds/task-open-store';

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 3, startedAt: new Date().toISOString(), endedAt: null,
  seatingS: 60, firstS: 360, secondS: 360, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
});
const seat = (roundId: string, id: string, role: RoundSeat['role']): RoundSeat => ({ roundId, id, table: 1, role, confirmedAt: null });
const person = (id: string, displayName: string, profileId: string) => ({ id, displayName, profileId, profileSlug: id } as unknown as EventRoomMember);
const OWNER = person('m-owner', 'Haru Tanaka', 'p-owner');
const PARTNER = person('m-partner', 'Erin Wu', 'p-partner');
const ROSTER = [OWNER, PARTNER];
const live = (roundId = 'r1') => {
  h.state = {
    rounds: [round({ id: roundId, roundNo: roundId === 'r1' ? 1 : 2 })],
    seatsByRound: new Map([[roundId, [seat(roundId, 'm-owner', 'first'), seat(roundId, 'm-partner', 'second')]]]),
    topics: new Map(),
  } satisfies EventRoundsState;
};

type Capture = { phase: string; on: boolean; micLost?: boolean; tapDown?: boolean; stopping?: boolean };
const setCapture = ({ phase, on, micLost = false, tapDown = false, stopping = false }: Capture) => {
  h.capture = { phase, isCapturingForEvent: (id: string) => on && id === 'e1', micLost, tapDown, stopping, startCapture: h.startCapture, reconnectMic: h.reconnectMic };
};
const element = (self: EventRoomMember) => (
  <MemoryRouter><MastermindRoundCard eventId="e1" self={self} roster={ROSTER} view="table" /></MemoryRouter>
);
const renderCard = (self: EventRoomMember = PARTNER) => render(element(self));

beforeEach(() => {
  resetTaskOpen();
  vi.clearAllMocks();
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* none */ }
  h.startCapture.mockResolvedValue({ started: true });
  h.reconnectMic.mockResolvedValue(undefined);
  setCapture({ phase: 'idle', on: false });
  live();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the mic step', () => {
  it('shows only the table, the discussing line, "Start your mic" and "Continue without mic"', async () => {
    renderCard();
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-headline').textContent).toBe('Discussing Haru T.’s Clarity Canvas');
    expect(screen.getByTestId('round-mic-start').textContent).toBe('Start your mic');
    expect(screen.getByTestId('round-mic-without').textContent).toBe('Continue without mic');
    expect(screen.queryByTestId('round-card-people')).toBeNull();
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
    expect(screen.getByTestId('mastermind-mic-step')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-round-card'), 'the mic step is not the round card').toBeNull();
  });

  it('is the owner\'s too, and observers\' (everyone wears a mic)', async () => {
    renderCard(OWNER);
    expect((await screen.findByTestId('round-card-headline')).textContent).toBe('Discussing your Clarity Canvas');
    expect(screen.getByTestId('round-mic-start')).toBeTruthy();
  });

  it('"Start your mic" is the room\'s own start, called once, with the event and the person\'s name', async () => {
    let finish: (v: { started: boolean }) => void = () => {};
    h.startCapture.mockReturnValue(new Promise(r => { finish = r; }));
    renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    expect(h.startCapture).toHaveBeenCalledTimes(1);
    expect(h.startCapture).toHaveBeenCalledWith({ eventId: 'e1', displayName: 'Erin Wu' });
    // In flight: one thing, disabled, and no second start.
    await waitFor(() => expect((screen.getByTestId('round-mic-start') as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId('round-mic-start').textContent).toBe('Starting…');
    await act(async () => { finish({ started: true }); });
    expect(h.startCapture).toHaveBeenCalledTimes(1);
  });

  it('a start that did not open the mic says so and offers the start again', async () => {
    h.startCapture.mockResolvedValue({ started: false, reason: 'microphone' });
    renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    expect((await screen.findByTestId('round-mic-failed')).textContent).toMatch(/did not start/);
    expect((screen.getByTestId('round-mic-start') as HTMLButtonElement).disabled).toBe(false);
    h.startCapture.mockResolvedValue({ started: true });
    fireEvent.click(screen.getByTestId('round-mic-start'));
    await waitFor(() => expect(h.startCapture).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('round-mic-failed')).toBeNull());
  });

  it('once capturing, the normal card appears: people, the canvas link; capture that drops brings the step back', async () => {
    const view = renderCard();
    await screen.findByTestId('round-mic-start');
    setCapture({ phase: 'capturing', on: true });
    view.rerender(element(PARTNER));
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    expect(await screen.findByTestId('round-canvas-link')).toBeTruthy();
    expect(screen.queryByTestId('round-mic-start')).toBeNull();
    // The phone slept, the app restarted: capture is gone.
    setCapture({ phase: 'idle', on: false });
    view.rerender(element(PARTNER));
    expect(await screen.findByTestId('round-mic-start')).toBeTruthy();
    expect(screen.queryByTestId('round-card-people')).toBeNull();
  });

  it.each([
    ['paused (the bar has Resume)', { phase: 'paused', on: true }],
    ['stalled (still recording)', { phase: 'stalled', on: true }],
    ['observing (another tab of this browser holds the mic)', { phase: 'observing', on: true }],
  ])('%s counts as capturing: no mic step', async (_name, capture) => {
    setCapture(capture);
    renderCard();
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    expect(screen.queryByTestId('round-mic-start')).toBeNull();
  });

  it('a mic that is open but records nothing (lost, or the audio tap down) is the step, and its button reconnects instead of starting', async () => {
    setCapture({ phase: 'capturing', on: true, micLost: true });
    renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    expect(h.reconnectMic).toHaveBeenCalledTimes(1);
    expect(h.startCapture).not.toHaveBeenCalled();
  });

  it('a capture of ANOTHER event is not this one: the step shows, and a lost mic THERE does not make this button a reconnect', async () => {
    h.capture = { ...h.capture, isCapturingForEvent: (id: string) => id === 'other', micLost: true, tapDown: true };
    renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    expect(h.startCapture).toHaveBeenCalledWith({ eventId: 'e1', displayName: 'Erin Wu' });
    expect(h.reconnectMic).not.toHaveBeenCalled();
  });

  it('a reconnect that resolves but leaves the mic lost counts as failed and says so; one that works brings the card', async () => {
    setCapture({ phase: 'capturing', on: true, micLost: true });
    const view = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    expect(await screen.findByTestId('round-mic-failed')).toBeTruthy();
    expect((screen.getByTestId('round-mic-start') as HTMLButtonElement).disabled).toBe(false);
    // The mic comes back this time.
    h.reconnectMic.mockImplementation(async () => { setCapture({ phase: 'capturing', on: true }); });
    fireEvent.click(screen.getByTestId('round-mic-start'));
    await waitFor(() => expect(h.reconnectMic).toHaveBeenCalledTimes(2));
    view.rerender(element(PARTNER));
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
  });

  it('a failure from one round is not shown in the next', async () => {
    h.startCapture.mockResolvedValue({ started: false, reason: 'microphone' });
    const view = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-start'));
    await screen.findByTestId('round-mic-failed');
    live('r2');
    view.rerender(element(PARTNER));
    await waitFor(() => expect(screen.queryByTestId('round-mic-failed')).toBeNull());
    expect(screen.getByTestId('round-mic-start')).toBeTruthy();
  });

  it('a Stop in flight or a capture ending disables the button', async () => {
    setCapture({ phase: 'ending', on: false });
    renderCard();
    expect((await screen.findByTestId('round-mic-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is only for a seated person: someone waiting sees the waiting card', async () => {
    h.state = { rounds: [round()], seatsByRound: new Map([['r1', [seat('r1', 'm-owner', 'first')]]]), topics: new Map() } satisfies EventRoundsState;
    renderCard(PARTNER);
    expect(await screen.findByTestId('mastermind-waiting')).toBeTruthy();
    expect(screen.queryByTestId('round-mic-start')).toBeNull();
  });
});

describe('Continue without mic', () => {
  it('shows the normal card and is remembered for that round only (sessionStorage), across a reload', async () => {
    const first = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-without'));
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    expect(h.startCapture).not.toHaveBeenCalled();
    first.unmount();
    // A reload in the same round: still the normal card.
    renderCard();
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    expect(screen.queryByTestId('round-mic-start')).toBeNull();
  });

  it('the next round asks again', async () => {
    const first = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-without'));
    await screen.findAllByTestId('round-card-person');
    first.unmount();
    live('r2');
    renderCard();
    expect(await screen.findByTestId('round-mic-start')).toBeTruthy();
  });

  it('capture that was on and drops does not bring the step back for a round the person continued without', async () => {
    const view = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-without'));
    setCapture({ phase: 'capturing', on: true });
    view.rerender(element(PARTNER));
    setCapture({ phase: 'idle', on: false });
    view.rerender(element(PARTNER));
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    expect(screen.queryByTestId('round-mic-start')).toBeNull();
  });

  it('a blocked sessionStorage never breaks it: it works now and is simply not remembered', async () => {
    const blocked = () => { throw new Error('blocked'); };
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked });
    const first = renderCard();
    fireEvent.click(await screen.findByTestId('round-mic-without'));
    expect(await screen.findAllByTestId('round-card-person')).toHaveLength(2);
    first.unmount();
    renderCard();
    expect(await screen.findByTestId('round-mic-start')).toBeTruthy();
  });
});

describe('after a reload the step waits for the stored capture to re-attach', () => {
  const stored = { userId: 'u1', roomId: 'room1', roomCode: 'ABC', memberId: 'tm1', eventId: 'e1', joinedAt: '', displayName: 'Erin Wu' };

  it('holds back while a capture stored for THIS event may still re-attach, and shows the step once the wait is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('cp_room_capture', JSON.stringify(stored));
    renderCard();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByTestId('round-mic-start'), 'no flash of "Start your mic" while restoring').toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(RESTORE_WAIT_MS + 100); });
    expect(await screen.findByTestId('round-mic-start')).toBeTruthy();
  });

  it('a capture that is starting while this event\'s stored capture re-attaches does not show the step either', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setCapture({ phase: 'starting', on: false });
    localStorage.setItem('cp_room_capture', JSON.stringify(stored));
    renderCard();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByTestId('mastermind-mic-step')).toBeNull();
  });

  it('the wait starts again when the event changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('cp_room_capture', JSON.stringify({ ...stored, eventId: 'e2' }));
    const view = render(<MemoryRouter><MastermindRoundCard eventId="e1" self={PARTNER} roster={ROSTER} view="table" /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(RESTORE_WAIT_MS + 100); });
    h.capture = { ...h.capture, isCapturingForEvent: (id: string) => id === 'x' };
    view.rerender(<MemoryRouter><MastermindRoundCard eventId="e2" self={PARTNER} roster={ROSTER} view="table" /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByTestId('mastermind-mic-step'), 'e2\'s stored capture is given its own wait').toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(RESTORE_WAIT_MS + 100); });
    expect(await screen.findByTestId('mastermind-mic-step')).toBeTruthy();
  });

  it('a capture stored for another event does not hold it back', async () => {
    localStorage.setItem('cp_room_capture', JSON.stringify({ ...stored, eventId: 'other' }));
    renderCard();
    expect(await screen.findByTestId('round-mic-start')).toBeTruthy();
  });
});
