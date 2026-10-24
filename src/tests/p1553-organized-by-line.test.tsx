/**
 * P1553 — every event with a community shows "Organized by <community>" under the title;
 * events without one show nothing; hikes keep the line in the same place.
 * Harness mirrors p1414-event-topic-vote.test.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/use-nav-auth-state', () => ({ useNavAuthState: () => ({ showUserMenu: false }) }));

const mockGetEventBySlug = vi.fn();
const mockGetEventOrganizer = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...a: unknown[]) => mockGetEventBySlug(...a),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => false,
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    getSeriesContent: vi.fn().mockResolvedValue({ reviews: [], photos: [] }),
    getEventOrganizer: (...a: unknown[]) => mockGetEventOrganizer(...a),
  },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('@/lib/markdown', () => ({ renderMarkdownSafe: (s: string) => s, renderEventDescription: (s: string) => s }));
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
  useBanner: () => ({ bannerUrl: null, isLoading: false, handleRegenerate: vi.fn(), handleRemove: vi.fn(), handleSearch: vi.fn(), showSearch: false, searchError: null }),
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
function makeEvent(overrides: Partial<EventWithHost> = {}): EventWithHost {
  return {
    id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event',
    datetime: FUTURE, durationMinutes: 60, timezone: 'America/Los_Angeles',
    location: 'https://meet.google.com/abc-defg-hij', hostId: 'host-user-id', hostName: 'Host',
    hostSlug: 'host', hostRole: 'Founder', hostAvatarColor: '#000', hostAvatarUrl: null,
    hostHasPledged: false, hostEarCount: 0, status: 'upcoming', createdAt: FUTURE, attendees: [],
    ...overrides,
  };
}
function renderEvent(event: EventWithHost) {
  mockGetEventBySlug.mockResolvedValue(event);
  return render(
    <MemoryRouter initialEntries={[`/events/${event.slug}`]}>
      <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: null, session: null, isLoading: false });
});

describe('P1553 organized-by line', () => {
  it('a non-hike event with a community shows the linked line right after the title', async () => {
    mockGetEventOrganizer.mockResolvedValue({ name: 'Sales Mastermind', slug: 'sales-mastermind' });
    renderEvent(makeEvent());
    const line = await screen.findByTestId('hike-organizer');
    expect(line.textContent).toContain('Organized by');
    const link = line.querySelector('a');
    expect(link?.textContent).toBe('Sales Mastermind');
    expect(link?.getAttribute('href')).toBe('/groups/sales-mastermind');
    const h1 = screen.getByRole('heading', { level: 1 });
    // the line follows the title row (h1 wrapper) directly
    expect(h1.parentElement?.nextElementSibling).toBe(line);
  });

  it('an event with no community shows no line', async () => {
    mockGetEventOrganizer.mockResolvedValue(null);
    renderEvent(makeEvent());
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(mockGetEventOrganizer).toHaveBeenCalledWith('event-1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('hike-organizer')).toBeNull();
  });

  it('a hike still shows the line in the same place', async () => {
    mockGetEventOrganizer.mockResolvedValue({ name: 'Clarity Munich', slug: 'clarity-munich' });
    renderEvent(makeEvent({ seriesSlug: 'social-hike', location: 'Chiang Mai' }));
    const line = await screen.findByTestId('hike-organizer');
    expect(line.querySelector('a')?.getAttribute('href')).toBe('/groups/clarity-munich');
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.nextElementSibling).toBe(line);
  });
});
