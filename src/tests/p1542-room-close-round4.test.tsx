// @vitest-environment jsdom
/**
 * P1542 review round 4: the in-room close's lifecycle, with the REAL CloseInRoom → CloseFlow.
 *  - R3: a close already finished (in another tab, after the room mounted) is reported to the room, which ticks;
 *  - R1: the room's Join after the thank-you (?join=1) opens the group terms;
 *  - R2: the close is drawn only while shown — no hidden copy left to act on the shell (the round-4 model: unmount, keep
 *    typed answers in the tab's storage, tick only on a persisted finish).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useOrgMembership: () => false,
}));
// Like the real hook, each instance reads the learning once, when it mounts (R4: a copy that never re-reads is stale).
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => {
  const { useState } = await import('react');
  return {
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => {
    const [learned] = useState(() => learnedRef.value);
    return { loading: false, error: false, learned, progress: { done: 3 }, minutes: 0, reload: vi.fn() };
  },
  loadTagPoints: vi.fn().mockResolvedValue([]),
  };
});

// The close flow itself is tested on its own (p1542-close-in-room.test.tsx); here, what it was given.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
const series = vi.hoisted(() => ({ slug: 'social-hike' as string | null, finished: true }));
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
  getCommunitySlug: vi.fn().mockResolvedValue('cm'),
  getSeriesPeople: vi.fn().mockResolvedValue(0),
  saveEventFeedback: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/app/data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/api')>()),
  getProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));
vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: {
    getOrganizationBySlug: vi.fn().mockResolvedValue({ id: 'org-1', slug: 'cm', name: 'Hikers · Chiang Mai', description: 'd' }),
    getMemberCounts: vi.fn().mockResolvedValue({ 'org-1': 7 }),
    getParticipation: vi.fn().mockResolvedValue({}),
  },
}));
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

const roomJoin = () => screen.queryAllByRole('button', { name: 'Join the group' }).find((b) => !b.closest('[data-testid="p1389-close"]'));

function mount() {
  return render(
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
}

describe('round 4: the kept-mounted close', () => {
  it('R3: a close finished elsewhere ticks the room as soon as the in-room close learns it', async () => {
    mount();
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('step-end')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('room-step-close-check')).toBeInTheDocument());
  });

  it('R1: after the thank-you, back in the room, its Join opens the group terms (?join=1 on a fresh close)', async () => {
    mount();
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('step-end')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }));
    // The ROOM's Join (its finished card), not the hidden close's own thank-you Join.
    await waitFor(() => expect(roomJoin()).toBeTruthy());
    fireEvent.click(roomJoin()!);
    await waitFor(() => expect(screen.getByTestId('community-terms')).toBeInTheDocument());
  });

  it('R2: under another room tab there is no hidden copy of the close left to act on the shell', async () => {
    mount();
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('step-end')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }));
    fireEvent.click(await waitFor(() => { const b = roomJoin(); expect(b).toBeTruthy(); return b!; }));
    await waitFor(() => expect(screen.getByTestId('community-terms')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('room-step-principle'));
    await waitFor(() => expect(screen.queryByTestId('p1389-close')).toBeNull());
    expect(screen.queryByTestId('community-terms')).toBeNull();
  });

  it('R4: thank-you Join (not learned) → the learning in the room → the terms; back, and Join again goes straight to the terms', async () => {
    learnedRef.value = false;
    mount();
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('step-end')).toBeInTheDocument());
    // The close's own thank-you Join (not the room's card).
    const closeJoin = (): HTMLElement => screen.getAllByRole('button', { name: 'Join the group' }).find((b) => b.closest('[data-testid="p1389-close"]'))!;
    fireEvent.click(closeJoin());
    // The learning, in the room; it completes on the server.
    fireEvent.click(await screen.findByRole('button', { name: 'learning finished' }));
    learnedRef.value = true;
    await waitFor(() => expect(screen.getByTestId('community-terms')).toBeInTheDocument());
    // Back from the terms to the thank-you (P1595: the terms' own "Not now" — in the room there is no second Back row);
    // Join again: straight to the terms, no second learning.
    expect(document.querySelector('[data-testid="room-learn-head"] [data-testid="header-back"]')).toBeNull();
    fireEvent.click(within(screen.getByTestId('terms-actions')).getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.getByTestId('step-end')).toBeInTheDocument());
    fireEvent.click(closeJoin());
    await waitFor(() => expect(screen.getByTestId('community-terms')).toBeInTheDocument());
    // No second learning: the (kept-mounted) learning stays hidden.
    expect(screen.getByRole('button', { name: 'learning finished', hidden: true }).closest('.hidden')).not.toBeNull();
  });
});

