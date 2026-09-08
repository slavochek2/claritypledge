/**
 * P1264 regression — event-to-event navigation must not carry the previous
 * event's organiser note (or its RSVP-gated group-chat URL) into the new page.
 *
 * Found by an adversarial review of the branch: both effects key on `eventId`
 * and set state only in `.then`, so between navigation and resolution the old
 * value is still rendered — and forever if the new request rejects. For the
 * group-chat URL that stale value is a gated invite link, which is why this is
 * asserted rather than tolerated as a flicker.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({ showUserMenu: false }),
}));

const mockGetEventBySlug = vi.fn();
const mockGetOrgFooterNote = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...a: unknown[]) => mockGetEventBySlug(...a),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => false,
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrgFooterNote: (...a: unknown[]) => mockGetOrgFooterNote(...a),
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

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function makeEvent(id: string, slug: string, title: string): EventWithHost {
  return {
    id, slug, title,
    description: 'A test event',
    datetime: FUTURE, durationMinutes: 60, timezone: 'America/Los_Angeles',
    location: '123 Main St, San Francisco, CA',
    hostId: 'host-user-id', hostName: 'Host', hostSlug: 'host', hostRole: 'Founder',
    hostAvatarColor: '#000', hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0,
    status: 'upcoming', createdAt: FUTURE, attendees: [],
  };
}

describe('P1264: org note does not survive navigation to another event', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('clears the previous org note while the new event\'s note is still loading', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });

    mockGetEventBySlug.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === 'event-a'
          ? makeEvent('id-a', 'event-a', 'Event A')
          : makeEvent('id-b', 'event-b', 'Event B')
      )
    );

    // Event A's org has a note and answers immediately. Event B's org request
    // never settles — the state the user is left staring at is the bug.
    mockGetOrgFooterNote.mockImplementation((eventId: string) =>
      eventId === 'id-a'
        ? Promise.resolve('Note belonging to org A')
        : new Promise(() => {})
    );

    // Navigate through the router rather than re-rendering with new
    // initialEntries: a fresh MemoryRouter REMOUNTS EventDetail, which resets
    // state and hides the very bug under test. Real slug-to-slug navigation
    // keeps the same component instance and only changes the param.
    let go: (to: string) => void = () => {};
    function Nav() {
      go = useNavigate();
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/events/event-a']}>
        <Nav />
        <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Event A')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('org-footer-note')).toHaveTextContent('Note belonging to org A')
    );

    await act(async () => { go('/events/event-b'); });

    await waitFor(() => expect(screen.getByText('Event B')).toBeInTheDocument());
    expect(screen.queryByTestId('org-footer-note')).toBeNull();
  });
});
