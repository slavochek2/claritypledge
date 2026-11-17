/**
 * P1700: a person the host removed sees a calm notice in place of the Register action; a cancelled event keeps its cancelled
 * state; a stale-tab refusal re-reads the removal status and shows the notice; other failures do not.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
// The offline guard reads a shared reachability flag other mocked calls can trip; this file is about the notice, not connectivity.
vi.mock('@/app/hooks/use-online-write-guard', async (orig) => ({
  ...(await orig<typeof import('@/app/hooks/use-online-write-guard')>()),
  useOnlineWriteGuard: () => () => true,
}));
vi.mock('@/hooks/use-nav-auth-state', () => ({ useNavAuthState: () => ({ showUserMenu: false }) }));

const fullEvent = vi.hoisted(() => ({ value: false }));
const mockGetEventBySlug = vi.fn();
const mockRsvpToEvent = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => fullEvent.value,
    getSpotsRemaining: () => null,
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrganizer: vi.fn().mockResolvedValue(null),
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    rsvpToEvent: (...a: unknown[]) => mockRsvpToEvent(...a),
    cancelRsvp: vi.fn(),
    cancelEvent: vi.fn(),
    uncancelEvent: vi.fn(),
    updateEvent: vi.fn(),
  },
}));
const mockGetMyEventRemoval = vi.fn();
const mockJoinWaitlist = vi.fn();
vi.mock('@/app/data/event-waitlist', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-waitlist')>()),
  getMyEventRemoval: (...a: unknown[]) => mockGetMyEventRemoval(...a),
  joinWaitlist: (...a: unknown[]) => mockJoinWaitlist(...a),
  getMyWaitlistEntry: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { listSharedWithEvent: vi.fn().mockResolvedValue([]), removeEventAttendee: vi.fn() },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('@/lib/markdown', () => ({ renderMarkdownSafe: (s: string) => s, renderEventDescription: (s: string) => s }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/app/components/shared/mobile-tooltip', () => ({
  MobileTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/app/components/shared/banner', () => ({
  BannerDisplay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BannerControls: () => null,
  useBanner: () => ({ bannerUrl: null, isLoading: false, handleRegenerate: vi.fn(), handleRemove: vi.fn(), handleSearch: vi.fn(), showSearch: false, searchError: null }),
}));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ extractBannerKeywords: () => null }));
vi.mock('@/app/prototypes/events/utils', () => ({
  formatTime: () => '10:00 AM', downloadICSFile: vi.fn(),
  getGoogleCalendarUrl: () => 'https://calendar.google.com/test', getOutlookUrl: () => 'https://outlook.live.com/test',
  getOffice365Url: () => 'https://outlook.office.com/test', getTimezoneLabel: () => 'PST',
}));

import { EventDetail } from '@/app/prototypes/events/components/EventDetail';
import { _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

const NOTICE = 'The host cancelled your registration for this event.';
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const makeEvent = (status = 'upcoming') => ({
  id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event',
  datetime: FUTURE, durationMinutes: 60, timezone: 'America/Los_Angeles', location: 'Somewhere',
  hostId: 'host-user-id', hostName: 'Hosty', hostSlug: 'host', hostRole: 'Founder', hostAvatarColor: '#000',
  hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0, status, createdAt: FUTURE,
  attendees: [],
}) as unknown as EventWithHost;

const open = () => render(
  <MemoryRouter initialEntries={['/events/test-event']}>
    <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  _resetNetworkOutcomeForTesting();
  mockUseAuth.mockReturnValue({ user: { id: 'r-1', slug: 'rita' }, session: { user: { id: 'r-1' } } });
  mockGetEventBySlug.mockResolvedValue(makeEvent());
  mockGetMyEventRemoval.mockReset(); // clears queued once-values and implementations left by an earlier test
  mockJoinWaitlist.mockReset();
  mockGetMyEventRemoval.mockResolvedValue(false);
  fullEvent.value = false;
});

describe('removed viewer', () => {
  it('sees the exact notice and no Register button', async () => {
    mockGetMyEventRemoval.mockResolvedValue(true);
    open();
    await waitFor(() => expect(screen.getAllByText(NOTICE).length).toBeGreaterThan(0));
    expect(screen.queryByTestId('rsvp-button')).toBeNull();
    expect(mockGetMyEventRemoval).toHaveBeenCalledWith('event-1');
  });

  it('a viewer who was not removed still sees Register', async () => {
    open();
    await waitFor(() => expect(screen.getAllByTestId('rsvp-button').length).toBeGreaterThan(0));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('a cancelled event shows the cancelled state, not the notice', async () => {
    mockGetMyEventRemoval.mockResolvedValue(true);
    mockGetEventBySlug.mockResolvedValue(makeEvent('cancelled'));
    open();
    await waitFor(() => expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('stale tab', () => {
  it('a refused registration that the status read confirms as removal shows the notice', async () => {
    mockRsvpToEvent.mockResolvedValue(false);
    open();
    const btns = await screen.findAllByTestId('rsvp-button');
    mockGetMyEventRemoval.mockResolvedValue(true); // removed after the page loaded
    fireEvent.click(btns[0]);
    await waitFor(() => expect(screen.getAllByText(NOTICE).length).toBeGreaterThan(0));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a different failure (status read false) does not show the notice', async () => {
    mockRsvpToEvent.mockResolvedValue(false);
    open();
    const btns = await screen.findAllByTestId('rsvp-button');
    fireEvent.click(btns[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('one notice, no flash, viewer switch', () => {
  it('(a) shows the notice exactly once and renders no sticky bar', async () => {
    mockGetMyEventRemoval.mockResolvedValue(true);
    open();
    await screen.findByText(NOTICE);
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    expect(screen.queryByTestId('rsvp-sticky-bar')).toBeNull();
  });

  it('(b) shows no Register button until the status read resolves, then shows it when false', async () => {
    let resolve: (v: boolean) => void = () => {};
    mockGetMyEventRemoval.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
    open();
    await waitFor(() => expect(mockGetMyEventRemoval).toHaveBeenCalled());
    await screen.findAllByText('Test Event');
    expect(screen.queryByTestId('rsvp-button')).toBeNull();
    resolve(false);
    await waitFor(() => expect(screen.getAllByTestId('rsvp-button').length).toBeGreaterThan(0));
  });

  it('(d) changing the signed-in user re-reads the status and drops the previous notice', async () => {
    mockGetMyEventRemoval.mockResolvedValueOnce(true).mockResolvedValue(false);
    const { rerender } = open();
    await screen.findByText(NOTICE);
    mockUseAuth.mockReturnValue({ user: { id: 'r-2', slug: 'rob' }, session: { user: { id: 'r-2' } } });
    rerender(
      <MemoryRouter initialEntries={['/events/test-event']}>
        <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mockGetMyEventRemoval).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull());
  });
});

describe('waiting-list refusal', () => {
  const joinList = async () => {
    fullEvent.value = true;
    mockGetEventBySlug.mockResolvedValue({ ...makeEvent(), flow: 'sales-mastermind', maxAttendees: 5 });
    mockJoinWaitlist.mockResolvedValue('closed');
    open();
    await screen.findAllByTestId('rsvp-button');
    fireEvent.click(screen.getAllByTestId('rsvp-button')[0]);
    fireEvent.click(await screen.findByTestId('join-improve'));
    fireEvent.click(await screen.findByTestId('prep-home'));
    fireEvent.click(screen.getByTestId('recording-accept'));
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[radios.length - 1]);
    fireEvent.click(screen.getByTestId('registration-submit'));
  };

  it('(c) a stale-tab waiting-list join refused as removal shows the notice', async () => {
    // removed after the page loaded: reads are false until the join is attempted
    mockGetMyEventRemoval.mockImplementation(async () => mockJoinWaitlist.mock.calls.length > 0);
    await joinList();
    await waitFor(() => expect(mockJoinWaitlist).toHaveBeenCalled());
    await screen.findByText(NOTICE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('(c) a waiting-list refusal that is not a removal says it could not join the waiting list', async () => {
    await joinList();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't join the waiting list. Please try again."));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
