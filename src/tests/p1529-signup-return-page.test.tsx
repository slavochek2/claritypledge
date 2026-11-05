/**
 * P1529 (spec: a new user returning from sign-up sees the registration step): a person who signed up from the event page
 * (`?action=rsvp`) lands back on it signed in. In a flow that asks its questions before the seat, the step opens at once;
 * Clarity Night and Social Hike keep the one-tap page and the toast. Harness copied from p1365-rsvp-repeat-render.test.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

// ── Auth ──────────────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));

// ── Nav state ─────────────────────────────────────────────────────────────────
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({ showUserMenu: false }),
}));

// ── Events service ────────────────────────────────────────────────────────────
const mockGetEventBySlug = vi.fn();
const mockIsUserRsvpd = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
    isUserRsvpd: (...args: unknown[]) => mockIsUserRsvpd(...args),
    isEventFull: () => false,
    // P1194: EventDetail asks for the group chat link once the viewer is host or
    // RSVP'd. These fixtures carry no group chat — null is the honest answer.
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrganizer: vi.fn().mockResolvedValue(null), // P1553: fetched for every event now
    // P1264: EventDetail also asks for the org's standing footer note on every
    // event, regardless of RSVP state. These fixtures carry no org note.
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    getSpotsRemaining: vi.fn().mockReturnValue(null),
    rsvpToEvent: vi.fn(),
    cancelRsvp: vi.fn(),
    cancelEvent: vi.fn(),
    uncancelEvent: vi.fn(),
    updateEvent: vi.fn(),
  },
}));

// ── Analytics ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), identify: vi.fn() },
}));

// ── Markdown ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/markdown', () => ({ renderMarkdownSafe: (s: string) => s, renderEventDescription: (s: string) => s }));

// ── Toast ─────────────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── Heavy sub-components ──────────────────────────────────────────────────────
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
    bannerUrl: null,
    isLoading: false,
    handleRegenerate: vi.fn(),
    handleRemove: vi.fn(),
    handleSearch: vi.fn(),
    showSearch: false,
    searchError: null,
  }),
}));
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: () => null,
}));
vi.mock('@/app/prototypes/events/utils', () => ({
  formatTime: () => '10:00 AM',
  downloadICSFile: vi.fn(),
  getGoogleCalendarUrl: () => 'https://calendar.google.com/test',
  getOutlookUrl: () => 'https://outlook.live.com/test',
  getOffice365Url: () => 'https://outlook.office.com/test',
  getTimezoneLabel: () => 'PST',
}));


import { toast } from 'sonner';
import { EventDetail } from '@/app/prototypes/events/components/EventDetail';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const makeEvent = (over: Partial<EventWithHost> = {}): EventWithHost => ({
  id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event', datetime: FUTURE, durationMinutes: 60,
  timezone: 'Asia/Bangkok', location: 'Somewhere', hostId: 'host-user-id', hostName: 'Host', hostSlug: 'host', hostRole: 'Founder',
  hostAvatarColor: '#000', hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0, status: 'upcoming', createdAt: FUTURE,
  attendees: [], ...over,
} as EventWithHost);

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/test-event${search}`]}>
      <Routes>
        <Route path="/events/:slug" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1529: returning from sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'new-user' }, session: { user: { id: 'new-user' } } });
    mockIsUserRsvpd.mockResolvedValue(false);
  });

  it('opens the registration step at once in a flow that asks, and does not tell the person to find a button', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
    renderAt('?action=rsvp');
    expect(await screen.findByTestId('registration-submit')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('opens it for a series default as well as a host-chosen flow', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent({ seriesSlug: 'sales-mastermind' }));
    renderAt('?action=rsvp');
    expect(await screen.findByTestId('registration-submit')).toBeTruthy();
  });

  it('keeps Clarity Night one tap: the toast, no step', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    renderAt('?action=rsvp');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Account created')));
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });

  it('does not open the step for someone already registered', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
    mockIsUserRsvpd.mockResolvedValue(true);
    renderAt('?action=rsvp');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });

  it('opens nothing without the sign-up marker', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
    renderAt('');
    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });
});
