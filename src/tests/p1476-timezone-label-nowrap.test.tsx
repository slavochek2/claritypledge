/**
 * P1476 visual QA — the parenthesised timezone label must wrap as one unit.
 * At 375px the label broke at its hyphen ("(UTC-" / "8 Los Angeles)"), which
 * separated the minus sign from its digit, so it read as a positive offset.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null }) }));
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
// getTimezoneLabel stays real, so this also proves the page passes the event's date.
vi.mock('@/app/prototypes/events/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/utils')>()),
  downloadICSFile: vi.fn(),
}));

import { EventDetail } from '@/app/prototypes/events/components/EventDetail';

// A future July instant: Los Angeles is on daylight time (UTC-7).
const SUMMER_LA = '2027-07-15T18:00:00-07:00';

function makeEvent(): EventWithHost {
  return {
    id: 'id-a', slug: 'event-a', title: 'Event A',
    description: 'A test event',
    datetime: SUMMER_LA, durationMinutes: 60, timezone: 'America/Los_Angeles',
    location: '123 Main St, San Francisco, CA',
    hostId: 'host-user-id', hostName: 'Host', hostSlug: 'host', hostRole: 'Founder',
    hostAvatarColor: '#000', hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0,
    status: 'upcoming', createdAt: SUMMER_LA, attendees: [],
  };
}

describe('P1476: in-person timezone label wraps as one unit', () => {
  it('renders "(UTC-7 Los Angeles)" in its own whitespace-nowrap element', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent());

    render(
      <MemoryRouter initialEntries={['/events/event-a']}>
        <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Event A')).toBeInTheDocument());

    const label = screen.getByText('(UTC-7 Los Angeles)');
    expect(label).toHaveClass('whitespace-nowrap');
  });
});
