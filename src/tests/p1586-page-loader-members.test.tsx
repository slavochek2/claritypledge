// @vitest-environment jsdom
/**
 * P1586 §2 "Page → ClarityPageLoader": the event-room family, the event pages and the compare
 * page. Each member's loading branch renders the one page loader, with no "Loading" text and
 * no blank (null) frame.
 *
 * Rendered inside InShellContentContext so the loader is `data-testid="content-loader"`; the
 * `.clarity-page-loader` class is shared with the boot splash, so the same check holds outside
 * the shell.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { InShellContentContext } from '@/components/ui/loader-context';

// ── shared collaborators ──
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/use-nav-auth-state', () => ({ useNavAuthState: () => ({ showUserMenu: false }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── event-room family ──
const room = vi.hoisted(() => ({
  access: {
    slug: 'night-2',
    event: null as null | { id: string; slug: string },
    loading: false,
    granted: true,
    isLoggedIn: true,
    offline: false,
  },
  selfLoading: false,
  arrivalGate: false as boolean | null,
  prepGate: false as boolean | null,
}));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({
    self: null,
    loading: room.selfLoading,
    refresh: vi.fn().mockResolvedValue(true),
    runSelfWrite: vi.fn(),
  }),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({
  useRoomPrepGate: () => ({ gate: room.prepGate }),
  PrepRoomGate: () => <p data-testid="prep-gate" />,
  PrepRoomBanner: () => null,
}));
vi.mock('@/app/prototypes/events/arrival/ArrivalGate', () => ({
  useArrivalGate: () => ({ gate: room.arrivalGate, answered: () => {} }),
  ArrivalQuestion: () => <p data-testid="arrival-question" />,
}));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ isCapturingForEvent: () => false, barVisible: false }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useOfflineStripShown: () => false,
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflinePageReport: () => {},
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn(() => new Promise(() => {})),
  setRoomReadiness: vi.fn(),
  subscribeToRoomRoster: vi.fn(() => () => {}),
}));
vi.mock('@/app/prototypes/events/rounds/RoomSteps', () => ({ RoomSteps: () => null }));

// ── event pages ──
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: vi.fn(() => new Promise(() => {})),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => false,
    cancelRsvp: vi.fn(),
    createEvent: vi.fn(),
  },
}));

// ── compare page ──
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/app/data/compare-service', () => ({
  getTagStatements: vi.fn(),
  getPositionsFor: vi.fn(),
  getSharedTags: vi.fn(),
  getAnsweredTags: vi.fn(),
}));

import { EventRoomGate } from '@/app/prototypes/events/components/EventRoomGate';
import { EventRoomReady } from '@/app/prototypes/events/components/EventRoomReady';
import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';
import { EventArrivingPage } from '@/app/prototypes/events/arrival/EventArrivingPage';
import { EventDetail } from '@/app/prototypes/events/components/EventDetail';
import { CreateEvent } from '@/app/prototypes/events/components/CreateEvent';
import { ComparePage } from '@/app/pages/compare-page';

function mount(path: string, route: string, element: ReactNode) {
  return render(
    <InShellContentContext.Provider value={true}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </InShellContentContext.Provider>,
  );
}

/** The loading branch is the page loader: the mark, no "Loading" text, not blank. */
function expectPageLoader(container: HTMLElement) {
  expect(container.firstChild, 'a blank frame while loading').not.toBeNull();
  expect(screen.getByTestId('content-loader')).toBeTruthy();
  expect(container.querySelector('.clarity-page-loader')).not.toBeNull();
  expect(screen.queryByText(/loading/i), 'no "Loading" text').toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  room.access = { slug: 'night-2', event: null, loading: true, granted: true, isLoggedIn: true, offline: false };
  room.selfLoading = false;
  room.arrivalGate = false;
  room.prepGate = false;
  mockUseAuth.mockReturnValue({
    user: null,
    session: null,
    isLoading: false,
    sessionChecked: true,
  });
});

describe('P1586 §2 — event room: no blank frame while loading', () => {
  const EVENT = { id: 'ev-1', slug: 'night-2' };

  it('EventRoomGate: the access read pending shows the page loader', () => {
    const { container } = mount('/events/night-2/room', '/events/:slug/room', <EventRoomGate />);
    expectPageLoader(container);
  });

  it('EventRoomGate: the arrival gate unknown shows the page loader', () => {
    room.access = { ...room.access, loading: false, event: EVENT };
    room.arrivalGate = null;
    const { container } = mount('/events/night-2/room', '/events/:slug/room', <EventRoomGate />);
    expectPageLoader(container);
  });

  it('EventRoomGate: the prep gate unknown shows the page loader', () => {
    room.access = { ...room.access, loading: false, event: EVENT };
    room.prepGate = null;
    const { container } = mount('/events/night-2/room', '/events/:slug/room', <EventRoomGate />);
    expectPageLoader(container);
  });

  it('EventRoomGate: the room self read pending shows the page loader', () => {
    room.access = { ...room.access, loading: false, event: EVENT };
    room.selfLoading = true;
    const { container } = mount('/events/night-2/room', '/events/:slug/room', <EventRoomGate />);
    expectPageLoader(container);
  });

  it('EventRoomReady: the access read pending shows the page loader', () => {
    const { container } = mount('/events/night-2/ready', '/events/:slug/ready', <EventRoomReady />);
    expectPageLoader(container);
  });

  it('EventRoomReady: the room self read pending shows the page loader', () => {
    room.access = { ...room.access, loading: false, event: EVENT };
    room.selfLoading = true;
    const { container } = mount('/events/night-2/ready', '/events/:slug/ready', <EventRoomReady />);
    expectPageLoader(container);
  });

  it('EventRoomMeet: the access read pending shows the page loader', () => {
    const { container } = mount('/events/night-2/meet', '/events/:slug/meet', <EventRoomMeet />);
    expectPageLoader(container);
  });

  it('EventRoomMeet: the room self read pending shows the page loader', () => {
    room.access = { ...room.access, loading: false, event: EVENT };
    room.selfLoading = true;
    const { container } = mount('/events/night-2/meet', '/events/:slug/meet', <EventRoomMeet />);
    expectPageLoader(container);
  });

  it('EventArrivingPage: the access read pending shows the page loader', () => {
    const { container } = mount('/events/night-2/arriving', '/events/:slug/arriving', <EventArrivingPage />);
    expectPageLoader(container);
  });
});

describe('P1586 §2 — event pages and compare: the page loader, not the word Loading', () => {
  it('EventDetail: the event read pending shows the page loader', () => {
    const { container } = mount('/events/night-2', '/events/:slug', <EventDetail />);
    expectPageLoader(container);
  });

  it('CreateEvent: the auth check pending shows the page loader', () => {
    mockUseAuth.mockReturnValue({ user: null, session: null, isLoading: true, sessionChecked: false });
    const { container } = mount('/events/create', '/events/create', <CreateEvent />);
    expectPageLoader(container);
  });

  it('ComparePage: the auth check pending shows the page loader', () => {
    mockUseAuth.mockReturnValue({ user: null, session: null, isLoading: true, sessionChecked: false });
    const { container } = mount('/compare/ben-tan', '/compare/:slug', <ComparePage />);
    expectPageLoader(container);
  });

  it('ComparePage: the base read pending (signed in) shows the page loader', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'viewer-1', name: 'Viewer', hasPledged: false },
      session: null,
      isLoading: false,
      sessionChecked: true,
    });
    const { container } = mount('/compare/ben-tan', '/compare/:slug', <ComparePage />);
    expectPageLoader(container);
  });
});
