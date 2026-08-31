/**
 * P941 — Gate Meet link behind RSVP for online events.
 *
 * Tests the three scenarios from Done-When:
 *   - online + no RSVP      → gated prompt shown, Meet link hidden, calendar button hidden
 *   - online + RSVPed        → Meet link shown, calendar button shown
 *   - physical + no RSVP    → location shown as before (no gate)
 *
 * Also covers the host exemption: host (who never RSVPs their own event) always sees the link.
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
vi.mock('@/lib/markdown', () => ({ renderMarkdownSafe: (s: string) => s }));

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

import { EventDetail } from '@/app/prototypes/events/components/EventDetail';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

function makeEvent(overrides: Partial<EventWithHost> = {}): EventWithHost {
  return {
    id: 'event-1',
    slug: 'test-event',
    title: 'Test Event',
    description: 'A test event',
    datetime: FUTURE,
    durationMinutes: 60,
    timezone: 'America/Los_Angeles',
    location: 'https://meet.google.com/abc-defg-hij',
    hostId: 'host-user-id',
    hostName: 'Host',
    hostSlug: 'host',
    hostRole: 'Founder',
    hostAvatarColor: '#000',
    hostAvatarUrl: null,
    hostHasPledged: false,
    hostEarCount: 0,
    status: 'upcoming',
    createdAt: FUTURE,
    attendees: [],
    ...overrides,
  };
}

function renderEventDetail() {
  render(
    <MemoryRouter initialEntries={['/events/test-event']}>
      <Routes>
        <Route path="/events/:slug" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P941: RSVP-gated location for online events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('online + no RSVP → shows gated prompt, hides Meet link and calendar button', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', name: 'Visitor' }, session: {} });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    mockIsUserRsvpd.mockResolvedValue(false);

    renderEventDetail();

    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());

    // Gated prompt shown
    expect(screen.getByTestId('location-gated')).toBeInTheDocument();
    expect(screen.getByText('Register to receive the meeting link')).toBeInTheDocument();

    // Meet link NOT shown
    expect(screen.queryByTestId('location-link')).toBeNull();
    expect(screen.queryByText('Join online')).toBeNull();

    // Calendar button NOT shown
    expect(screen.queryByRole('button', { name: /add to calendar/i })).toBeNull();
  });

  it('online + RSVPed → shows Meet link and calendar button, no gated prompt', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', name: 'Attendee' }, session: {} });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    mockIsUserRsvpd.mockResolvedValue(true);

    renderEventDetail();

    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());

    // Meet link shown
    expect(screen.getByTestId('location-link')).toBeInTheDocument();
    expect(screen.getByText('Join online')).toBeInTheDocument();

    // Gated prompt NOT shown
    expect(screen.queryByTestId('location-gated')).toBeNull();
    expect(screen.queryByText('Register to receive the meeting link')).toBeNull();

    // Calendar button shown
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument();
  });

  it('physical event + no RSVP → shows address, no gated prompt, calendar button shown', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', name: 'Visitor' }, session: {} });
    mockGetEventBySlug.mockResolvedValue(
      makeEvent({ location: '123 Main St, San Francisco, CA' })
    );
    mockIsUserRsvpd.mockResolvedValue(false);

    renderEventDetail();

    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());

    // Location link shown (physical address)
    expect(screen.getByTestId('location-link')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, San Francisco, CA')).toBeInTheDocument();

    // Gated prompt NOT shown
    expect(screen.queryByTestId('location-gated')).toBeNull();

    // Calendar button shown (physical events are never gated)
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument();
  });

  it('host on own online event → sees Meet link even without RSVP', async () => {
    // Host user — id matches event.hostId
    mockUseAuth.mockReturnValue({ user: { id: 'host-user-id', name: 'Host' }, session: {} });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    // Host is never RSVPed to their own event
    mockIsUserRsvpd.mockResolvedValue(false);

    renderEventDetail();

    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());

    // Host sees the Meet link
    expect(screen.getByTestId('location-link')).toBeInTheDocument();
    expect(screen.getByText('Join online')).toBeInTheDocument();

    // Gated prompt NOT shown for host
    expect(screen.queryByTestId('location-gated')).toBeNull();
  });

  it('logged-out visitor on online event → sees gated prompt (not RSVPed)', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    // isUserRsvpd not called for logged-out users

    renderEventDetail();

    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());

    // Logged-out = not RSVPed → gated
    expect(screen.getByTestId('location-gated')).toBeInTheDocument();
    expect(screen.queryByTestId('location-link')).toBeNull();
    expect(screen.queryByRole('button', { name: /add to calendar/i })).toBeNull();
  });
});
