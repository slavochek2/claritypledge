// @vitest-environment jsdom
/**
 * P1562, Clarity Night's /meet:
 *  - §1: one header — the Back in the shell top bar (no compact arrow), the step bar under it.
 *  - §1a: idle transcription is the compact "Transcribe" in the top bar's right slot (no "Not transcribing" row); with
 *    no shell, today's full-width row and the in-place Back.
 *  - §2: Back to readiness (pop when Ready opened Meet; a return visit replaces, carrying fromEvent); frozen, Back
 *    returns past Ready to the event; the room's link to /close carries fromRoom, fromEvent and the room's depth.
 *  - §3.2: the roster — skeleton rows while the first read is out, a quiet line when it failed, rows once one succeeded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ShellTopBar, ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';
import type { EventRoomMember } from '@/app/types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } } }) }));
const capture = vi.hoisted(() => ({
  phase: 'idle', barVisible: false,
  isCapturingForEvent: () => false,
  startCapture: async () => ({ started: true }),
}));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflineStripShown: () => false,
}));
vi.mock('@/app/components/layout/app-shell/shell-nav', () => ({ useHideTodaysStripForEvent: () => {} }));
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown>, selfState: null as null | Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => room.selfState ?? { self: null, loading: false, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() },
}));
// The subscription's contract (P1586 onStatus): `pending` at once; a failed first read reports [] then `failed`; a
// successful read says `ready`, then hands over its rows.
const roster = vi.hoisted(() => ({
  onUpdate: null as null | ((r: unknown[]) => void),
  onStatus: null as null | ((s: 'pending' | 'ready' | 'failed') => void),
  fail() { this.onUpdate!([]); this.onStatus!('failed'); },
  ok(rows: unknown[]) { this.onStatus!('ready'); this.onUpdate!(rows); },
}));
vi.mock('@/app/data/event-room-service', () => ({
  setRoomOptIn: vi.fn(), setRoomRating: vi.fn(), resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: (_id: string, onUpdate: (r: unknown[]) => void, onStatus?: (s: 'pending' | 'ready' | 'failed') => void) => {
    roster.onUpdate = onUpdate;
    roster.onStatus = onStatus ?? null;
    onStatus?.('pending');
    return Object.assign(() => {}, { refresh: () => {} });
  },
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/prototypes/events/prep/EventPrepPage', () => ({ PrepFlow: () => null }));
vi.mock('@/app/prototypes/events/prep/PrepPieces', () => ({ JoinOffer: () => null }));
// The round card reports the evening's moment (it owns the poll); tests set what it reports.
const roundMoment = vi.hoisted(() => ({ value: null as null | Record<string, boolean> }));
vi.mock('@/app/prototypes/events/rounds/RoundCard', async () => {
  const { useEffect } = await import('react');
  return {
    RoundCard: ({ onMoment }: { onMoment: (m: Record<string, boolean>) => void }) => {
      useEffect(() => { if (roundMoment.value) onMoment(roundMoment.value); }, [onMoment]);
      return null;
    },
  };
});
vi.mock('@/app/prototypes/events/components/PracticeRooms', () => ({ PracticeRooms: () => null }));
vi.mock('@/app/prototypes/events/close/CloseInRoom', async () => {
  const { useLocation } = await import('react-router-dom');
  return { CloseInRoom: () => <div data-testid="close-in-room" data-state={JSON.stringify(useLocation().state)} /> };
});
vi.mock('@/app/prototypes/events/use-feedback-finished', () => ({ useFeedbackFinished: () => undefined }));
vi.mock('@/app/prototypes/events/use-event-community', () => ({ useEventMembership: () => undefined, useEventCommunityName: () => undefined }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: true, error: false, learned: false, progress: { done: 0 }, minutes: 0, reload: vi.fn() }),
}));

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const open = { id: 'ev-1', slug: 'night', title: 'Night', datetime: '2099-01-01T11:00:00Z', durationMinutes: 120, hostId: 'h', seriesSlug: null, statementTag: null };
const frozen = { ...open, datetime: '2000-01-01T11:00:00Z' };

function Page({ name }: { name: string }) {
  const state = useLocation().state as Record<string, unknown> | null;
  return <p data-testid="page" data-state={JSON.stringify(state)}>{name}</p>;
}

type Entry = string | { pathname: string; state: unknown };
function mount(entries: Entry[], inShell = false) {
  return render(
    <ShellTopBarProvider enabled={inShell}>
      {inShell && <ShellTopBar />}
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/events" element={<Page name="list" />} />
          <Route path="/events/:slug" element={<><FocusHeader fallback="/events" /><Page name="event" /></>} />
          <Route path="/events/:slug/ready" element={<Page name="ready" />} />
          <Route path="/events/:slug/meet" element={<EventRoomMeet />} />
          <Route path="/events/:slug/close" element={<Page name="close" />} />
        </Routes>
      </MemoryRouter>
    </ShellTopBarProvider>,
  );
}
const page = () => screen.getByTestId('page');
const shellBar = () => document.querySelector('[data-shell-top-bar]') as HTMLElement;
const fromReady = { pathname: '/events/night/meet', state: { fromReady: true, fromEvent: true } };
const readyEntry = { pathname: '/events/night/ready', state: { fromEvent: true } };

beforeEach(() => {
  roundMoment.value = null;
  room.selfState = null;
  roster.onUpdate = null;
  roster.onStatus = null;
  room.access = { slug: 'night', event: open, loading: false, granted: true, isLoggedIn: true, offline: false };
});

describe('§1/§1a: one header in the shell', () => {
  it('Back to readiness and a compact Transcribe sit in the shell top bar; no compact arrow, no "Not transcribing"', () => {
    mount([fromReady], true);
    const bar = shellBar();
    expect(within(bar).getByRole('button', { name: 'Back to readiness' })).toHaveTextContent('Back to readiness');
    const start = within(bar).getByTestId('room-transcribe-start');
    expect(start).toHaveTextContent('Transcribe');
    expect(start.className).toContain('h-9');
    // Round 4 (G6/C6): the shared <Button variant="outline" size="sm"> (design-system.md, P1568), not hand-typed classes.
    expect(start.className.split(' ')).toEqual(expect.arrayContaining(['border-input', 'bg-background', 'shadow-sm']));
    expect(start.className).not.toContain('border-blue-300');
    expect(start).toHaveAccessibleDescription(expect.stringContaining('Record audio and share transcript'));
    expect(within(bar).getByTestId('capture-info')).toBeInTheDocument();
    expect(screen.queryByText('Not transcribing')).toBeNull();
    expect(screen.queryByTestId('room-back')).toBeNull();
    // The step bar stays in the page's own sticky head.
    expect(within(screen.getByTestId('room-sticky-head')).getByTestId('room-step-principle')).toBeInTheDocument();
  });

  it('no shell (an unverified viewer): the same Back in place, and today\'s full-width Transcribe row', () => {
    mount([fromReady], false);
    const head = screen.getByTestId('room-sticky-head');
    expect(within(head).getByRole('button', { name: 'Back to readiness' })).toHaveTextContent('Back to readiness');
    expect(within(head).getByTestId('room-transcribe-idle')).toHaveTextContent('Not transcribing');
  });

  it('frozen: no Transcribe anywhere, and Back is "Back to the event"', () => {
    room.access = { ...room.access as object, event: frozen };
    mount([fromReady], true);
    expect(within(shellBar()).getByRole('button', { name: 'Back to the event' })).toBeInTheDocument();
    expect(screen.queryByTestId('room-transcribe-start')).toBeNull();
  });
});

describe('§2: the Back table', () => {
  it('opened by Ready: pops to Ready', async () => {
    mount(['/events/night', readyEntry, fromReady]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to readiness' }));
    await waitFor(() => expect(page()).toHaveTextContent('ready'));
  });

  it('a return visit (no Ready below): replaces with Ready and carries fromEvent, so Ready can still pop to the event', async () => {
    mount(['/events', '/events/night', { pathname: '/events/night/meet', state: { fromEvent: true } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to readiness' }));
    await waitFor(() => expect(page()).toHaveTextContent('ready'));
    expect(JSON.parse(page().dataset.state!)).toEqual({ fromEvent: true });
  });

  it('frozen, opened through Ready: Back returns past Ready to the event, whose own Back then reaches the list', async () => {
    room.access = { ...room.access as object, event: frozen };
    mount(['/events', '/events/night', readyEntry, fromReady]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toHaveTextContent('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toHaveTextContent('list'));
  });

  it('the room\'s "Give feedback" opens the close inside the room: same /meet page, ?view=feedback, one more room entry, the marks kept', async () => {
    // Founder UAT round (P1542): it used to push /close; /close stays the direct way in (emails, the QR code).
    room.access = { ...room.access as object, event: frozen };
    mount(['/events/night', readyEntry, fromReady]);
    fireEvent.click(screen.getByRole('button', { name: 'Give feedback' }));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    // P1542 review: the entry is marked as the one the room pushed, so the close's own Back can pop it.
    expect(JSON.parse(screen.getByTestId('close-in-room').dataset.state!)).toEqual({ fromReady: true, fromEvent: true, roomDepth: 1, pushedView: true });
  });
});

describe('§3.2: the roster card', () => {
  const ana: EventRoomMember = {
    id: 'm1', eventId: 'ev-1', profileId: 'u1', displayName: 'Ana', optedIn: true, comprehensionRating: 7, joinedAt: '2099-01-01',
  } as EventRoomMember;

  it('skeleton rows while the first read is out — no text', () => {
    mount([fromReady]);
    const card = screen.getByTestId('room-roster');
    expect(within(card).getByTestId('room-roster-skeleton')).toBeInTheDocument();
    expect(card.textContent).toBe('');
  });

  it('a failed first read: the quiet line; the next poll\'s success shows the rows', () => {
    mount([fromReady]);
    act(() => roster.fail());
    expect(screen.getByTestId('room-roster')).toHaveTextContent('Who is here will show in a moment.');
    expect(screen.queryByTestId('room-roster-skeleton')).toBeNull();
    act(() => roster.ok([ana]));
    expect(within(screen.getByTestId('room-roster')).getByText('Ana')).toBeInTheDocument();
  });

  it('a successful read with nobody in the room says "Nobody is here yet." — not "Everyone has answered." over nobody', () => {
    mount([fromReady]);
    act(() => roster.ok([]));
    expect(screen.getByTestId('room-roster')).toHaveTextContent('Nobody is here yet.');
    expect(screen.queryByTestId('room-roster-all-answered')).toBeNull();
    expect(screen.queryByText(/Loading who is here/)).toBeNull();
  });

  it('real members with nobody undecided keep the per-group "Everyone has answered."', () => {
    mount([fromReady]);
    act(() => roster.ok([ana]));
    expect(screen.getByTestId('room-roster-all-answered')).toHaveTextContent('Everyone has answered.');
    expect(screen.queryByText('Nobody is here yet.')).toBeNull();
  });
});

describe('§1a / viewer states (Done-When evidence)', () => {
  it('the evening is over (the host ended it, before the grace close): no Transcribe anywhere, Back goes to the event', async () => {
    roundMoment.value = { seated: false, atTable: false, eveningOver: true, live: false, waiting: false };
    mount(['/events', '/events/night', readyEntry, fromReady], true);
    await waitFor(() => expect(screen.getByTestId('room-close')).toBeInTheDocument());
    expect(screen.queryByTestId('room-transcribe-start')).toBeNull();
    expect(screen.queryByText('Not transcribing')).toBeNull();
    // Codex review: an evening the host ended is over for Back too — past Ready to the event, never back to readiness.
    expect(screen.queryByRole('button', { name: 'Back to readiness' })).toBeNull();
    // The step bar agrees with Back: Ready stays as a done step but cannot be opened (like Table and Compare once the
    // evening has closed), so a tap there never leads back to readiness.
    const ready = screen.getByTestId('room-step-ready');
    expect(ready).toBeDisabled();
    fireEvent.click(ready);
    expect(screen.getByTestId('room-close')).toBeInTheDocument();
    fireEvent.click(within(shellBar()).getByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toHaveTextContent('event'));
  });

  it('the host on /meet sees the attendee header: the shell-bar Back and the compact Transcribe', () => {
    room.access = { ...room.access as object, event: { ...open, hostId: 'u1' } }; // the signed-in user hosts it
    mount([fromReady], true);
    const bar = shellBar();
    expect(within(bar).getByRole('button', { name: 'Back to readiness' })).toBeInTheDocument();
    expect(within(bar).getByTestId('room-transcribe-start')).toHaveTextContent('Transcribe');
    expect(screen.queryByTestId('room-back')).toBeNull();
    expect(within(screen.getByTestId('room-sticky-head')).getByTestId('room-steps')).toBeInTheDocument();
  });
});

describe('a failed answer whose re-reads run out (use-room-write.ts, Codex review)', () => {
  it('"That didn\'t save." with the filled "Try again"; a tap starts a new re-read: "Reconnecting…"', async () => {
    vi.useFakeTimers();
    try {
      const self = { id: 'm1', eventId: 'ev-1', optedIn: null, comprehensionRating: null };
      const refresh = vi.fn().mockResolvedValue(false); // the server stays unreachable
      room.selfState = { self, loading: false, refresh, runSelfWrite: vi.fn().mockRejectedValue(new Error('down')) };
      mount([fromReady]);
      fireEvent.click(screen.getByTestId('room-opt-in-yes'));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); }); // past the whole budget
      expect(refresh).toHaveBeenCalledTimes(9);
      expect(screen.getByText("We couldn't confirm your answer saved.")).toBeInTheDocument();
      const retry = screen.getByTestId('room-write-retry');
      expect(retry).toHaveTextContent('Try again');
      expect(retry.className).toContain('w-full');
      expect(retry.className).toContain('bg-blue-600'); // the default filled button, not outline
      expect(screen.getByTestId('room-opt-in-no')).toBeDisabled(); // still locked
      fireEvent.click(retry);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(refresh).toHaveBeenCalledTimes(10);
      expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      expect(screen.queryByTestId('room-write-retry')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

