/**
 * P1529 walk: "the expanded update task folds back on about half of first clicks". The task's open flag is held by the round
 * card, so only a REMOUNT of the card can lose it. EventRoomMeet replaces the whole page (and so the card) with the page loader
 * whenever `useEventRoomSelf` reports `loading`, and that hook set `loading` again every time the event OBJECT changed, even for
 * the same event with the person's row already read: a slower read of the same event landing after the first (the access
 * check's "late" answer) is enough. These tests pin the two halves: the hook does not report loading for the same event, and
 * the card keeps the task open across a remount anyway.
 */
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRoundsState, EventRound, RoundSeat } from '@/app/data/event-rounds-service';

const h = vi.hoisted(() => ({
  status: vi.fn(),
  state: null as unknown,
  server: {} as Record<string, unknown>,
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflinePageReport: () => {},
  useOfflineStripShown: () => false,
}));
vi.mock('@/lib/offline-read-cache', () => ({
  readThrough: async (_k: string, _id: string, read: () => Promise<unknown>) => ({ source: 'network', data: await read() }),
  rememberOffline: async () => {},
}));
vi.mock('@/app/data/event-room-service', () => ({ getMyRoomStatus: (...a: unknown[]) => h.status(...a), joinEventRoom: vi.fn() }));
vi.mock('@/app/data/events-service', () => ({ eventsService: {} }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/prototypes/events/rounds/use-event-rounds', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/prototypes/events/rounds/use-event-rounds')>();
  return { ...real, useEventRounds: () => ({ state: h.state, loaded: true, refresh: async () => {} }) };
});
vi.mock('@/app/data/event-mastermind-service', () => ({
  recordCanvasOpen: vi.fn(),
  makeMyNextVersion: vi.fn(),
  getMyRoundCanvas: vi.fn().mockResolvedValue(null),
  getMyNextVersionOffer: async () => h.server.offer,
  getMyUpdateState: async () => h.server.update,
  getCanvasUpdateStep: async () => null,
  getMyDraftRef: vi.fn().mockResolvedValue(null),
  getMyEventCanvas: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/data/canvas-draft-service', () => ({ publishCanvasDraft: vi.fn(), retryCanvasRun: vi.fn(), getCanvasDraftState: vi.fn() }));
vi.mock('@/app/prototypes/events/prep/EventCanvasCard', () => ({ EventCanvasCard: () => null }));

import { useEventRoomSelf } from '@/app/prototypes/events/components/EventRoomAccess';
import { MastermindRoundCard } from '@/app/prototypes/events/rounds/MastermindRoundCard';
import { useState } from 'react';
import { resetTaskOpen } from '@/app/prototypes/events/rounds/task-open-store';

const SELF_ROW = { id: 'm-owner', eventId: 'ev-1', displayName: 'Haru' };
const eventObj = () => ({ id: 'ev-1', slug: 'mm' }) as never;

describe('useEventRoomSelf does not blank the page for a re-read of the same event', () => {
  beforeEach(() => { h.status.mockReset(); h.status.mockResolvedValue(SELF_ROW); });

  it('a new object for the same event, with the person\'s row already read, is not "loading" again', async () => {
    const { result, rerender } = renderHook(({ event }) => useEventRoomSelf(event, true), { initialProps: { event: eventObj() } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.self).toBeTruthy();
    rerender({ event: eventObj() });
    // the room page returns its loader whenever this is true, which unmounts every card on it
    expect(result.current.loading).toBe(false);
    expect(result.current.self).toBeTruthy();
    await waitFor(() => expect(h.status).toHaveBeenCalledTimes(2)); // it still re-reads
  });

  it('another event still starts from nothing and shows the loader', async () => {
    const { result, rerender } = renderHook(({ event }) => useEventRoomSelf(event, true), { initialProps: { event: eventObj() } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ event: { id: 'ev-2', slug: 'other' } as never });
    expect(result.current.loading).toBe(true);
    expect(result.current.self).toBeNull();
  });
});

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 3, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
  seatingS: 60, firstS: 360, secondS: 360, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
});
const seat = (roundId: string, id: string, role: RoundSeat['role']): RoundSeat => ({ roundId, id, table: 1, role, confirmedAt: null });
const OWNER = { id: 'm-owner', displayName: 'Haru Tanaka', profileId: 'p-owner', profileSlug: 'haru' } as unknown as EventRoomMember;

describe('the round card keeps the task open when it is remounted', () => {
  it('a tap on the collapsed line stays open across a remount of the card (the page loader swap)', async () => {
    resetTaskOpen();
    h.state = {
      rounds: [round(), round({ id: 'r2', roundNo: 2, endedAt: null })],
      seatsByRound: new Map([['r1', [seat('r1', 'm-owner', 'first')]], ['r2', [seat('r2', 'm-owner', 'second')]]]),
      topics: new Map(),
    } satisfies EventRoundsState;
    h.server.offer = { state: 'offer', roundId: 'r1' };
    h.server.update = { state: 'not_tapped', draftId: null, revision: null, runId: null };
    function Page() {
      const [mounted, setMounted] = useState(true);
      return (
        <MemoryRouter>
          <button data-testid="swap" onClick={() => { setMounted(false); setTimeout(() => setMounted(true), 0); }} />
          {mounted && <MastermindRoundCard eventId="ev-1" self={OWNER} roster={[OWNER]} view="table" />}
        </MemoryRouter>
      );
    }
    render(<Page />);
    fireEvent.click(await screen.findByTestId('mastermind-task-line'));
    expect(screen.getByTestId('mastermind-make')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId('swap')); await new Promise(r => setTimeout(r, 20)); });
    expect(await screen.findByTestId('mastermind-make')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-task-line')).toBeNull();
  });
});
