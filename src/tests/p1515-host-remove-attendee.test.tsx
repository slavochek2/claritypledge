/**
 * P1515: the host removes a registered person from the event page. The rpc (remove_event_attendee) records the removal
 * and deletes the registration; this is its only caller. Host only, never on the host's own row, behind a confirmation
 * that says what it costs, and a failure leaves the list as it was.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';
import { REMOVE_ATTENDEE_COPY } from '@/app/prototypes/events/remove-attendee-copy';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/use-nav-auth-state', () => ({ useNavAuthState: () => ({ showUserMenu: false }) }));

const mockGetEventBySlug = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
    isUserRsvpd: vi.fn().mockResolvedValue(false),
    isEventFull: () => false,
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getEventOrganizer: vi.fn().mockResolvedValue(null), // P1553: fetched for every event now
    getEventOrgFooterNote: vi.fn().mockResolvedValue(null),
    rsvpToEvent: vi.fn(),
    cancelRsvp: vi.fn(),
    cancelEvent: vi.fn(),
    uncancelEvent: vi.fn(),
    updateEvent: vi.fn(),
  },
}));
const removeEventAttendee = vi.fn();
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { listSharedWithEvent: vi.fn().mockResolvedValue([]), removeEventAttendee: (...a: unknown[]) => removeEventAttendee(...a) },
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

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const HOST = 'host-user-id';
const person = (id: string, name: string) => ({ profileId: id, name, slug: name.toLowerCase(), avatarColor: '#3b82f6', hasPledged: false, earCount: 0 }) as never;
const makeEvent = (attendees: unknown[]) => ({
  id: 'event-1', slug: 'test-event', title: 'Test Event', description: 'A test event',
  datetime: FUTURE, durationMinutes: 60, timezone: 'America/Los_Angeles', location: 'Somewhere',
  hostId: HOST, hostName: 'Hosty', hostSlug: 'host', hostRole: 'Founder', hostAvatarColor: '#000',
  hostAvatarUrl: null, hostHasPledged: false, hostEarCount: 0, status: 'upcoming', createdAt: FUTURE,
  attendees,
}) as unknown as EventWithHost;
const ATTENDEES = [person(HOST, 'Hosty'), person('r-1', 'Rita'), person('s-1', 'Sam')];

const open = () => render(
  <MemoryRouter initialEntries={['/events/test-event']}>
    <Routes><Route path="/events/:slug" element={<EventDetail />} /></Routes>
  </MemoryRouter>,
);
const asHost = () => mockUseAuth.mockReturnValue({ user: { id: HOST, slug: 'host' }, session: { user: { id: HOST } } });
const asGuest = () => mockUseAuth.mockReturnValue({ user: { id: 'r-1', slug: 'rita' }, session: { user: { id: 'r-1' } } });
const asVisitor = () => mockUseAuth.mockReturnValue({ user: null, session: null });

beforeEach(() => {
  vi.clearAllMocks();
  // Each test starts reachable: a network-trouble mark an earlier test left (module state) makes the
  // online write guard refuse the removal as offline.
  _resetNetworkOutcomeForTesting();
  mockGetEventBySlug.mockResolvedValue(makeEvent(ATTENDEES));
});

describe('the control', () => {
  it('the host sees Remove next to each registered person and not on their own row', async () => {
    asHost();
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    const buttons = screen.getAllByTestId('event-remove-attendee');
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual([REMOVE_ATTENDEE_COPY.buttonLabel('Rita'), REMOVE_ATTENDEE_COPY.buttonLabel('Sam')]);
    expect(screen.queryByRole('button', { name: REMOVE_ATTENDEE_COPY.buttonLabel('Hosty') })).toBeNull();
  });

  it('the control is a 44px target on phones (an icon, slate-600) with the accessible name "Remove <name>" and a title; 40px high with a word from sm', async () => {
    asHost();
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    const [rita] = screen.getAllByTestId('event-remove-attendee');
    expect(rita!.getAttribute('aria-label')).toBe('Remove Rita');
    expect(rita!.getAttribute('title')).toBe('Remove Rita from this event');
    expect(rita!.className).toContain('-mr-2'); // the 44px target reaches into the row's padding, so the name keeps its room
    expect(rita!.className).toContain('h-11');
    expect(rita!.className).toContain('w-11');
    expect(rita!.className).toContain('text-slate-600');
    expect(rita!.className).toContain('sm:h-10');
    expect(rita!.className).toContain('sm:px-3');
  });

  it('on phones the NAME of a removable row may take two lines (the ear count sits under it); the host\'s own row is unchanged', async () => {
    asHost();
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    const nameOf = (name: string) => screen.getByRole('link', { name });
    expect(nameOf('Rita').className).toContain('line-clamp-2');
    expect(nameOf('Rita').className).toContain('sm:truncate');
    expect(nameOf('Sam').className).toContain('line-clamp-2');
    expect(nameOf('Hosty').className).not.toContain('line-clamp-2'); // the host's row has no control and keeps the one-line name
  });

  it.each([['a registered guest', asGuest], ['a signed-out visitor', asVisitor]])('CONTROL: %s never sees it', async (_label, as) => {
    as();
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    expect(screen.queryAllByTestId('event-remove-attendee')).toHaveLength(0);
  });
});

describe('removing', () => {
  it('asks first, says what it costs, and Keep changes nothing', async () => {
    asHost();
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: REMOVE_ATTENDEE_COPY.buttonLabel('Rita') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(REMOVE_ATTENDEE_COPY.title('Rita'))).toBeInTheDocument();
    expect(dialog.textContent).toContain('cannot register for this event again');
    expect(dialog.textContent).toContain('lose access to anything shared with this event');
    fireEvent.click(within(dialog).getByRole('button', { name: REMOVE_ATTENDEE_COPY.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(removeEventAttendee).not.toHaveBeenCalled();
    expect(screen.getByText(/Participants \(3/)).toBeInTheDocument();
  });

  it('Remove calls the rpc wrapper for that person, refreshes the participants and says so', async () => {
    asHost();
    removeEventAttendee.mockResolvedValue(undefined);
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    mockGetEventBySlug.mockClear();
    mockGetEventBySlug.mockResolvedValue(makeEvent([person(HOST, 'Hosty'), person('s-1', 'Sam')])); // what the server holds now
    fireEvent.click(screen.getByRole('button', { name: REMOVE_ATTENDEE_COPY.buttonLabel('Rita') }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: REMOVE_ATTENDEE_COPY.confirm }));
    await waitFor(() => expect(screen.getByText(/Participants \(2/)).toBeInTheDocument());
    expect(removeEventAttendee).toHaveBeenCalledWith('event-1', 'r-1');
    expect(mockGetEventBySlug).toHaveBeenCalledWith('test-event');
    expect(screen.queryByText('Rita')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith(REMOVE_ATTENDEE_COPY.done('Rita'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a failure keeps the list, says so, and closes the dialog', async () => {
    asHost();
    removeEventAttendee.mockRejectedValue(new Error('not authorized for this event'));
    open();
    await waitFor(() => expect(screen.getByText(/Participants \(3/)).toBeInTheDocument());
    mockGetEventBySlug.mockClear();
    fireEvent.click(screen.getByRole('button', { name: REMOVE_ATTENDEE_COPY.buttonLabel('Rita') }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: REMOVE_ATTENDEE_COPY.confirm }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(REMOVE_ATTENDEE_COPY.error));
    expect(screen.getByText(/Participants \(3/)).toBeInTheDocument();
    expect(screen.getByText('Rita')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockGetEventBySlug).not.toHaveBeenCalled(); // nothing changed, nothing to re-read
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
