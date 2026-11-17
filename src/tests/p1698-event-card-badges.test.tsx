/**
 * @file p1698-event-card-badges.test.tsx
 * @description P1698 round 3 (founder decision 2026-11-17): EventCard's relationship badge is past tense on a past
 * event. One past rule for the whole card, the one the going-count label already uses (completed, or started):
 *   not cancelled, not past → "You're Hosting" / "You're Going"
 *   not cancelled, past     → "You Hosted" / "You Went"
 *   cancelled (any time)    → "You Were Hosting" / "You Were Going"
 * The badge and the count label read the same rule, so a card never says "You're Hosting" beside "attended".
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import type { EventWithHost } from '@/app/types';

const HOST = 'user-id-host';
const VIEWER_GOING = 'user-id-guest';
const HOUR = 3_600_000;

function event(status: EventWithHost['status'], offsetMs: number): EventWithHost {
  return {
    id: 'event-id-1',
    slug: 'test-event',
    title: 'Test Gathering',
    description: '',
    datetime: new Date(Date.now() + offsetMs).toISOString(),
    durationMinutes: 60,
    timezone: 'UTC',
    location: 'Test Location',
    hostId: HOST,
    hostName: 'Test Host',
    status,
    attendees: [],
    attendeeCount: 1,
  } as unknown as EventWithHost;
}

const CASES = {
  upcoming: event('upcoming', 72 * HOUR),
  'started 2h ago (status upcoming)': event('upcoming', -2 * HOUR),
  completed: event('completed', -30 * 24 * HOUR),
  'cancelled, in the future': event('cancelled', 72 * HOUR),
  'cancelled, in the past': event('cancelled', -30 * 24 * HOUR),
} as const;

function renderCard(e: EventWithHost, as: 'host' | 'going') {
  return render(
    <MemoryRouter>
      {as === 'host' ? (
        <EventCard event={e} isLoggedIn userId={HOST} />
      ) : (
        <EventCard event={e} isLoggedIn userId={VIEWER_GOING} isUserGoing />
      )}
    </MemoryRouter>,
  );
}

const ALL_BADGES = ["You're Hosting", "You're Going", 'You Hosted', 'You Went', 'You Were Hosting', 'You Were Going'];

describe('EventCard relationship badge tense (P1698)', () => {
  it.each([
    ['host', 'upcoming', "You're Hosting", 'going'],
    ['host', 'started 2h ago (status upcoming)', 'You Hosted', 'attended'],
    ['host', 'completed', 'You Hosted', 'attended'],
    ['host', 'cancelled, in the future', 'You Were Hosting', 'were going'],
    ['host', 'cancelled, in the past', 'You Were Hosting', 'were going'],
    ['going', 'upcoming', "You're Going", 'going'],
    ['going', 'started 2h ago (status upcoming)', 'You Went', 'attended'],
    ['going', 'completed', 'You Went', 'attended'],
    ['going', 'cancelled, in the future', 'You Were Going', 'were going'],
    ['going', 'cancelled, in the past', 'You Were Going', 'were going'],
  ] as const)('%s, %s: "%s" (count label "%s")', (as, when, badge, countWord) => {
    const { container } = renderCard(CASES[when], as);
    expect(screen.getByText(badge)).toBeInTheDocument();
    for (const other of ALL_BADGES.filter((b) => b !== badge)) expect(screen.queryByText(other)).not.toBeInTheDocument();
    // The badge and the count label agree on the tense, from the same rule.
    expect(container.textContent).toMatch(new RegExp(`\\d+ ${countWord}`));
  });
});
