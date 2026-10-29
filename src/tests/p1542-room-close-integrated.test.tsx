// @vitest-environment jsdom
/**
 * P1542 review round (Codex): the room with the REAL in-room close (CloseInRoom → CloseFlow), not a stand-in — the
 * feedback's last answer already saved, so the close opens on its thank-you; reaching it ticks the room's Share
 * feedback step and ends the room's offer at once (G2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ShellTopBar, ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

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
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() }),
}));
const roster = vi.hoisted(() => ({ onUpdate: null as null | ((r: unknown[]) => void), onFailed: null as null | (() => void) }));
vi.mock('@/app/data/event-room-service', () => ({
  setRoomOptIn: vi.fn(), setRoomRating: vi.fn(), resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: (_id: string, onUpdate: (r: unknown[]) => void, onFailed?: () => void) => {
    roster.onUpdate = onUpdate;
    roster.onFailed = onFailed ?? null;
    return Object.assign(() => {}, { refresh: () => {} });
  },
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/prototypes/events/prep/EventPrepPage', () => ({
  PrepFlow: ({ room }: { room: { onStep: (s: string) => void } }) => <button type="button" onClick={() => room.onStep('close')}>learning finished</button>,
}));
vi.mock('@/app/prototypes/events/prep/PrepPieces', () => ({
  JoinOffer: ({ onJoin }: { onJoin: () => void }) => <button type="button" onClick={onJoin}>Join the group</button>,
}));
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
const fb = vi.hoisted(() => ({ finished: false as boolean | undefined }));
const learnedRef = vi.hoisted(() => ({ value: true }));
vi.mock('@/app/prototypes/events/use-feedback-finished', () => ({ useFeedbackFinished: () => fb.finished }));
vi.mock('@/app/prototypes/events/use-event-community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/use-event-community')>()),
  useEventMembership: () => false,
  useEventCommunityName: () => 'Hikers',
  useOrgMembership: () => undefined,
}));
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => ({ loading: false, error: false, learned: learnedRef.value, progress: { done: 3 }, minutes: 0, reload: vi.fn() }),
  loadTagPoints: vi.fn().mockResolvedValue([]),
}));

// The close flow itself is tested on its own (p1542-close-in-room.test.tsx); here, what it was given.
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
  getEventClose: vi.fn(async () => ({ isAttendee: true, score: 9, liked: 'Good walk.', improve: 'More water.', quoteOk: true, asks: [], finished: series.finished })),
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

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const hike = { id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', description: 'd', datetime: '2000-01-01T08:00:00Z', timezone: 'UTC', durationMinutes: 120, location: 'Trailhead', hostId: 'h', hostName: 'H', hasGroupChat: false, preparationEnabled: true, seriesSlug: 'social-hike', statementTag: null, orgId: 'org-1', attendees: [], researchPlaces: 6 };

function Back() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>browser back</button>;
}

beforeEach(() => {
  sessionStorage.clear();
  fb.finished = false;
  learnedRef.value = true;
  room.access = { slug: 'walk', event: hike, loading: false, granted: true, isLoggedIn: true, offline: false };
});

describe('the room with the real in-room close', () => {
  it('reaching the thank-you inside the room ticks Share feedback; back in the room, its offer has ended', async () => {
    render(
      <ShellTopBarProvider enabled>
        <ShellTopBar />
        <MemoryRouter initialEntries={['/events/walk', { pathname: '/events/walk/meet', state: { fromEvent: true, roomStep: 'close' } }]} initialIndex={1}>
          <Routes>
            <Route path="/events/:slug" element={<p data-testid="page">event</p>} />
            <Route path="/events/:slug/meet" element={<><EventRoomMeet /><Back /></>} />
          </Routes>
        </MemoryRouter>
      </ShellTopBarProvider>,
    );
    expect(screen.queryByTestId('room-step-close-check')).toBeNull();
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('p1389-close')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('room-step-close-check')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }));
    await waitFor(() => expect(screen.getByTestId('room-close-heading')).toHaveTextContent('Thanks, your feedback is in.'));
    expect(screen.queryByTestId('room-close-feedback')).toBeNull();
  });

  it('A: a thank-you whose "finished" write has NOT landed does not tick the room — the tick waits for the server', async () => {
    const { finishEventClose } = await import('@/app/data/event-close-service');
    vi.mocked(finishEventClose).mockResolvedValue(false);
    render(
      <ShellTopBarProvider enabled>
        <ShellTopBar />
        <MemoryRouter initialEntries={['/events/walk', { pathname: '/events/walk/meet', state: { fromEvent: true, roomStep: 'close' } }]} initialIndex={1}>
          <Routes>
            <Route path="/events/:slug" element={<p data-testid="page">event</p>} />
            <Route path="/events/:slug/meet" element={<><EventRoomMeet /><Back /></>} />
          </Routes>
        </MemoryRouter>
      </ShellTopBarProvider>,
    );
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('p1389-close')).toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(finishEventClose)).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('room-step-close-check')).toBeNull();
    vi.mocked(finishEventClose).mockResolvedValue(true);
  });
});

