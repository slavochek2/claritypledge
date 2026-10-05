/**
 * P1414 — the next Clarity Night's event page carries the topic vote itself.
 * EventDetail harness copied from p1365-rsvp-repeat-render.test.tsx; the topic data
 * layer is mocked the same way p1347-topics-page.test.tsx mocks it.
 */
import { render, screen, waitFor, within, fireEvent, cleanup as cleanupAll } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { EventWithHost } from '@/app/types';

// ── Topic voting ──────────────────────────────────────────────────────────────
const topicsDb = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('@/app/data/topic-voting', async (orig) => {
  const real = await orig<typeof import('@/app/data/topic-voting')>();
  return {
    ...real,
    getOpenTopics: vi.fn(async () => topicsDb.rows.map((r) => ({ ...r }))),
    rateTopic: vi.fn(async () => true),
    clearTopicRating: vi.fn(async () => true),
    setMyVotesPublic: vi.fn(async () => true),
    addTopic: vi.fn(async () => 'ok'),
  };
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/app/components/seo', () => ({ SEO: () => { throw new Error('embedded must not set the page title'); } }));

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
    getSeriesContent: vi.fn().mockResolvedValue({ reviews: [], photos: [] }),
    getEventOrganizer: vi.fn().mockResolvedValue(null),
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
import { TopicsPage } from '@/app/pages/topics-page';
import { showsTopicVote } from '@/app/prototypes/events/topic-vote';
import { rateTopic } from '@/app/data/topic-voting';

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

function topic(id: string, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title, why: null, track: 'room', source: 'host', myRating: null, myIsPublic: null, ratingAvg: null, ratingCount: null, voters: null, author: null, ...extra };
}

const NIGHT = { seriesSlug: 'clarity-night', statementTag: undefined, location: 'Zuzalu Library, Chiang Mai' } as const;

function renderEvent(event: EventWithHost) {
  mockGetEventBySlug.mockResolvedValue(event);
  return render(
    <MemoryRouter initialEntries={[`/events/${event.slug}`]}>
      <Routes>
        <Route path="/events/:slug" element={<EventDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const signedIn = () => mockUseAuth.mockReturnValue({ user: { id: 'user-id-1234' }, session: { user: { id: 'user-id-1234' } }, isLoading: false });
const signedOut = () => mockUseAuth.mockReturnValue({ user: null, session: null, isLoading: false });

beforeEach(() => {
  vi.clearAllMocks();
  mockIsUserRsvpd.mockResolvedValue(false);
  topicsDb.rows = [topic('a', 'Free will'), topic('b', 'Loneliness')];
  signedIn();
});

describe('P1414 which events carry the vote', () => {
  it('a Clarity Night with no topic yet, and nothing else', () => {
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: undefined, status: 'upcoming' }, false)).toBe(true);
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: '  ', status: 'upcoming' }, false)).toBe(true);
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: 'ikigai1', status: 'upcoming' }, false)).toBe(false);
    // Hikes and guest events have no statement_tag either — the tag alone must not decide.
    expect(showsTopicVote({ seriesSlug: 'social-hike', statementTag: undefined, status: 'upcoming' }, false)).toBe(false);
    expect(showsTopicVote({ seriesSlug: undefined, statementTag: undefined, status: 'upcoming' }, false)).toBe(false);
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: undefined, status: 'cancelled' }, false)).toBe(false);
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: undefined, status: 'upcoming' }, true)).toBe(false);
    expect(showsTopicVote(null, false)).toBe(false);
  });
});

