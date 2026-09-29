/**
 * @file p1366-event-going-count.test.tsx
 * @description FOUNDER DECISION 2026-09-29 — an event's DISPLAYED going / attended count never
 * reads 0 for a hosted event: the host counts as going. Display only. Room statistics keep
 * excluding the host (decisions.md 2026-09-21 [product]), and nothing that decides capacity
 * (`isEventFull`, spots left, `maxAttendees`) or feeds analytics reads this helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { displayGoingCount } from '@/app/utils/event-going';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import type { EventAttendee, EventWithHost } from '@/app/types';

// ── Supabase mock for the list queries (getUpcomingEvents / getPastEvents) ──
const tables = vi.hoisted(() => ({ events: [] as unknown[], rsvps: [] as unknown[] }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
  generateAIBanner: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: vi.fn() }));
vi.mock('@/lib/supabase', () => {
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'in', 'order', 'eq', 'or']) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return c;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === 'event_rsvps'
          ? chain(() => ({ data: tables.rsvps, error: null }))
          : chain(() => ({ data: tables.events, error: null })),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    },
  };
});

const attendee = (profileId: string): EventAttendee => ({
  profileId, name: `Person ${profileId}`, slug: `p-${profileId}`, hasPledged: false, earCount: 0,
});

function makeEvent(overrides: Partial<EventWithHost> = {}): EventWithHost {
  return {
    id: 'ev-1',
    slug: 'ev-1',
    title: 'An event',
    description: '',
    datetime: '2999-01-01T18:00:00Z',
    durationMinutes: 90,
    timezone: 'UTC',
    location: 'Somewhere',
    hostId: 'host-1',
    createdAt: '2026-09-01T00:00:00Z',
    status: 'upcoming',
    hostName: 'Host Person',
    hostSlug: 'host-person',
    ...overrides,
  } as EventWithHost;
}

describe('displayGoingCount', () => {
  it('0 RSVPs on a hosted event reads 1 — the host is going', () => {
    expect(displayGoingCount(makeEvent({ attendeeCount: 0, attendees: [] }))).toBe(1);
  });

  it('host NOT among the RSVPs: RSVPs + 1', () => {
    expect(displayGoingCount(makeEvent({ attendees: [attendee('a'), attendee('b')], attendeeCount: 2 }))).toBe(3);
  });

  it('host already among the RSVPs: counted once, not twice', () => {
    expect(displayGoingCount(makeEvent({ attendees: [attendee('a'), attendee('host-1')], attendeeCount: 2 }))).toBe(2);
  });

  // List pages carry `attendees: []` (mapEventFromDb) plus the batch count, and — since the review
  // fix — whether the host's own profile has an RSVP row (`hostHasRsvp`).
  it('list shape, host has NO RSVP row: count + 1', () => {
    expect(displayGoingCount(makeEvent({ attendeeCount: 4, attendees: [], hostHasRsvp: false }))).toBe(5);
  });

  it('list shape, host HAS an RSVP row: the count as is — equal to the detail page for the same event', () => {
    const list = makeEvent({ attendeeCount: 3, attendees: [], hostHasRsvp: true });
    const detail = makeEvent({ attendeeCount: 3, attendees: [attendee('host-1'), attendee('a'), attendee('b')] });
    expect(displayGoingCount(list)).toBe(3);
    expect(displayGoingCount(list)).toBe(displayGoingCount(detail));
  });

  it('no count and no rows at all: still 1 for a hosted event', () => {
    expect(displayGoingCount(makeEvent({ attendeeCount: undefined, attendees: [] }))).toBe(1);
  });

  it('a CANCELLED event never adds the host — it never ran', () => {
    expect(displayGoingCount(makeEvent({ status: 'cancelled', attendeeCount: 0, attendees: [] }))).toBe(0);
    expect(displayGoingCount(makeEvent({ status: 'cancelled', attendeeCount: 2, attendees: [] }))).toBe(2);
  });

  it('an event with no host user (external / imported) is unchanged', () => {
    expect(displayGoingCount(makeEvent({ hostId: '', attendeeCount: 0 }))).toBe(0);
    expect(displayGoingCount(makeEvent({ hostId: undefined as unknown as string, attendeeCount: 3 }))).toBe(3);
  });

  it('does not mutate the event (display only — capacity keeps reading attendeeCount)', () => {
    const event = makeEvent({ attendeeCount: 2, maxAttendees: 2 });
    displayGoingCount(event);
    expect(event.attendeeCount).toBe(2);
  });
});

describe('EventCard renders the display count', () => {
  const renderCard = (event: EventWithHost) =>
    render(<MemoryRouter><EventCard event={event} /></MemoryRouter>);

  it('an upcoming hosted event with no RSVPs reads "1 going", never "0 going"', () => {
    renderCard(makeEvent({ attendeeCount: 0, attendees: [] }));
    expect(screen.getByText('1 going')).toBeTruthy();
    expect(screen.queryByText('0 going')).toBeNull();
  });

  it('a past hosted event with 3 RSVPs reads "4 attended"', () => {
    renderCard(makeEvent({ datetime: '2020-01-01T18:00:00Z', status: 'completed', attendeeCount: 3 }));
    expect(screen.getByText('4 attended')).toBeTruthy();
  });

  it('the avatar stack still shows only the RSVPs (display count ≠ avatar rows)', () => {
    const { container } = renderCard(makeEvent({ attendees: [attendee('a'), attendee('b')], attendeeCount: 2 }));
    expect(screen.getByText('3 going')).toBeTruthy();
    expect(container.querySelectorAll('.-space-x-2 > div')).toHaveLength(2);
  });
});

describe('the list queries record whether the host has an RSVP row (review finding)', () => {
  const eventRow = (id: string, hostId: string) => ({
    id, slug: id, title: `Event ${id}`, description: '', datetime: '2999-01-01T18:00:00Z',
    duration_minutes: 90, timezone: 'UTC', location: 'Somewhere', host_id: hostId,
    created_at: '2026-09-01T00:00:00Z', status: 'upcoming', links: [],
    host: { id: hostId, full_name: 'Host', slug: 'host', headline: null, avatar_color: null, avatar_url: null, has_pledged: false, ears_count: 0 },
  });

  beforeEach(() => {
    tables.events = [eventRow('ev-host-rsvpd', 'host-1'), eventRow('ev-host-not', 'host-2')];
    tables.rsvps = [
      { event_id: 'ev-host-rsvpd', profile_id: 'host-1' }, // the host's own RSVP row (auto-RSVP after signup)
      { event_id: 'ev-host-rsvpd', profile_id: 'a' },
      { event_id: 'ev-host-rsvpd', profile_id: 'b' },
      { event_id: 'ev-host-not', profile_id: 'c' },
    ];
  });

  for (const method of ['getUpcomingEvents', 'getPastEvents'] as const) {
    it(`${method}: a host with an RSVP row is counted once — the card equals the detail page`, async () => {
      const { realEventsService } = await import('@/app/data/events-service-real');
      const events = await realEventsService[method]();
      const rsvpd = events.find((e) => e.id === 'ev-host-rsvpd')!;
      const not = events.find((e) => e.id === 'ev-host-not')!;
      // attendeeCount — what capacity and statistics read — is untouched
      expect(rsvpd.attendeeCount).toBe(3);
      expect(not.attendeeCount).toBe(1);
      expect(rsvpd.attendees).toEqual([]); // list-shaped
      // the display count: the detail page (host among 3 attendees) would show 3
      expect(displayGoingCount(rsvpd)).toBe(3);
      expect(displayGoingCount(not)).toBe(2);
    });
  }
});

describe('EventCard wording for cancelled events', () => {
  const renderCard = (event: EventWithHost) =>
    render(<MemoryRouter><EventCard event={event} /></MemoryRouter>);

  it('a cancelled PAST event with 0 RSVPs reads "0 were going" — not "attended", no host added', () => {
    renderCard(makeEvent({ status: 'cancelled', datetime: '2020-01-01T18:00:00Z', attendeeCount: 0, attendees: [] }));
    expect(screen.getByText('0 were going')).toBeTruthy();
    expect(screen.queryByText(/attended/)).toBeNull();
  });

  it('a cancelled FUTURE event with 0 RSVPs reads "0 were going"', () => {
    renderCard(makeEvent({ status: 'cancelled', attendeeCount: 0, attendees: [] }));
    expect(screen.getByText('0 were going')).toBeTruthy();
  });
});
