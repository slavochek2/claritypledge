/**
 * @file p1692-event-prep-return.test.tsx
 * @description P1692: the event preparation page sends people on without a tap in three cases (signed out, no such
 * event, not registered), and each time it builds the next address from the event's name in the page address. That
 * name is data, so it stays exactly one address segment (`pathSegment`): whatever it contains, the person lands on
 * that event's own page, or on sign-in with that event's preparation as the place to come back to.
 *
 * The real page is rendered; only its data and auth edges are stubbed. An ordinary event name gives the
 * byte-identical address it always gave (epistemic gate 7c).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn(), setUserProperties: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const eventsSvc = vi.hoisted(() => ({
  getEventBySlug: vi.fn(),
  isUserRsvpd: vi.fn(),
  getEventGroupChatUrl: vi.fn(),
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: eventsSvc }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: false, error: null }),
  isAnswered: () => false,
}));
vi.mock('@/app/prototypes/events/series-recipes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/series-recipes')>()),
  offersPreparation: () => true,
}));

import { EventPrepPage } from '@/app/prototypes/events/prep/EventPrepPage';

const SIGNED_IN = { user: { id: 'user-id-1234', slug: 'test-person' }, session: { user: { id: 'user-id-1234' } }, isLoading: false, sessionChecked: true };
const SIGNED_OUT = { user: null, session: null, isLoading: false, sessionChecked: true };

function EventRoute() {
  const { slug } = useParams();
  return <div data-testid="event">{slug}</div>;
}
function Other() {
  const location = useLocation();
  return <div data-testid="other">{location.pathname + location.search}</div>;
}

/** Opens the preparation page of the event named `name` and reports where the app ends up. */
async function openPreparation(name: string): Promise<{ event: string | null; other: string | null }> {
  const view = render(
    <MemoryRouter initialEntries={[`/events/${encodeURIComponent(name)}/prepare`]}>
      <Routes>
        <Route path="/events/:slug/prepare" element={<EventPrepPage />} />
        <Route path="/events/:slug" element={<EventRoute />} />
        <Route path="*" element={<Other />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.queryByTestId('event') ?? view.queryByTestId('other')).not.toBeNull());
  const result = { event: view.queryByTestId('event')?.textContent ?? null, other: view.queryByTestId('other')?.textContent ?? null };
  view.unmount();
  return result;
}

const ORDINARY = ['clarity-night-7', 'hike-2026', 'cm'];
const WITH_ADDRESS_CHARACTERS = ['../../elsewhere?x=1', '../elsewhere', 'a/b', 'a?b=c', 'a#top'];

beforeEach(() => {
  auth.value = SIGNED_IN;
  eventsSvc.getEventBySlug.mockReset().mockResolvedValue(null);
  eventsSvc.isUserRsvpd.mockReset().mockResolvedValue(false);
  eventsSvc.getEventGroupChatUrl.mockReset().mockResolvedValue(null);
});

describe('P1692: the event preparation page keeps the event name as one address segment', () => {
  it.each(WITH_ADDRESS_CHARACTERS)('no such event, name %j: the person lands on the event route, not on another page', async (name) => {
    const landed = await openPreparation(name);
    expect(landed.other).toBeNull();
    expect(landed.event).not.toBeNull();
  });

  it.each(WITH_ADDRESS_CHARACTERS)('no such event, name %j: the event route reads the same name back', async (name) => {
    expect((await openPreparation(name)).event).toBe(name);
  });

  it.each(WITH_ADDRESS_CHARACTERS)('not registered for the event, name %j: the person lands on the event route, not on another page', async (name) => {
    eventsSvc.getEventBySlug.mockResolvedValue({ id: 'event-id-1234', slug: 'stored-name', hostId: 'someone-else', hasGroupChat: false });
    const landed = await openPreparation(name);
    expect(landed.other).toBeNull();
    expect(landed.event).not.toBeNull();
  });

  it('signed out: the event name cannot add a parameter of its own to the sign-in address', async () => {
    auth.value = SIGNED_OUT;
    const landed = await openPreparation('a&action=x');
    const address = new URL(landed.other ?? '', 'https://app.test');
    expect(address.pathname).toBe('/login');
    expect([...address.searchParams.keys()]).toEqual(['redirect']);
    expect(address.searchParams.get('redirect')).toBe('/events/a&action=x/prepare');
  });

  it.each(ORDINARY)('KEPT: no such event, ordinary name %j: lands on the byte-identical event address', async (name) => {
    expect(await openPreparation(name)).toEqual({ event: name, other: null });
  });

  it.each(ORDINARY)('KEPT: signed out, ordinary name %j: the byte-identical sign-in address', async (name) => {
    auth.value = SIGNED_OUT;
    expect((await openPreparation(name)).other).toBe(`/login?redirect=/events/${name}/prepare`);
  });

  it.each(ORDINARY)('KEPT: not registered, ordinary name %j: lands on the byte-identical event address', async (name) => {
    eventsSvc.getEventBySlug.mockResolvedValue({ id: 'event-id-1234', slug: name, hostId: 'someone-else', hasGroupChat: false });
    expect(await openPreparation(name)).toEqual({ event: name, other: null });
  });
});