describe('P1414 event page', () => {
  it('a Clarity Night with no topic shows the vote, and a signed-in visitor rates without leaving', async () => {
    renderEvent(makeEvent({ ...NIGHT }));
    const embed = await screen.findByTestId('topic-vote-embed');
    expect(within(embed).getByRole('heading', { level: 2 })).toHaveTextContent("Vote for this night's topic");
    expect(within(embed).getAllByTestId('topic-row')).toHaveLength(2);
    fireEvent.click(within(within(embed).getAllByTestId('topic-row')[0]).getByRole('radio', { name: '4 stars' }));
    // The same call /topics makes — so the same stored vote.
    await waitFor(() => expect(rateTopic).toHaveBeenCalledWith('a', 4, true));
  });

  it('an event that has its topic shows no vote section', async () => {
    renderEvent(makeEvent({ ...NIGHT, statementTag: 'ikigai1' }));
    await screen.findByRole('heading', { level: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('topic-vote-embed')).toBeNull();
  });

  it('a hike (no statement tag either) shows no vote section', async () => {
    renderEvent(makeEvent({ seriesSlug: 'social-hike', location: 'Chiang Mai' }));
    await screen.findByRole('heading', { level: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('topic-vote-embed')).toBeNull();
  });

  it('with no topics published, the section is absent — no heading, no divider', async () => {
    topicsDb.rows = [];
    renderEvent(makeEvent({ ...NIGHT }));
    await screen.findByRole('heading', { level: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('topic-vote-embed')).toBeNull();
    expect(screen.queryByText("Vote for this night's topic")).toBeNull();
    // Nothing points at the absent section, and no second Register appears.
    expect(screen.queryByTestId('topic-open-line')).toBeNull();
    expect(screen.queryByTestId('rsvp-repeat')).toBeNull();
  });

  it('signing in never overwrites a rating the account already has (stars may be someone else\'s)', async () => {
    localStorage.setItem('p1347-guest-ratings', JSON.stringify({ at: Date.now(), r: { a: 1, b: 5 } }));
    topicsDb.rows = [topic('a', 'Free will', { myRating: 4, myIsPublic: true, ratingAvg: 4, ratingCount: 1, voters: [] }), topic('b', 'Loneliness')];
    render(<MemoryRouter><TopicsPage embedded returnTo="/events/x" /></MemoryRouter>);
    await waitFor(() => expect(rateTopic).toHaveBeenCalledWith('b', 5, true));
    expect(rateTopic).not.toHaveBeenCalledWith('a', 1, expect.anything());
    localStorage.clear();
  });

  it('an ended night (inside the 12h RSVP grace) shows no vote', () => {
    expect(showsTopicVote({ seriesSlug: 'clarity-night', statementTag: undefined, status: 'upcoming' }, true)).toBe(false);
  });

  it('the top says the topic is open and links to the vote; Register repeats after the vote (founder)', async () => {
    renderEvent(makeEvent({ ...NIGHT }));
    const embed = await screen.findByTestId('topic-vote-embed');
    expect(screen.getByTestId('topic-open-line')).toHaveAttribute('href', '#topic-vote');
    expect(embed).toHaveAttribute('id', 'topic-vote');
    expect(screen.getByTestId('rsvp-repeat')).toBeInTheDocument();
  });

  it('an event with its topic has no "Topic: not chosen yet" line', async () => {
    renderEvent(makeEvent({ ...NIGHT, statementTag: 'ikigai1' }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('topic-open-line')).toBeNull();
  });

  it('the vote adds no full-width primary: Add a topic is an outline button', async () => {
    renderEvent(makeEvent({ ...NIGHT }));
    const embed = await screen.findByTestId('topic-vote-embed');
    const add = within(embed).getByRole('button', { name: /Add a topic/ });
    expect(add.className).not.toMatch(/bg-blue-500/);
    expect(within(embed).queryByRole('button', { name: /Reserve a seat/ })).toBeNull();
  });
});

describe('P1414 embedded topics page', () => {
  const renderEmbed = () =>
    render(<MemoryRouter><TopicsPage embedded returnTo="/events/next-night" /></MemoryRouter>);

  it('has no page heading, no pinned bar and no Back', async () => {
    renderEmbed();
    await screen.findByTestId('topic-vote-embed');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(document.querySelector('.fixed')).toBeNull();
  });

  it('a link to a person opens in a new tab, so the event page stays open', async () => {
    topicsDb.rows = [topic('c', 'Quit a job?', { source: 'community', author: { name: 'Test Person', slug: 'test-person', avatarUrl: null, avatarColor: null, hasPledged: false } })];
    renderEmbed();
    const row = (await screen.findAllByTestId('topic-row'))[0];
    fireEvent.click(within(row).getByRole('button', { name: /Quit a job/ }));
    const link = within(row).getByRole('link', { name: 'Test Person' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('signed out: stars are kept, and sign-in returns to the event page in the same tab', async () => {
    signedOut();
    renderEmbed();
    const row = (await screen.findAllByTestId('topic-row'))[0];
    fireEvent.click(within(row).getByRole('radio', { name: '5 stars' }));
    const login = within(row).getByRole('link', { name: 'log in' });
    expect(login.getAttribute('href')).toBe(`/login?redirect=${encodeURIComponent('/events/next-night')}`);
    expect(login).not.toHaveAttribute('target');
    expect(rateTopic).not.toHaveBeenCalled();
  });

  it('same controls as /topics: sort, 8 topics, "Show more" in the section (not a pinned bar)', async () => {
    topicsDb.rows = Array.from({ length: 11 }, (_, i) => topic(`t${i}`, `Topic ${i}`));
    renderEmbed();
    expect(await screen.findAllByTestId('topic-row')).toHaveLength(8);
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getAllByTestId('topic-row')).toHaveLength(11);
  });

  it('stars tapped signed out survive a new tab (the email sign-in link), and expire after an hour', async () => {
    signedOut();
    localStorage.clear();
    const { unmount } = renderEmbed();
    fireEvent.click(within((await screen.findAllByTestId('topic-row'))[0]).getByRole('radio', { name: '3 stars' }));
    unmount();
    sessionStorage.clear(); // a new tab starts with empty sessionStorage
    renderEmbed();
    expect(within((await screen.findAllByTestId('topic-row'))[0]).getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'true');
    const stored = JSON.parse(localStorage.getItem('p1347-guest-ratings')!);
    localStorage.setItem('p1347-guest-ratings', JSON.stringify({ ...stored, at: Date.now() - 2 * 60 * 60 * 1000 }));
    cleanupAll();
    renderEmbed();
    expect(within((await screen.findAllByTestId('topic-row'))[0]).getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'false');
    localStorage.clear();
  });
});
