/**
 * P1272 canary — the event-room nav row in EventDetail ignores the event's
 * time state. It renders unconditionally with a hardcoded "Join now", so it
 * offers "Join now" on a cancelled event, on an event whose start was more
 * than EVENT_GRACE_HOURS ago, and on an event three weeks away.
 *
 * Asserts the user-visible symptom (which link the page offers), never the
 * mechanism. Access to /events/:slug/room is deliberately NOT tested here as
 * time-gated — it must stay reachable at every time state (spec Invariants);
 * only the row's label and presence change.
 *
 * Mock surface copied from p1264-stale-org-note-on-navigation.test.tsx.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({ showUserMenu: false }),
}));

const mockGetEventBySlug = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...a: unknown[]) => mockGetEventBySlug(...a),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => false,
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    rsvpToEvent: vi.fn(),
    cancelRsvp: vi.fn(),
    cancelEvent: vi.fn(),
    uncancelEvent: vi.fn(),
    updateEvent: vi.fn(),
  },
}));

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/shared/mobile-tooltip', () => ({
  MobileTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/app/components/shared/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/app/components/shared/PersonRow', () => ({ PersonRow: () => null }));
vi.mock('@/components/ui/person-avatar', () => ({ PersonAvatar: () => null }));
vi.mock('@/app/components/shared/banner', () => ({
  BannerDisplay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BannerControls: () => null,
  useBanner: () => ({
    bannerUrl: null, isLoading: false, handleRegenerate: vi.fn(),
    handleRemove: vi.fn(), handleSearch: vi.fn(), showSearch: false, searchError: null,
  }),
}));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ extractBannerKeywords: () => null }));
vi.mock('@/app/prototypes/events/utils', () => ({
  formatTime: () => '10:00 AM',
  downloadICSFile: vi.fn(),
  getGoogleCalendarUrl: () => 'https://calendar.google.com/test',
  getOutlookUrl: () => 'https://outlook.live.com/test',
  getOffice365Url: () => 'https://outlook.office.com/test',
  getTimezoneLabel: () => 'PST',
}));

import { EventDetail } from '@/app/prototypes/events/components/EventDetail';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function makeEvent(over: Partial<EventWithHost> = {}): EventWithHost {
  return {
    id: 'id-a', slug: 'event-a', title: 'Event A',
    description: 'A test event',
    datetime: new Date(Date.now() + 21 * 24 * HOUR).toISOString(),
    durationMinutes: 90,
    timezone: 'America/Los_Angeles',
    location: '123 Main St, San Francisco, CA',
    hostId: 'host-user-id', hostName: 'Host', hostSlug: 'host', hostRole: 'Founder',
    hostAvatarColor: '#000', hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0,
    status: 'upcoming', createdAt: new Date().toISOString(), attendees: [],
    ...over,
  };
}

/** Renders the page and waits for the event to have loaded. */
async function renderEvent(event: EventWithHost) {
  mockUseAuth.mockReturnValue({ user: null, session: null });
  mockGetEventBySlug.mockResolvedValue(event);
  render(
    <MemoryRouter initialEntries={['/events/event-a']}>
      <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText('Event A')).toBeInTheDocument());
}

/** Every link pointing at the room route, whatever it is labelled. */
function roomLinks() {
  return screen.queryAllByRole('link').filter(
    (el) => el.getAttribute('href') === '/events/event-a/room'
  );
}

describe('P1272: the room nav row must reflect the event time state', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('reads "Event Room", not "Join now", for an event three weeks away', async () => {
    await renderEvent(makeEvent());
    const links = roomLinks();
    expect(links, 'no link to the room route rendered at all').toHaveLength(1);
    expect(links[0].textContent?.trim()).toBe('Event Room');
  });

  it('reads "Join now" inside the last hour before the start', async () => {
    await renderEvent(makeEvent({ datetime: new Date(Date.now() + 30 * MIN).toISOString() }));
    const links = roomLinks();
    expect(links).toHaveLength(1);
    expect(links[0].textContent?.trim()).toBe('Join now');
  });

  // The two cases below straddle the T-1h threshold itself. The 30-minute case above
  // sits well inside the window and would still pass if the boundary were wrong by
  // tens of minutes; these would not. Neither mocks the clock: at exactly T-1h the
  // real clock advancing during render only pushes further INTO the window, and the
  // 61-minute case has a full minute of margin before it could flip.
  it('reads "Join now" at exactly the T-1h boundary instant', async () => {
    await renderEvent(makeEvent({ datetime: new Date(Date.now() + 60 * MIN).toISOString() }));
    expect(roomLinks()[0].textContent?.trim()).toBe('Join now');
  });

  it('still reads "Event Room" one minute before the window opens (T-61min)', async () => {
    await renderEvent(makeEvent({ datetime: new Date(Date.now() + 61 * MIN).toISOString() }));
    expect(roomLinks()[0].textContent?.trim()).toBe('Event Room');
  });

  it('still reads "Join now" 20 minutes after a 90-minute event ended (past hasEnded, before isPast)', async () => {
    // Started 110 min ago, 90-min duration: hasEnded is true, isPast is not.
    // The room stays offered — a facilitator may still be debriefing.
    await renderEvent(makeEvent({ datetime: new Date(Date.now() - 110 * MIN).toISOString() }));
    const links = roomLinks();
    expect(links).toHaveLength(1);
    expect(links[0].textContent?.trim()).toBe('Join now');
  });

  it('offers no room link at all on a cancelled event', async () => {
    await renderEvent(makeEvent({ status: 'cancelled' }));
    expect(roomLinks(), 'a cancelled event still offers the room row').toHaveLength(0);
  });

  it('offers no room link once the event is past the grace window', async () => {
    const started = Date.now() - (EVENT_GRACE_HOURS + 1) * HOUR;
    await renderEvent(makeEvent({ datetime: new Date(started).toISOString() }));
    expect(roomLinks(), 'a finished event still offers the room row').toHaveLength(0);
  });
});
