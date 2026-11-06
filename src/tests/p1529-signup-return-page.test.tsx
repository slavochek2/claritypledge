/**
 * P1529 (spec: a new user returning from sign-up sees the registration step): a person who signed up from the event page
 * (`?action=rsvp`) lands back on it signed in. In a flow that asks its questions before the seat, the step opens at once;
 * Clarity Night and Social Hike keep the one-tap page and the toast. Harness copied from p1365-rsvp-repeat-render.test.tsx.
 * D24: answers saved before sign-up register the person without asking again (this event only), a place that went meanwhile is
 * "This event just filled up." with the answers kept and the waiting list offered, and a logged-out Register opens the form.
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
const mockIsFull = vi.fn();
const mockRegister = vi.fn();
const mockJoin = vi.fn();
const mockOnList = vi.fn();
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getSeriesContent: vi.fn().mockResolvedValue({ reviews: [], photos: [] }),
    getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
    isUserRsvpd: (...args: unknown[]) => mockIsUserRsvpd(...args),
    isEventFull: (...args: unknown[]) => mockIsFull(...args),
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

// ── Online: the guard is not what these tests are about ───────────────────────────
vi.mock('@/app/hooks/use-online-write-guard', () => ({ useOnlineWriteGuard: () => () => true }));

// ── Registration calls (the page's own seams) ───────────────────────────────────
vi.mock('@/app/data/event-registration', () => ({
  registerForEvent: (...a: unknown[]) => mockRegister(...a),
  eventAsksBeforeSeat: async () => true,
}));
vi.mock('@/app/data/event-waitlist', () => ({
  joinWaitlist: (...a: unknown[]) => mockJoin(...a),
  getMyWaitlistEntry: (...a: unknown[]) => mockOnList(...a),
  leaveWaitlist: vi.fn(),
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
import { fireEvent } from '@testing-library/react';
import { readRegistrationDraft, saveRegistrationDraft } from '@/app/data/registration-draft';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';
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
        <Route path="/events/:slug/confirm" element={<p>confirm screen</p>} />
        <Route path="/signup" element={<p>sign-up screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1529: returning from sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'new-user' }, session: { user: { id: 'new-user' } } });
    mockIsUserRsvpd.mockResolvedValue(false);
    mockIsFull.mockReturnValue(false);
    mockRegister.mockResolvedValue('ok');
    mockJoin.mockResolvedValue('ok');
    mockOnList.mockResolvedValue(null);
    localStorage.clear();
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
    await waitFor(() => expect(mockIsUserRsvpd).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    expect(toast.success).not.toHaveBeenCalled(); // never "click to confirm" to someone already registered
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });

  it('opens nothing without the sign-up marker', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
    renderAt('');
    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });
});

const SAVED: RegistrationAnswers = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: 'grow', recordingAccepted: true };

describe('P1529 D24: saved answers on the way back from sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'new-user' }, session: { user: { id: 'new-user' } } });
    mockIsUserRsvpd.mockResolvedValue(false);
    mockIsFull.mockReturnValue(false);
    mockRegister.mockResolvedValue('ok');
    mockJoin.mockResolvedValue('ok');
    mockOnList.mockResolvedValue(null);
    localStorage.clear();
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
  });

  it('registers with the saved answers, clears them, and lands on the confirm screen', async () => {
    saveRegistrationDraft('test-event', 'register', SAVED);
    renderAt('?action=rsvp');
    expect(await screen.findByText('confirm screen')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect((mockRegister.mock.calls[0] ?? []).slice(1)).toEqual(['new-user', SAVED]);
    expect(readRegistrationDraft('test-event')).toBeNull();
    expect(screen.queryByTestId('registration-submit')).toBeNull();
  });

  it('never applies answers saved for a different event', async () => {
    saveRegistrationDraft('some-other-event', 'register', SAVED);
    renderAt('?action=rsvp');
    expect(await screen.findByTestId('registration-submit')).toBeTruthy(); // the form opens as today
    expect(mockRegister).not.toHaveBeenCalled();
    expect(readRegistrationDraft('some-other-event')).not.toBeNull();
  });

  it('with no saved answers (another device) the form opens as today', async () => {
    renderAt('?action=rsvp');
    expect(await screen.findByTestId('registration-submit')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('answers saved are not used without the sign-up marker', async () => {
    saveRegistrationDraft('test-event', 'register', SAVED);
    renderAt('');
    await waitFor(() => expect(screen.getByText('Test Event')).toBeInTheDocument());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('the event filled while signing in: "This event just filled up.", the waiting list is offered, the answers stay, nobody is registered', async () => {
    mockIsFull.mockReturnValue(true);
    saveRegistrationDraft('test-event', 'register', SAVED);
    renderAt('?action=rsvp');
    expect((await screen.findAllByTestId('just-filled'))[0]!.textContent).toBe('This event just filled up.');
    expect(screen.getAllByTestId('rsvp-button')[0]!.textContent).toBe('Join the waiting list');
    expect(mockRegister).not.toHaveBeenCalled();
    expect(readRegistrationDraft('test-event')).not.toBeNull();
    // the form the button opens already holds the answers
    fireEvent.click(screen.getAllByTestId('rsvp-button')[0]!);
    expect((await screen.findByTestId('join-improve') as HTMLInputElement).checked).toBe(true);
  });

  it('a place that went between the page load and the registration says the same, and keeps the answers', async () => {
    // the real page marks the event full from the refusal; the mocked service must follow it
    mockRegister.mockImplementation(async () => { mockIsFull.mockReturnValue(true); return 'full'; });
    saveRegistrationDraft('test-event', 'register', SAVED);
    renderAt('?action=rsvp');
    expect((await screen.findAllByTestId('just-filled'))[0]!).toBeTruthy();
    expect(screen.getAllByTestId('rsvp-button')[0]!.textContent).toBe('Join the waiting list');
    expect(readRegistrationDraft('test-event')).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a saved waiting-list request on a full event joins the list and shows the line', async () => {
    mockIsFull.mockReturnValue(true);
    saveRegistrationDraft('test-event', 'waitlist', SAVED);
    renderAt('?action=rsvp');
    expect((await screen.findAllByTestId('waitlist-joined'))[0]!.textContent).toContain("You're on the waiting list. If a place opens and the host adds you, you'll get an email.");
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(readRegistrationDraft('test-event')).toBeNull();
  });

  it('a saved waiting-list request when a place has opened registers nobody: the form opens, filled in', async () => {
    saveRegistrationDraft('test-event', 'waitlist', SAVED);
    renderAt('?action=rsvp');
    expect((await screen.findByTestId('join-improve') as HTMLInputElement).checked).toBe(true);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockJoin).not.toHaveBeenCalled();
  });
});

describe('P1529 D24: the page for a flow that asks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUserRsvpd.mockResolvedValue(false);
    mockIsFull.mockReturnValue(false);
    mockRegister.mockResolvedValue('ok');
    mockOnList.mockResolvedValue(null);
    localStorage.clear();
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
  });
  const fill = () => {
    fireEvent.click(screen.getByTestId('join-improve'));
    fireEvent.click(screen.getByTestId('prep-home'));
    fireEvent.click(screen.getByLabelText('USB-C'));
    fireEvent.click(screen.getByTestId('recording-accept'));
  };

  it('the button says Register, and logged out it opens the form, which ends in Continue', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderAt('');
    const button = (await screen.findAllByTestId('rsvp-button'))[0]!;
    expect(button.textContent).toBe('Register');
    fireEvent.click(button);
    expect((await screen.findByTestId('registration-submit')).textContent).toBe('Continue');
    expect(screen.getByTestId('sign-in-line').textContent).toBe('Next, sign in to confirm your place');
  });

  it('Continue keeps the answers in this browser (this event only), registers nothing, and goes to the normal sign-up', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderAt('');
    fireEvent.click((await screen.findAllByTestId('rsvp-button'))[0]!);
    await screen.findByTestId('registration-submit');
    fill();
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(await screen.findByText('sign-up screen')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(readRegistrationDraft('test-event')?.answers).toMatchObject({ participation: 'canvas_before', phone: 'usbc', recordingAccepted: true });
    expect(readRegistrationDraft('another-event')).toBeNull();
  });

  it('logged out and full, the button is Join the waiting list and the form is the same one', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    mockIsFull.mockReturnValue(true);
    renderAt('');
    const button = (await screen.findAllByTestId('rsvp-button'))[0]!;
    expect(button.textContent).toBe('Join the waiting list');
    expect(screen.queryByText(/Message the host/)).toBeNull();
    fireEvent.click(button);
    expect((await screen.findByTestId('registration-submit')).textContent).toBe('Continue');
    expect(screen.getByRole('heading', { name: 'Join the waiting list' })).toBeTruthy();
  });

  it('logged in, the form registers and lands on the confirm screen', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: { user: { id: 'u1' } } });
    renderAt('');
    fireEvent.click((await screen.findAllByTestId('rsvp-button'))[0]!);
    await screen.findByTestId('registration-submit');
    expect(screen.getByTestId('registration-submit').textContent).toBe('Register');
    fill();
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(await screen.findByText('confirm screen')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('someone already on the waiting list sees the line and a quiet Leave link, not the button', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: { user: { id: 'u1' } } });
    mockIsFull.mockReturnValue(true);
    mockOnList.mockResolvedValue(SAVED);
    renderAt('');
    expect((await screen.findAllByTestId('waitlist-joined'))[0]!.textContent).toContain("You're on the waiting list. If a place opens and the host adds you, you'll get an email.");
    expect(screen.getAllByTestId('waitlist-leave')[0]!.textContent).toBe('Leave the waiting list');
    expect(screen.queryByTestId('rsvp-button')).toBeNull();
  });

  it('Clarity Night and Social Hike keep Reserve a seat, and a full one stays disabled with no waiting list', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: { user: { id: 'u1' } } });
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    renderAt('');
    expect((await screen.findAllByTestId('rsvp-button'))[0]!.textContent).toBe('Reserve a seat');
  });

  it('a full Clarity Night is still the disabled Event Full button', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: { user: { id: 'u1' } } });
    mockIsFull.mockReturnValue(true);
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    renderAt('');
    const button = (await screen.findAllByTestId('rsvp-button'))[0] as HTMLButtonElement;
    expect(button.textContent).toBe('Event Full');
    expect(button.disabled).toBe(true);
    expect(screen.queryByTestId('waitlist-joined')).toBeNull();
  });
});

describe('P1529 D24 review fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, session: { user: { id: 'u1' } } });
    mockIsUserRsvpd.mockResolvedValue(false);
    mockIsFull.mockReturnValue(false);
    mockRegister.mockResolvedValue('ok');
    mockOnList.mockResolvedValue(null);
    localStorage.clear();
    mockGetEventBySlug.mockResolvedValue(makeEvent({ flow: 'sales-mastermind' }));
  });

  it('a failed registration with saved answers reopens the form with them, so there is a way to retry', async () => {
    mockRegister.mockResolvedValueOnce('failed').mockResolvedValue('ok');
    saveRegistrationDraft('test-event', 'register', SAVED);
    renderAt('?action=rsvp');
    expect((await screen.findByTestId('join-improve') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('USB-C') as HTMLInputElement).checked).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Couldn't register you. Please try again.");
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(await screen.findByText('confirm screen')).toBeTruthy();
    expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('after the limit is raised, a listed person sees Register with their answers filled in, plus Leave; registering sends them to confirm', async () => {
    mockOnList.mockResolvedValue(SAVED);
    renderAt('');
    const button = (await screen.findAllByTestId('rsvp-button'))[0]!;
    expect(button.textContent).toBe('Register');
    expect((await screen.findAllByTestId('waitlist-leave'))[0]!.textContent).toBe('Leave the waiting list');
    expect(screen.queryByTestId('waitlist-joined')).toBeNull();
    fireEvent.click(button);
    expect((await screen.findByTestId('join-improve') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('registration-submit'));
    expect(await screen.findByText('confirm screen')).toBeTruthy();
    expect(mockRegister.mock.calls[0]?.[2]).toEqual(SAVED);
  });

  it('Clarity Night makes no waiting-list read at all', async () => {
    mockGetEventBySlug.mockResolvedValue(makeEvent());
    renderAt('');
    await screen.findAllByTestId('rsvp-button');
    expect(mockOnList).not.toHaveBeenCalled();
  });

  it('the Register, Continue and waiting-list buttons are the default Button, not a hand-typed blue; Leave is the quiet ghost', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderAt('');
    const register = (await screen.findAllByTestId('rsvp-button'))[0]!;
    expect(register.className).toContain('bg-blue-600');
    expect(register.className).not.toContain('bg-blue-500');
    fireEvent.click(register);
    const submit = await screen.findByTestId('registration-submit');
    expect(submit.textContent).toBe('Continue');
    expect(submit.className).toContain('bg-blue-600');
    expect(submit.className).not.toContain('bg-blue-500');
  });
});
