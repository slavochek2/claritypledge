/**
 * @file p1366-event-going-count.test.tsx
 * @description FOUNDER DECISION 2026-09-29 — an event's DISPLAYED going / attended count never
 * reads 0 for a hosted event: the host counts as going. Display only. Room statistics keep
 * excluding the host (decisions.md 2026-09-21 [product]), and nothing that decides capacity
 * (`isEventFull`, spots left, `maxAttendees`) or feeds analytics reads this helper.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { displayGoingCount } from '@/app/utils/event-going';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import type { EventAttendee, EventWithHost } from '@/app/types';

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

  it('a list surface that only has the count (no attendee rows): count + 1 — the RSVP control is hidden from hosts (P844)', () => {
    expect(displayGoingCount(makeEvent({ attendeeCount: 4, attendees: undefined }))).toBe(5);
  });

  it('no count and no rows at all: still 1 for a hosted event', () => {
    expect(displayGoingCount(makeEvent({ attendeeCount: undefined, attendees: undefined }))).toBe(1);
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
