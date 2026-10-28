/**
 * @file p1545-events-cm-card.test.tsx
 * @description P1545 decision 6: the Chiang Mai calendar card on the standalone events list.
 * Signed out + events -> card below the list, quieter. Signed out + empty -> card is the main element and
 * "Sign Up to Host" is a quiet link. Signed in -> card as above, Host Event / Co-create unchanged.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsList } from '@/app/prototypes/events/components/EventsList';

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  upcoming: [] as Array<{ id: string; title: string }>,
  past: [] as Array<{ id: string; title: string }>,
  track: vi.fn(),
}));

// The real hook returns the session beside the profile; the list reads signed-in from the session (P1560).
vi.mock('@/auth', () => ({
  useAuth: () => ({ user: mocks.user, session: mocks.user ? { user: { id: mocks.user.id } } : null }),
}));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: () => Promise.resolve(mocks.upcoming),
    getPastEvents: () => Promise.resolve(mocks.past),
    isUserRsvpd: () => Promise.resolve(false),
    getViewerRsvps: () => Promise.resolve([]),
  },
}));
vi.mock('@/app/prototypes/events/components/EventCard', () => ({
  EventCard: ({ event }: { event: { title: string } }) => <article>{event.title}</article>,
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => mocks.track(...a) } }));

const SIGNED_IN = { id: 'user-id-1234' };
const EVENT = { id: 'event-id-1', title: 'Clarity Hike' };

async function renderList(initial = '/events') {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <EventsList />
    </MemoryRouter>,
  );
  await screen.findByRole('tab', { name: /Upcoming/ });
}

beforeEach(() => {
  mocks.user = null;
  mocks.upcoming = [];
  mocks.past = [];
  mocks.track.mockReset();
});

describe('P1545 events list: Chiang Mai card', () => {
  it('signed out with events: quiet card below the list, link to /cm, host CTA unchanged', async () => {
    mocks.upcoming = [EVENT];
    await renderList();
    const card = await screen.findByTestId('chiang-mai-card');
    const event = screen.getByText('Clarity Hike');
    expect(event.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.className).toContain('bg-yellow-100'); // the quieter variant
    expect(within(card).getByRole('link', { name: /Open the calendar/ })).toHaveAttribute('href', '/cm');
    expect(screen.getByRole('button', { name: 'Sign Up to Host' })).toBeInTheDocument();
  });

  it('signed out and empty: the card is the main element and Sign Up to Host is a quiet text link, not a button', async () => {
    await renderList();
    const card = await screen.findByTestId('chiang-mai-card');
    expect(card.className).toContain('bg-yellow-300'); // the loud variant
    const host = screen.getByRole('link', { name: 'Sign Up to Host' });
    expect(host).toHaveAttribute('href', '/signup');
    expect(host.querySelector('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign Up to Host' })).toBeNull();
    expect(card.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('signed in with events: quiet card below the list, Host Event and Co-create unchanged', async () => {
    mocks.user = SIGNED_IN;
    mocks.upcoming = [EVENT];
    await renderList();
    expect((await screen.findByTestId('chiang-mai-card')).className).toContain('bg-yellow-100');
    expect(screen.getByRole('button', { name: 'Host Event' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Co-create' })).toBeInTheDocument();
  });

  it('signed in and empty: main card, and Host Event / Co-create still offered', async () => {
    mocks.user = SIGNED_IN;
    await renderList();
    expect((await screen.findByTestId('chiang-mai-card')).className).toContain('bg-yellow-300');
    expect(screen.getByRole('button', { name: 'Host Event' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Co-create' })).toBeInTheDocument();
  });

  it('is not shown on the Past tab', async () => {
    mocks.upcoming = [EVENT];
    const user = userEvent.setup();
    await renderList();
    await screen.findByTestId('chiang-mai-card');
    await user.click(screen.getByRole('tab', { name: /Past/ }));
    expect(screen.queryByTestId('chiang-mai-card')).toBeNull();
  });

  it('is not shown in a group-scoped or embedded list', async () => {
    render(
      <MemoryRouter>
        <EventsList embedded orgId="org-id-1234" orgSlug="org-slug" />
      </MemoryRouter>,
    );
    await screen.findByRole('tab', { name: /Upcoming/ });
    expect(screen.queryByTestId('chiang-mai-card')).toBeNull();
  });

  it('counts taps: placement and has_events', async () => {
    const user = userEvent.setup();
    // empty list -> main placement
    await renderList();
    await user.click(await screen.findByRole('link', { name: /Open the calendar/ }));
    expect(mocks.track).toHaveBeenCalledWith('cm_calendar_card_clicked', { placement: 'events_list_main', has_events: false });
  });

  it('counts taps below a list that has events', async () => {
    mocks.upcoming = [EVENT];
    const user = userEvent.setup();
    await renderList();
    await user.click(await screen.findByRole('link', { name: /Open the calendar/ }));
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith('cm_calendar_card_clicked', { placement: 'events_list_below', has_events: true });
  });
});
