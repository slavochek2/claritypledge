/**
 * P1512 → P1551 — the event page no longer offers "Open chat" (founder 2026-10-23). The chat harness stays
 * so the absence is proven with the chat mounted and the event channel in the list.
 */
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
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

import { ChatContext } from '@/app/pages/chat/chat-state';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const event = {
  id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event', datetime: FUTURE, durationMinutes: 60,
  timezone: 'America/Los_Angeles', location: 'https://meet.google.com/abc-defg-hij', hostId: 'host-user-id', hostName: 'Host',
  hostSlug: 'host', hostRole: 'Founder', hostAvatarColor: '#000', hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0,
  status: 'upcoming', createdAt: FUTURE, attendees: [],
} as unknown as EventWithHost;

const eventChannel = { conversationId: 'conv-evt', kind: 'event', event: { id: 'event-1', slug: 'test-event', title: 'Test Event', datetime: FUTURE } };

function renderAt(chats: unknown[] = [eventChannel]) {
  const ctx = { chats, refresh: vi.fn().mockResolvedValue(chats), goToChat: vi.fn() } as unknown as ChatContextValue;
  render(
    <ChatContext.Provider value={ctx}>
      <MemoryRouter initialEntries={['/events/test-event']}>
        <Routes>
          <Route path="/events/:slug" element={<EventDetail />} />
        </Routes>
      </MemoryRouter>
    </ChatContext.Provider>,
  );
}

function expectNoOpenChat() {
  expect(screen.queryByText('Open chat')).toBeNull();
  expect(screen.queryByTestId('event-open-chat')).toBeNull();
}

// P1551 (founder 2026-10-23): the event page no longer offers Open chat to anyone. Event chats stay
// reachable from the inbox; group pages keep theirs (p1512-org-open-chat.test.tsx).
describe('P1551: event page has no Open chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEventBySlug.mockResolvedValue(event);
    mockIsUserRsvpd.mockResolvedValue(false);
  });

  it('is absent for a signed-out visitor and a signed-in viewer who has not RSVPd', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderAt();
    await screen.findByText('Test Event');
    expectNoOpenChat();
    cleanup();
    mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, session: {} });
    renderAt();
    await screen.findByText('Test Event');
    expectNoOpenChat();
  });

  it('is absent for an RSVPd viewer, even with the event channel in the chat list', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, session: {} });
    mockIsUserRsvpd.mockResolvedValue(true);
    renderAt();
    await screen.findByText('Test Event');
    await waitFor(() => expect(mockIsUserRsvpd).toHaveBeenCalled());
    await act(async () => {});
    expectNoOpenChat();
  });

  it('is absent for the host', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'host-user-id' }, session: {} });
    renderAt();
    await screen.findByText('Test Event');
    await act(async () => {});
    expectNoOpenChat();
  });
});
