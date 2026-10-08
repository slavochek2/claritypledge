/**
 * P1441 UAT finding (visual QA): after a successful "Can't make it", the person who cancelled was
 * still listed under Participants until a reload — the page showed "Reserve a seat" and the
 * cancelled person's row at the same time. The count must drop with the cancel.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
const mockCancelRsvp = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
    isUserRsvpd: (...args: unknown[]) => mockIsUserRsvpd(...args),
    isEventFull: () => false,
    // P1194: EventDetail asks for the group chat link once the viewer is host or
    // RSVP'd. These fixtures carry no group chat — null is the honest answer.
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    // P1264: EventDetail also asks for the org's standing footer note on every
    // event, regardless of RSVP state. These fixtures carry no org note.
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    rsvpToEvent: vi.fn(),
    cancelRsvp: (...args: unknown[]) => mockCancelRsvp(...args),
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
// The cancel confirmation must be clickable here: render its confirm button while open.
vi.mock('@/app/components/shared/confirm-dialog', () => ({
  ConfirmDialog: ({ open, confirmLabel, onConfirm }: { open: boolean; confirmLabel: string; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>{confirmLabel}</button> : null,
}));
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


const VIEWER = 'viewer-id-1441';

const event = {
  id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event',
  datetime: FUTURE, durationMinutes: 60, timezone: 'America/Los_Angeles', location: 'Somewhere',
  hostId: 'host-user-id', hostName: 'Host', hostSlug: 'host', hostRole: 'Founder', hostAvatarColor: '#000',
  hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0, status: 'upcoming', createdAt: FUTURE,
  attendees: [
    { profileId: VIEWER, name: 'Viewer', slug: 'viewer', hasPledged: false } as never,
    { profileId: 'someone-else', name: 'Other', slug: 'other', hasPledged: false } as never,
  ],
} as unknown as EventWithHost;

describe('P1441: cancelling removes you from Participants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: VIEWER, slug: 'viewer' }, session: { user: { id: VIEWER } } });
    mockGetEventBySlug.mockResolvedValue(event);
    mockIsUserRsvpd.mockResolvedValue(true);
  });

  it('drops the canceller from the list as soon as the cancel succeeds', async () => {
    mockCancelRsvp.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/events/test-event']}>
        <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Participants \(2/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Can't make it/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: "I can't go" }));
    await waitFor(() => expect(screen.getByText(/Participants \(1/)).toBeInTheDocument());
  });

  it('keeps the list unchanged when the cancel fails', async () => {
    mockCancelRsvp.mockResolvedValue(false);
    render(
      <MemoryRouter initialEntries={['/events/test-event']}>
        <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Participants \(2/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Can't make it/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: "I can't go" }));
    await waitFor(() => expect(mockCancelRsvp).toHaveBeenCalled());
    expect(screen.getByText(/Participants \(2/)).toBeInTheDocument();
  });
});
