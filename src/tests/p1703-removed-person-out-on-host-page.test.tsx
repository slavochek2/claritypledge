/**
 * P1703: a person the host REMOVES also leaves the event room, server-side (event_round_presence.left_at). The host page reads
 * that through getRoundPresence (mount, poll, and again at Start). What is under test: such a person shows as out without the
 * host ever pressing "Mark out", and is never seated by a Start, on Clarity Night and in the sales mastermind.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';

const h = vi.hoisted(() => ({
  state: null as unknown,
  roster: [] as unknown[],
  event: {} as Record<string, unknown>,
  hostState: new Map<string, unknown>(),
  getMastermindHostState: vi.fn(),
  getPreviousSessionPartners: vi.fn(),
  hostSetObserver: vi.fn(),
  hostSetEventFlow: vi.fn(),
  hostStartRound: vi.fn(),
  hostEndRound: vi.fn(),
  hostEndRounds: vi.fn(),
  refreshRounds: vi.fn(),
  getEveningEnd: vi.fn(),
  hostSetRoundSeats: vi.fn(),
  getWaitlistPublic: vi.fn(),
  hostAddFromWaitlist: vi.fn(),
  presence: new Map<string, unknown>(),
  hostSetRoundPresence: vi.fn(),
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
  getRoundPresence: vi.fn(async () => h.presence),
  hostSetRoundPresence: h.hostSetRoundPresence,
  getTranscribingNow: vi.fn().mockResolvedValue(new Set()),
  getRoundSeatKeys: vi.fn().mockResolvedValue(null),
  hostStartRound: h.hostStartRound,
  hostEndRound: h.hostEndRound,
  hostEndRounds: h.hostEndRounds,
  hostSetRoundSeats: h.hostSetRoundSeats,
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  getMastermindHostState: h.getMastermindHostState,
  getPreviousSessionPartners: h.getPreviousSessionPartners,
  hostSetObserver: h.hostSetObserver,
  hostSetEventFlow: h.hostSetEventFlow,
  getEveningEnd: h.getEveningEnd,
}));
vi.mock('@/app/data/event-waitlist', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-waitlist')>()),
  getWaitlistPublic: h.getWaitlistPublic,
  hostAddFromWaitlist: h.hostAddFromWaitlist,
}));

import { EventHostPage } from '@/app/prototypes/events/rounds/EventHostPage';

const member = (key: string, name: string) =>
  ({ id: `m-${key}`, profileId: `p-${key}`, displayName: name, profileSlug: key, profileHasPledged: false } as unknown as EventRoomMember);
const ROSTER = [member('a', 'Ana Brown'), member('b', 'Ben Cole'), member('c', 'Cat Dunn'), member('d', 'Dan Eve'), member('e', 'Eva Fox')];
const REMOVED = 'm-e'; // Eva: the person the host removes

const person = (key: string): MastermindPerson => ({
  profileId: `p-${key}`, canvasName: `canvas_${key}`, canvasTitle: null, canvasShared: true, observerOverride: null,
  participation: 'canvas_before', observerPrep: null, registered: true, waitingPosition: null, name: null, phone: 'usbc', recordingOn: false, lastWordsAt: null,
});

/** What the server says after "remove person": left_at set, the host never pressed Mark out. */
const removedOnServer = (id: string) => new Map<string, unknown>([[id, { memberId: id, leftAt: new Date().toISOString(), sitsOutRound: null }]]);

