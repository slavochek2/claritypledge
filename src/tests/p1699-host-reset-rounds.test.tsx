/**
 * P1699: the host page's "Reset rounds" control. The server and the polls are a fake the test sets; what is under test is when
 * the control shows, the exact confirm copy, and which calls a tap makes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRound, EventRoundsState } from '@/app/data/event-rounds-service';

const h = vi.hoisted(() => ({
  state: null as unknown,
  roster: [] as unknown[],
  event: {} as Record<string, unknown>,
  eveningEnd: null as null | string,
  getMastermindHostState: vi.fn(),
  getPreviousSessionPartners: vi.fn(),
  getEveningEnd: vi.fn(),
  hostResetRounds: vi.fn(),
  refreshRounds: vi.fn(),
  getWaitlistPublic: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'host-1' }, session: { user: { id: 'host-1' } }, sessionChecked: true }) }));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => null }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => ({ slug: 'night', event: h.event, loading: false, granted: true }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  subscribeToRoomRoster: (_id: string, cb: (r: unknown[]) => void) => { cb(h.roster); return () => {}; },
}));
vi.mock('@/app/data/event-prep-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-prep-service')>()),
  getPrepHostView: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/data/event-topic-tags', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-topic-tags')>()),
  getEventTopicTags: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/prototypes/events/rounds/use-tag-positions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/use-tag-positions')>()),
  useTagPositions: () => ({ byProfile: new Map() }),
}));
vi.mock('@/app/prototypes/events/rounds/use-event-rounds', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/use-event-rounds')>()),
  useEventRounds: () => ({ state: h.state, loaded: true, refresh: h.refreshRounds }),
}));
vi.mock('@/app/data/event-rounds-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()),
  getRoundPresence: vi.fn(async () => new Map()),
  hostSetRoundPresence: vi.fn(),
  getTranscribingNow: vi.fn().mockResolvedValue(new Set()),
  getRoundSeatKeys: vi.fn().mockResolvedValue(null),
  hostResetRounds: h.hostResetRounds,
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  getMastermindHostState: h.getMastermindHostState,
  getPreviousSessionPartners: h.getPreviousSessionPartners,
  getEveningEnd: h.getEveningEnd,
}));
vi.mock('@/app/data/event-waitlist', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-waitlist')>()),
  getWaitlistPublic: h.getWaitlistPublic,
}));

import { EventHostPage } from '@/app/prototypes/events/rounds/EventHostPage';

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MM = 'sales-mastermind';

const member = (key: string, name: string) =>
  ({ id: `m-${key}`, profileId: `p-${key}`, displayName: name, profileSlug: key, profileHasPledged: false } as unknown as EventRoomMember);
const ANA = member('a', 'Ana Brown');
const BEN = member('b', 'Ben Cole');

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 4, startedAt: ago(10 * MIN), endedAt: null,
  seatingS: 120, firstS: 450, secondS: 450, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
});
const setRounds = (rounds: EventRound[]) => {
  h.state = { rounds, seatsByRound: new Map(), topics: new Map() } satisfies EventRoundsState;
};

function renderHost(flow: string | null = MM) {
  h.event = { id: 'ev-1', hostId: 'host-1', title: 'Evening', slug: 'night', statementTag: null, flow, seriesSlug: undefined };
  return render(
    <MemoryRouter initialEntries={['/events/night/host']}>
      <Routes><Route path="/events/:slug/host" element={<EventHostPage />} /></Routes>
    </MemoryRouter>,
  );
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

const BODY =
  "This deletes every round of this event: the seating, the round chats and the round transcripts. Registrations, the waiting list, feedback, the rest of the event chat and everyone's canvases stay. People go back to the start, and you can start round 1 again. This cannot be undone.";

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* none */ }
  h.eveningEnd = null;
  h.roster = [ANA, BEN];
  setRounds([]);
  h.getMastermindHostState.mockResolvedValue(new Map());
  h.getPreviousSessionPartners.mockResolvedValue([]);
  h.getEveningEnd.mockImplementation(async () => h.eveningEnd);
  h.refreshRounds.mockResolvedValue(undefined);
  h.hostResetRounds.mockResolvedValue(1);
  h.getWaitlistPublic.mockResolvedValue([]);
});
afterEach(() => { cleanup(); });

describe('Reset rounds (P1699)', () => {
  it('is hidden with no rounds and no evening end', async () => {
    renderHost();
    await screen.findByTestId('host-controls');
    await settle();
    expect(screen.queryByTestId('host-reset-rounds')).toBeNull();
  });

  it('is shown once a round exists', async () => {
    setRounds([round()]);
    renderHost();
    const control = await screen.findByTestId('host-reset-rounds');
    expect(control.textContent).toBe('Reset rounds');
  });

  it('is shown after the evening has ended (not gated on End the evening)', async () => {
    setRounds([round({ endedAt: ago(MIN) })]);
    h.eveningEnd = ago(MIN);
    renderHost();
    await screen.findByText('Evening ended');
    expect(screen.queryByTestId('host-end-evening')).toBeNull();
    expect(await screen.findByTestId('host-reset-rounds')).toBeTruthy();
  });

  it('shows the exact confirm copy, and Cancel calls nothing', async () => {
    setRounds([round()]);
    renderHost();
    fireEvent.click(await screen.findByTestId('host-reset-rounds'));
    const box = screen.getByTestId('host-reset-confirm');
    expect(box.textContent).toContain('Reset all rounds?');
    expect(box.textContent).toContain(BODY);
    expect(screen.getByTestId('host-reset-yes').textContent).toBe('Reset rounds');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('host-reset-confirm')).toBeNull();
    expect(screen.getByTestId('host-reset-rounds')).toBeTruthy();
    expect(h.hostResetRounds).not.toHaveBeenCalled();
  });

  it('confirming resets this event and refreshes both state sources', async () => {
    setRounds([round()]);
    renderHost();
    await screen.findByTestId('host-controls');
    await settle();
    const stateReads = h.getMastermindHostState.mock.calls.length;
    const roundReads = h.refreshRounds.mock.calls.length;
    fireEvent.click(await screen.findByTestId('host-reset-rounds'));
    fireEvent.click(screen.getByTestId('host-reset-yes'));
    await waitFor(() => expect(h.hostResetRounds).toHaveBeenCalledWith('ev-1'));
    expect(h.hostResetRounds).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.refreshRounds.mock.calls.length).toBeGreaterThan(roundReads));
    await waitFor(() => expect(h.getMastermindHostState.mock.calls.length).toBeGreaterThan(stateReads));
    expect(screen.queryByTestId('host-reset-confirm')).toBeNull();
  });

  // /finish review (2026-11-17): a failed reset keeps the confirm box open for a retry, and clears nothing locally;
  // before the fix the box closed and the page's undo history was wiped while the rounds were still on the server.
  it('a failed reset says so and keeps the confirm box open for a retry', async () => {
    h.hostResetRounds.mockRejectedValueOnce(new Error('boom'));
    setRounds([round()]);
    renderHost();
    fireEvent.click(await screen.findByTestId('host-reset-rounds'));
    fireEvent.click(screen.getByTestId('host-reset-yes'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/didn.t save/);
    expect(screen.getByTestId('host-reset-confirm')).toBeTruthy();
    h.hostResetRounds.mockResolvedValueOnce(1);
    fireEvent.click(screen.getByTestId('host-reset-yes'));
    await waitFor(() => expect(h.hostResetRounds).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('host-reset-confirm')).toBeNull());
  });
});
