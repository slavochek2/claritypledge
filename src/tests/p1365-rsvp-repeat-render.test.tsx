/**
 * P1365 — EventDetail wiring for the desktop RSVP repeat: the height gate is
 * actually applied, and a click records its own analytics trigger.
 * jsdom has no layout, so the description's height is stubbed; the real geometry
 * is covered by e2e/p1365-rsvp-repeat.spec.ts. Harness copied from
 * p941-location-gate.test.tsx.
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
    // P1264: EventDetail also asks for the org's standing footer note on every
    // event, regardless of RSVP state. These fixtures carry no org note.
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
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

import { fireEvent } from '@testing-library/react';
import { analytics } from '@/lib/mixpanel';

function stubDescriptionHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.classList.contains('event-description') ? height : 0;
    return { height: h, width: 0, top: 0, left: 0, right: 0, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

function renderAt(slug = 'test-event') {
  render(
    <MemoryRouter initialEntries={[`/events/${slug}`]}>
      <Routes>
        <Route path="/events/:slug" element={<EventDetail />} />
        <Route path="/signup" element={<div>signup page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('P1365: desktop RSVP repeat wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, session: null });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    mockIsUserRsvpd.mockResolvedValue(false);
  });

  it('renders the repeat when the description is taller than the viewport', async () => {
    stubDescriptionHeight(window.innerHeight + 1);
    renderAt();
    expect(await screen.findByTestId('rsvp-button-repeat')).toHaveTextContent('Reserve your seat');
  });

  it('does not render the repeat when the description fits in the viewport', async () => {
    stubDescriptionHeight(window.innerHeight - 1);
    renderAt();
    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());
    expect(screen.queryByTestId('rsvp-button-repeat')).toBeNull();
  });

  it('logged out: a click tracks trigger card_bottom and goes to signup', async () => {
    stubDescriptionHeight(window.innerHeight + 1);
    renderAt();
    fireEvent.click(await screen.findByTestId('rsvp-button-repeat'));
    expect(analytics.track).toHaveBeenCalledWith('event_rsvp_initiated', { event_id: 'event-1', trigger: 'card_bottom' });
    expect(await screen.findByText('signup page')).toBeInTheDocument();
  });
});