const MM = 'sales-mastermind';
function renderHost(flow: string | null) {
  h.event = { id: 'ev-1', hostId: 'host-1', title: 'Evening', slug: 'night', statementTag: null, flow, seriesSlug: undefined };
  return render(
    <MemoryRouter initialEntries={['/events/night/host']}>
      <Routes><Route path="/events/:slug/host" element={<EventHostPage />} /></Routes>
    </MemoryRouter>,
  );
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* none */ }
  h.roster = ROSTER;
  h.state = { rounds: [], seatsByRound: new Map(), topics: new Map() } satisfies EventRoundsState;
  h.hostState = new Map(ROSTER.map(m => [m.profileId as string, person((m.profileId as string).slice(2))]));
  h.getMastermindHostState.mockImplementation(async () => h.hostState);
  h.getPreviousSessionPartners.mockResolvedValue([]);
  h.getEveningEnd.mockResolvedValue(null);
  h.hostEndRound.mockResolvedValue(true);
  h.refreshRounds.mockResolvedValue(undefined);
  h.hostEndRounds.mockResolvedValue(undefined);
  h.hostSetObserver.mockResolvedValue({ status: 'ok' });
  h.hostSetEventFlow.mockResolvedValue(undefined);
  h.hostStartRound.mockResolvedValue('r-new');
  h.hostSetRoundSeats.mockResolvedValue(undefined);
  h.getWaitlistPublic.mockResolvedValue([]);
  h.hostAddFromWaitlist.mockResolvedValue('ok');
  h.presence = new Map();
  h.hostSetRoundPresence.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Open the seating preview from the primary button (or "Reopen"), once the room has been read. */
async function openPreview(flow: string | null) {
  if (flow === MM) {
    await waitFor(() => expect(h.getMastermindHostState).toHaveBeenCalled());
    await settle();
  }
  await waitFor(() => {
    if (screen.queryByTestId('host-preview')) return;
    fireEvent.click(screen.queryByTestId('host-primary') ?? screen.getByTestId('host-reopen'));
    expect(screen.getByTestId('host-preview')).toBeTruthy();
  }, { timeout: 3000 });
  return screen.findByTestId('host-preview');
}

/** Every member id in the seats the last (or only) hostStartRound call wrote. */
const seatedIds = (): string[] => {
  const calls = h.hostStartRound.mock.calls as unknown[][];
  const last = calls[calls.length - 1] as unknown[];
  return (last[3] as Array<{ id: string }>).map(s => s.id);
};

/** Click Start; if the page found the pool changed it rebuilds the preview instead, so click again until a round is written. */
async function startUntilWritten() {
  for (let i = 0; i < 4 && h.hostStartRound.mock.calls.length === 0; i++) {
    fireEvent.click(await screen.findByTestId('host-preview-start'));
    await settle();
    await settle();
  }
  await waitFor(() => expect(h.hostStartRound).toHaveBeenCalled());
}

const flows: Array<[string, string | null]> = [['Clarity Night', null], ['sales mastermind', MM]];

describe.each(flows)('P1703 removed person, %s', (_label, flow) => {
  it('shows a person whose presence already carries left_at as out, not waiting, with no Mark out pressed', async () => {
    h.presence = removedOnServer(REMOVED);
    renderHost(flow);
    const out = await screen.findByTestId('host-out');
    expect(within(out).getByText(/Eva/)).toBeTruthy();
    expect(within(out).queryByText(/Ana|Ben|Cat|Dan/)).toBeNull();
    // Not among the people waiting / in the list of people still in.
    // (the Out group's own tiles also carry the host-member test id, so they are excluded here)
    const stillIn = screen.queryAllByTestId('host-waiting').concat(screen.queryAllByTestId('mm-person'), screen.queryAllByTestId('host-member'))
      .filter(el => !el.closest('[data-testid="host-out"]'));
    expect(stillIn.length).toBeGreaterThan(0);
    for (const el of stillIn) expect(el.textContent).not.toContain('Eva');
    expect(h.hostSetRoundPresence).not.toHaveBeenCalled();
  });

  it('does not seat a person who was removed between the preview and Start', async () => {
    renderHost(flow);
    const preview = await openPreview(flow);
    expect(preview.textContent).toContain('Eva');
    h.presence = removedOnServer(REMOVED); // the server removes Eva; the host's page has not polled yet
    await startUntilWritten();
    expect(h.hostSetRoundPresence).not.toHaveBeenCalled();
    expect(seatedIds()).not.toContain(REMOVED);
    expect(seatedIds().length).toBeGreaterThan(0);
  });

  it('control: with nobody removed, Start seats that same person', async () => {
    renderHost(flow);
    const preview = await openPreview(flow);
    expect(preview.textContent).toContain('Eva');
    await startUntilWritten();
    expect(seatedIds()).toContain(REMOVED);
  });
});
