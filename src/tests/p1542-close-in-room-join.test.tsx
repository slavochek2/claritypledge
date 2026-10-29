// @vitest-environment jsdom
/**
 * P1542 review round 3 (G, claimed by a reviewer, believed false): a cold /meet?view=feedback&join=1 for a learned
 * non-member lands on the group terms — the step starts at 'join' from the URL and waits for the group to load, and
 * ?join=1 is not stripped before it does. (Shares p1542-close-in-room.test.tsx's harness.) Earlier note:
 * P1542 founder UAT round: the close drawn INSIDE the event room (?view=feedback, CloseInRoom). The sequence is the
 * /close page's own (CloseFlow, unchanged); only its frame differs:
 *  - its step header goes into the room's sticky head (the slot the room gives it), never a second fixed bar;
 *  - its ways out (Back from the first question) return to the room;
 *  - the URL stays the room's: no ?done=1, the room's entry state kept, and a left ?join=1 dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@/app/prototypes/events/use-event-community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/use-event-community')>()),
  useOrgMembership: () => false,
}));
vi.mock('@/app/data/points-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/data/points-service')>();
  return { ...actual, pointsService: { ...actual.pointsService, getPublicPointsFeed: vi.fn().mockResolvedValue([]) } };
});
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => ({ loading: false, error: false, learned: true, progress: { done: 3 }, minutes: 0, reload: vi.fn(), stepsDone: [], plan: [] }),
  loadTagPoints: vi.fn().mockResolvedValue([]),
}));


import { CloseInRoom } from '@/app/prototypes/events/close/CloseInRoom';

const event = {
  id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
  durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
  statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: 'social-hike', orgId: 'org-1',
} as never;

function Loc() {
  const l = useLocation();
  return <i data-testid="loc" data-search={l.search} />;
}

beforeEach(() => {
  sessionStorage.clear();
  auth.value = { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
  series.finished = true;
});

describe('G: a cold in-room ?join=1', () => {
  it('a learned non-member lands on the group terms, and ?join=1 stays while they are shown', async () => {
    // Round 4: the close reads its starting step from the router (no address-bar stand-in needed any more).
    window.history.replaceState({}, '', '/');
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/events/walk/meet', search: '?view=feedback&join=1', state: { fromEvent: true } }]}>
        <Routes>
          <Route path="/events/:slug/meet" element={<><CloseInRoom event={event} viewerId="u1" room={{ headSlot: slot, leave: vi.fn() }} /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('community-terms')).toBeInTheDocument());
    expect(new URLSearchParams(screen.getByTestId('loc').dataset.search).get('join')).toBe('1');
  });
});
