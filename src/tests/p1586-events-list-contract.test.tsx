/**
 * @file p1586-events-list-contract.test.tsx
 * @description P1586 §3: the events list's data contract.
 *  - a failed or stalled read is a readable line with Retry, never "no events" and never an endless wait;
 *  - an empty success keeps today's empty state;
 *  - the viewer's RSVP marks come from ONE batched read (no per-event request), never block the list,
 *    and a mark whose read failed is unknown (no mark), not "not going";
 *  - nothing from a previous user or group shows after a switch, and sign-out clears marks.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsList } from '@/app/prototypes/events/components/EventsList';

type Ev = { id: string; title: string };

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  /** undefined = the session matches the profile (the normal case); set to model a session that moved on. */
  sessionUserId: undefined as undefined | null | string,
  getUpcomingEvents: vi.fn(),
  getPastEvents: vi.fn(),
  getViewerRsvps: vi.fn(),
  isUserRsvpd: vi.fn(),
}));

vi.mock('@/auth', () => ({
  useAuth: () => {
    const sid = mocks.sessionUserId === undefined ? mocks.user?.id : mocks.sessionUserId;
    return { user: mocks.user, session: sid ? { user: { id: sid } } : null };
  },
}));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: (...a: unknown[]) => mocks.getUpcomingEvents(...a),
    getPastEvents: (...a: unknown[]) => mocks.getPastEvents(...a),
    getViewerRsvps: (...a: unknown[]) => mocks.getViewerRsvps(...a),
    isUserRsvpd: (...a: unknown[]) => mocks.isUserRsvpd(...a),
  },
}));
vi.mock('@/app/prototypes/events/components/EventCard', () => ({
  EventCard: ({ event, isUserGoing }: { event: Ev; isUserGoing?: boolean }) => (
    <article>
      {event.title}
      {isUserGoing && <span data-testid="going-mark">going</span>}
    </article>
  ),
}));

