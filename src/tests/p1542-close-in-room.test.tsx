// @vitest-environment jsdom
/**
 * P1542 founder UAT round: the close drawn INSIDE the event room (?view=feedback, CloseInRoom). The sequence is the
 * /close page's own (CloseFlow, unchanged); only its frame differs:
 *  - its step header goes into the room's sticky head (the slot the room gives it), never a second fixed bar;
 *  - its ways out (Back from the first question) return to the room;
 *  - the URL stays the room's: no ?done=1, the room's entry state kept, and a left ?join=1 dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
const series = vi.hoisted(() => ({ slug: 'social-hike' as string | null, finished: false }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: vi.fn(async () => ({
      id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
      durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
      statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: series.slug,
    })),
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
    getEventAttendees: vi.fn().mockResolvedValue([]),
    isUserRsvpd: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('@/app/data/event-close-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-close-service')>()),
  getEventClose: vi.fn(async () => ({ isAttendee: true, score: series.finished ? 9 : null, liked: null, improve: null, quoteOk: null, asks: [], finished: series.finished })),
  finishEventClose: vi.fn().mockResolvedValue(true),
  getCommunitySlug: vi.fn().mockResolvedValue(null),
  getSeriesPeople: vi.fn().mockResolvedValue(0),
  saveEventFeedback: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/app/data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/api')>()),
  getProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));
vi.mock('@/app/data/points-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/data/points-service')>();
  return { ...actual, pointsService: { ...actual.pointsService, getPublicPointsFeed: vi.fn().mockResolvedValue([]) } };
});
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  loadTagPoints: vi.fn().mockResolvedValue([]),
}));


import { CloseInRoom } from '@/app/prototypes/events/close/CloseInRoom';

const event = {
  id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
  durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
  statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: 'social-hike',
} as never;

function Loc() {
  const l = useLocation();
  return <i data-testid="loc" data-search={l.search} data-state={JSON.stringify(l.state ?? null)} />;
}

let slot: HTMLDivElement;
function mount(search: string, leave = vi.fn()) {
  slot = document.createElement('div');
  slot.setAttribute('data-testid', 'room-head-slot');
  document.body.appendChild(slot);
  render(
    <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search, state: { fromEvent: true, roomDepth: 1 } }]}>
      <Routes>
        <Route path="/events/:slug/meet" element={<><CloseInRoom event={event} viewerId="u1" room={{ headSlot: slot, leave }} /><Loc /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return leave;
}
const loc = () => screen.getByTestId('loc');

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
  auth.value = { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
  series.finished = false;
});

describe('the close inside the room', () => {
  it('the step header is drawn into the room\'s sticky head; on the first question it has no Back of its own (founder UAT)', async () => {
    mount('?view=feedback');
    await waitFor(() => expect(within(slot).getByTestId('step-header')).toBeInTheDocument());
    expect(screen.getAllByTestId('step-header')).toHaveLength(1);
    expect(within(slot).getByTestId('step-name')).toBeInTheDocument();
    // The room's own "Back to the event" (and its tabs) are the way out of the first question.
    expect(within(slot).queryByTestId('header-back')).toBeNull();
  });

  it('the thank-you: no ?done=1 and no second "Back to the event"; the room\'s entry state is kept', async () => {
    series.finished = true;
    mount('?view=feedback');
    await waitFor(() => expect(screen.getByTestId('p1389-close')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('step-header')).toBeNull());
    expect(loc().dataset.search).toBe('?view=feedback');
    expect(JSON.parse(loc().dataset.state!)).toEqual({ fromEvent: true, roomDepth: 1 });
    expect(screen.queryByRole('button', { name: 'Back to the event' })).toBeNull();
  });

  it('?join=1 that the terms cannot use (no group here): the thank-you, the ?join=1 dropped, the view and state kept', async () => {
    series.finished = true;
    mount('?view=feedback&join=1');
    await waitFor(() => expect(loc().dataset.search).toBe('?view=feedback'));
    expect(JSON.parse(loc().dataset.state!)).toEqual({ fromEvent: true, roomDepth: 1 });
  });

  it('G8: a failed read offers "Try again", which reads again and opens the close', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockRejectedValueOnce(new Error('offline'));
    mount('?view=feedback');
    fireEvent.click(await screen.findByTestId('close-in-room-retry'));
    await waitFor(() => expect(screen.getByTestId('p1389-close')).toBeInTheDocument());
  });

  it('G4: someone the close does not belong to is sent back to the room once — even as the room re-renders', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(getEventClose).mockResolvedValueOnce({ isAttendee: false, score: null, liked: null, improve: null, quoteOk: null, asks: [], finished: false } as never);
    const spy = vi.fn();
    slot = document.createElement('div');
    // The room passes a new callback on every render, as EventRoomMeet does.
    const tree = () => (
      <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true, roomDepth: 1 } }]}>
        <Routes>
          <Route path="/events/:slug/meet" element={<CloseInRoom event={event} viewerId="u1" room={{ headSlot: slot, leave: () => spy() }} />} />
        </Routes>
      </MemoryRouter>
    );
    const view = render(tree());
    await waitFor(() => expect(spy).toHaveBeenCalled());
    view.rerender(tree());
    view.rerender(tree());
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('round 4: words typed but not yet submitted survive the close being closed and opened again (a room tab switch)', async () => {
    const { getEventClose } = await import('@/app/data/event-close-service');
    // Score saved, the "how can we improve" question open: the close resumes on it.
    const resumed = { isAttendee: true, score: 8, liked: null, improve: null, quoteOk: null, asks: [], finished: false } as never;
    vi.mocked(getEventClose).mockResolvedValueOnce(resumed).mockResolvedValueOnce(resumed);
    const first = render(
      <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true, roomDepth: 1 } }]}>
        <Routes><Route path="/events/:slug/meet" element={<CloseInRoom event={event} viewerId="u1" room={{ headSlot: document.createElement('div'), leave: vi.fn() }} />} /></Routes>
      </MemoryRouter>,
    );
    const box = await screen.findByRole('textbox');
    fireEvent.change(box, { target: { value: 'More water stops.' } });
    first.unmount();
    render(
      <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true, roomDepth: 1 } }]}>
        <Routes><Route path="/events/:slug/meet" element={<CloseInRoom event={event} viewerId="u1" room={{ headSlot: document.createElement('div'), leave: vi.fn() }} />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('textbox')).toHaveValue('More water stops.');
  });

  it('Q3: the step a previous person in this tab reached is not where the next person starts', async () => {
    // Written by someone else's close on this event in this tab (old key and per-person key alike).
    sessionStorage.setItem('p1389-step:ev-1', 'appreciate');
    sessionStorage.setItem('p1389-step:alice:ev-1', 'appreciate');
    mount('?view=feedback');
    await waitFor(() => expect(screen.getByTestId('step-score')).toBeInTheDocument());
    expect(sessionStorage.getItem('p1389-step:alice:ev-1')).toBeNull();
  });

  it('Z2: if the tab hides before the close\'s read lands, the close is not drawn (no follow-up reads) until it is visible', async () => {
    const { getEventClose, getCommunitySlug } = await import('@/app/data/event-close-service');
    const { eventsService } = await import('@/app/data/events-service');
    let land!: (v: unknown) => void;
    vi.mocked(getEventClose).mockImplementationOnce(() => new Promise((r) => { land = r as (v: unknown) => void; }) as never);
    mount('?view=feedback');
    await waitFor(() => expect(vi.mocked(getEventClose)).toHaveBeenCalled());
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const reads = () => vi.mocked(getCommunitySlug).mock.calls.length + vi.mocked(eventsService.getEventAttendees).mock.calls.length + vi.mocked(eventsService.getUpcomingEvents).mock.calls.length;
    const before = reads();
    land({ isAttendee: true, score: null, liked: null, improve: null, quoteOk: null, asks: [], finished: false });
    await new Promise((r) => setTimeout(r, 30));
    expect(reads()).toBe(before); // the close's follow-up reads have not started
    expect(screen.queryByTestId('p1389-close')).toBeNull();
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByTestId('p1389-close')).toBeInTheDocument());
    vis.mockRestore();
  });

  it('founder (B reversed, 2026-10-29): in the room the questions are centred again — --chrome is the measured head, not the whole viewport', async () => {
    mount('?view=feedback');
    const main = await waitFor(() => { const m = document.querySelector('[data-testid="p1389-close"] main') as HTMLElement; expect(m).toBeTruthy(); return m; });
    const chrome = main.style.getPropertyValue('--chrome');
    expect(chrome).not.toBe('100dvh');
    expect(chrome).toMatch(/^\d+px$/);
  });
});

