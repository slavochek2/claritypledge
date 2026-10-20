/**
 * P1512 — the event page's "Open chat": host and RSVP'd viewers only, and it opens the event's channel in Home
 * (or Home while the channel is not in the chat list yet). Harness copied from p1365-rsvp-repeat-render.test.tsx.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

import { fireEvent } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { chatNav } from '@/app/pages/chat/chat-view-model';
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

// The real navigation rule (chatNav), acting from wherever the page is.
let goToChatReal: ChatContextValue['goToChat'] = () => 'none';
function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  goToChatReal = (to, intent = 'open') => {
    const plan = chatNav({ pathname: location.pathname, state: location.state }, to, intent);
    if (plan.mode !== 'none') navigate(to, { replace: plan.mode === 'replace', state: plan.state });
    return plan.mode;
  };
  return <div data-testid="state">{JSON.stringify(location.state)}</div>;
}

function renderAt(chats: unknown[] = [eventChannel], withChat = true) {
  const ctx = { chats, refresh: vi.fn().mockResolvedValue(chats), goToChat: (to: string, intent?: 'open' | 'redirect' | 'follow') => goToChatReal(to, intent) } as unknown as ChatContextValue;
  const page = (
    <MemoryRouter initialEntries={['/events/test-event']}>
      <Nav />
      <Routes>
        <Route path="/events/:slug" element={<EventDetail />} />
        <Route path="/home/c/:id" element={<div>chat opened</div>} />
        <Route path="/home" element={<div>home opened</div>} />
      </Routes>
    </MemoryRouter>
  );
  render(withChat ? <ChatContext.Provider value={ctx}>{page}</ChatContext.Provider> : page);
}

describe('P1512: event page Open chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEventBySlug.mockResolvedValue(event);
    mockIsUserRsvpd.mockResolvedValue(false);
  });

  it('is hidden for a visitor who is signed out, and for a signed-in viewer who has not RSVPd', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderAt();
    await screen.findByText('Test Event');
    expect(screen.queryByTestId('event-open-chat')).toBeNull();
    cleanup();
    mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, session: {} });
    renderAt();
    await screen.findByText('Test Event');
    expect(screen.queryByTestId('event-open-chat')).toBeNull();
  });

  it('is shown to an RSVPd viewer and opens the event channel', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, session: {} });
    mockIsUserRsvpd.mockResolvedValue(true);
    renderAt();
    fireEvent.click(await screen.findByTestId('event-open-chat'));
    expect(await screen.findByText('chat opened')).toBeInTheDocument();
    // On top of the event page: the state carries a way back to it.
    expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toEqual({ below: ['from'] });
  });

  it('is shown to the host, and falls back to Home while the channel is not in the list', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'host-user-id' }, session: {} });
    renderAt([]);
    fireEvent.click(await screen.findByTestId('event-open-chat'));
    expect(await screen.findByText('home opened')).toBeInTheDocument();
  });

  it('is not offered where chat is not mounted', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'host-user-id' }, session: {} });
    renderAt([], false);
    await screen.findByText('Test Event');
    expect(screen.queryByTestId('event-open-chat')).toBeNull();
  });
});