const USER_A = { id: 'user-id-a' };
const USER_B = { id: 'user-id-b' };
const EVENT: Ev = { id: 'event-id-1', title: 'Clarity Hike' };
const FAILURE_LINE = /Events could not be loaded/;
// Deadline ceiling: the list must give up well inside ten seconds.
const PAST_DEADLINE_MS = 10_000;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function ui(orgId?: string) {
  return (
    <MemoryRouter initialEntries={['/events']}>
      <EventsList orgId={orgId} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.user = null;
  mocks.sessionUserId = undefined;
  mocks.getUpcomingEvents.mockReset().mockResolvedValue([]);
  mocks.getPastEvents.mockReset().mockResolvedValue([]);
  mocks.getViewerRsvps.mockReset().mockResolvedValue([]);
  mocks.isUserRsvpd.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P1586 events list: the loading look is a skeleton of the cards', () => {
  it('shows three EventCard-shaped skeleton cards under the drawn header, and no text, mark or spinner', () => {
    mocks.getUpcomingEvents.mockReturnValue(new Promise(() => {}));
    const { container } = render(ui());

    // The frame is drawn: the page title is there while the section waits.
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    const skeleton = screen.getByTestId('event-list-skeleton');
    expect(skeleton.children).toHaveLength(3);
    skeleton.querySelectorAll('.animate-pulse').forEach((b) => expect(b.className).toContain('bg-muted'));
    expect(skeleton.querySelectorAll('.aspect-video')).toHaveLength(3); // a banner slot per card
    expect(container.textContent).not.toMatch(/loading/i);
    expect(container.querySelector('svg[aria-label="Loading"]')).toBeNull();
    expect(container.querySelector('.clarity-page-loader')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

describe('P1586 events list: failure is not empty', () => {
  it('a rejected read shows the failure line with Retry (not the empty state), and Retry recovers', async () => {
    mocks.getUpcomingEvents.mockRejectedValueOnce(new Error('boom'));
    render(ui());

    expect(await screen.findByText(FAILURE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/Loading events/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No upcoming events/)).not.toBeInTheDocument();

    mocks.getUpcomingEvents.mockResolvedValue([EVENT]);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_LINE)).not.toBeInTheDocument();
  });

  it('asks the service to surface failure (opt-in), so other callers keep the swallow-to-[] default', async () => {
    render(ui('org-id-1'));
    await screen.findByText(/No upcoming events|Nothing coming up yet|first event/);
    expect(mocks.getUpcomingEvents).toHaveBeenCalledWith('org-id-1', { throwOnError: true });
    expect(mocks.getPastEvents).toHaveBeenCalledWith('org-id-1', { throwOnError: true });
  });

  it('a stalled read ends in the failure line past the deadline, and Retry recovers', async () => {
    vi.useFakeTimers();
    mocks.getUpcomingEvents.mockReturnValueOnce(new Promise(() => {}));
    render(ui());
    expect(screen.getByTestId('event-list-skeleton')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(PAST_DEADLINE_MS);
    });
    expect(screen.getByText(FAILURE_LINE)).toBeInTheDocument();
    expect(screen.queryByTestId('event-list-skeleton')).not.toBeInTheDocument();

    mocks.getUpcomingEvents.mockResolvedValue([EVENT]);
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    expect(screen.getByText('Clarity Hike')).toBeInTheDocument();
  });

  it('an answer that arrives after the deadline is applied when still for the current view', async () => {
    vi.useFakeTimers();
    const late = deferred<Ev[]>();
    mocks.getUpcomingEvents.mockReturnValueOnce(late.promise);
    render(ui());
    await act(async () => {
      vi.advanceTimersByTime(PAST_DEADLINE_MS);
    });
    expect(screen.getByText(FAILURE_LINE)).toBeInTheDocument();

    await act(async () => {
      late.resolve([EVENT]);
    });
    expect(screen.getByText('Clarity Hike')).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_LINE)).not.toBeInTheDocument();
  });

  it('an answer that arrives after the deadline is dropped when the group changed meanwhile', async () => {
    vi.useFakeTimers();
    const late = deferred<Ev[]>();
    mocks.getUpcomingEvents.mockReturnValueOnce(late.promise);
    const view = render(ui('org-id-1'));
    await act(async () => {
      vi.advanceTimersByTime(PAST_DEADLINE_MS);
    });

    mocks.getUpcomingEvents.mockReturnValue(new Promise(() => {}));
    view.rerender(ui('org-id-2'));
    await act(async () => {
      late.resolve([{ id: 'event-id-old', title: 'Old Group Event' }]);
    });
    expect(screen.queryByText('Old Group Event')).not.toBeInTheDocument();
  });

  it('an empty success keeps today\'s empty state', async () => {
    render(ui());
    expect(await screen.findByText('No upcoming events')).toBeInTheDocument();
    expect(screen.queryByText(FAILURE_LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

describe('P1586 events list: RSVP marks', () => {
  beforeEach(() => {
    mocks.user = USER_A;
    mocks.getUpcomingEvents.mockResolvedValue([EVENT]);
  });

  it('makes zero per-event isUserRsvpd calls; one batched read for the listed ids', async () => {
    mocks.getViewerRsvps.mockResolvedValue([EVENT.id]);
    render(ui());
    expect(await screen.findByTestId('going-mark')).toBeInTheDocument();
    expect(mocks.isUserRsvpd).not.toHaveBeenCalled();
    expect(mocks.getViewerRsvps).toHaveBeenCalledTimes(1);
    expect(mocks.getViewerRsvps).toHaveBeenCalledWith([EVENT.id], USER_A.id);
  });

  it('renders the list before the marks resolve', async () => {
    const marks = deferred<string[]>();
    mocks.getViewerRsvps.mockReturnValue(marks.promise);
    render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();

    await act(async () => {
      marks.resolve([EVENT.id]);
    });
    expect(screen.getByTestId('going-mark')).toBeInTheDocument();
  });

  it('a failed marks read shows no mark (unknown is not "no"), and the list stays up', async () => {
    mocks.getViewerRsvps.mockRejectedValue(new Error('rsvp read failed'));
    render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
    expect(screen.queryByText(FAILURE_LINE)).not.toBeInTheDocument();
  });

  it('signed out: no marks read at all', async () => {
    mocks.user = null;
    render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    expect(mocks.getViewerRsvps).not.toHaveBeenCalled();
  });

  it('signing out clears the marks', async () => {
    mocks.getViewerRsvps.mockResolvedValue([EVENT.id]);
    const view = render(ui());
    expect(await screen.findByTestId('going-mark')).toBeInTheDocument();

    mocks.user = null;
    view.rerender(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
  });

  it('switching user while marks are pending never shows the previous user\'s marks on the (group-wide) events', async () => {
    // The events are the same for every viewer and keyed by the group, so they stay up across the
    // switch (P1586, A1); only the marks are per person.
    const marksA = deferred<string[]>();
    mocks.getViewerRsvps.mockReturnValueOnce(marksA.promise);
    const view = render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();

    const marksB = deferred<string[]>();
    mocks.getViewerRsvps.mockReturnValueOnce(marksB.promise);
    mocks.user = USER_B;
    view.rerender(ui());
    expect(screen.getByText('Clarity Hike')).toBeInTheDocument();
    expect(mocks.getUpcomingEvents).toHaveBeenCalledTimes(1);

    await act(async () => {
      marksA.resolve([EVENT.id]);
    });
    // A's late marks must not attach to B's view.
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();

    await act(async () => {
      marksB.resolve([]);
    });
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
  });

  it('switching group while events and marks are pending never shows the previous group\'s events or marks', async () => {
    const eventsOld = deferred<Ev[]>();
    const marksOld = deferred<string[]>();
    mocks.getUpcomingEvents.mockReturnValueOnce(eventsOld.promise);
    mocks.getViewerRsvps.mockReturnValueOnce(marksOld.promise);
    const view = render(ui('org-id-1'));

    const eventsNew = deferred<Ev[]>();
    mocks.getUpcomingEvents.mockReturnValueOnce(eventsNew.promise);
    mocks.getViewerRsvps.mockResolvedValue([]);
    view.rerender(ui('org-id-2'));

    await act(async () => {
      eventsOld.resolve([{ id: 'event-id-old', title: 'Old Group Event' }]);
      marksOld.resolve(['event-id-old']);
    });
    expect(screen.queryByText('Old Group Event')).not.toBeInTheDocument();
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();

    await act(async () => {
      eventsNew.resolve([{ id: 'event-id-new', title: 'New Group Event' }]);
    });
    expect(screen.getByText('New Group Event')).toBeInTheDocument();
    expect(screen.queryByText('Old Group Event')).not.toBeInTheDocument();
  });
});

describe('P1586 events list: identity comes from the session (P1560)', () => {
  beforeEach(() => {
    mocks.getUpcomingEvents.mockResolvedValue([EVENT]);
  });

  it('(a) profile still A while the session is already B: no A marks and no marks read for A', async () => {
    mocks.user = USER_A;
    mocks.sessionUserId = USER_B.id;
    mocks.getViewerRsvps.mockResolvedValue([EVENT.id]);
    render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
    expect(mocks.getViewerRsvps).not.toHaveBeenCalled();
  });

  it('(b) null to user after the list drew: the list stays drawn, events are not re-read, only marks are', async () => {
    mocks.getViewerRsvps.mockResolvedValue([EVENT.id]);
    const view = render(ui());
    expect(await screen.findByText('Clarity Hike')).toBeInTheDocument();
    expect(mocks.getUpcomingEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getPastEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getViewerRsvps).not.toHaveBeenCalled();

    mocks.user = USER_A;
    view.rerender(ui());
    // The very render after auth resolves: still drawn, never the skeleton.
    expect(screen.getByText('Clarity Hike')).toBeInTheDocument();
    expect(screen.queryByTestId('event-list-skeleton')).not.toBeInTheDocument();
    expect(await screen.findByTestId('going-mark')).toBeInTheDocument();
    expect(mocks.getUpcomingEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getPastEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getViewerRsvps).toHaveBeenCalledTimes(1);
    expect(mocks.getViewerRsvps).toHaveBeenCalledWith([EVENT.id], USER_A.id);
  });

  it('(c) A to B: A\'s marks are never visible, not even for one frame', async () => {
    mocks.user = USER_A;
    mocks.getViewerRsvps.mockResolvedValueOnce([EVENT.id]);
    const view = render(ui());
    expect(await screen.findByTestId('going-mark')).toBeInTheDocument();

    // The session moves to B first; the profile is still A's.
    const marksB = deferred<string[]>();
    mocks.getViewerRsvps.mockReturnValueOnce(marksB.promise);
    mocks.sessionUserId = USER_B.id;
    view.rerender(ui());
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();

    // Then B's profile arrives; B's marks are pending, A's must not return.
    mocks.user = USER_B;
    view.rerender(ui());
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
    expect(screen.getByText('Clarity Hike')).toBeInTheDocument();
    expect(mocks.getViewerRsvps).toHaveBeenLastCalledWith([EVENT.id], USER_B.id);

    await act(async () => {
      marksB.resolve([]);
    });
    expect(screen.queryByTestId('going-mark')).not.toBeInTheDocument();
  });
});
