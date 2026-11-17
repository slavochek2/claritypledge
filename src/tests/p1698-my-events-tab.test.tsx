/**
 * @file p1698-my-events-tab.test.tsx
 * @description P1698: the standalone events list's "My events" tab, the parts a browser cannot cheaply prove.
 *  - where: the personal read is never even called embedded, in a group, or on the webinar-series filter (decisions 1, 9);
 *  - signed out: no added service call at all (9);
 *  - keyed by the session-verified viewer: on sign-out or an account switch the previous person's events and the tab
 *    are gone in the same render, and the page falls back to Upcoming (2, 8);
 *  - while loading: no tab and Upcoming unaffected; a failed read: no tab, page unchanged, no retry loop (7);
 *  - the list itself: upcoming then a "Past" divider then past, Going from the registered ids (3, 5).
 * The end-to-end half (real reads, RLS, marks, ordering, 320px) is e2e/p1698-my-events-tab.spec.ts.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsList } from '@/app/prototypes/events/components/EventsList';

type Ev = { id: string; title: string };
type Mine = { upcoming: Ev[]; past: Ev[]; registeredIds: string[] };

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  /** undefined = the session matches the profile; set to model a session that moved on. */
  sessionUserId: undefined as undefined | null | string,
  getUpcomingEvents: vi.fn(),
  getPastEvents: vi.fn(),
  getViewerRsvps: vi.fn(),
  getMyEvents: vi.fn(),
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
    getMyEvents: (...a: unknown[]) => mocks.getMyEvents(...a),
  },
}));
vi.mock('@/app/prototypes/events/components/EventCard', () => ({
  EventCard: ({ event, isUserGoing }: { event: Ev; isUserGoing?: boolean }) => (
    <article data-testid="card">
      {event.title}
      {isUserGoing && <span data-testid="going-mark">going</span>}
    </article>
  ),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const USER_A = { id: 'user-id-a' };
const USER_B = { id: 'user-id-b' };
const PUBLIC_EVENT: Ev = { id: 'event-id-public', title: 'Public Gathering' };
const A_SOON: Ev = { id: 'event-id-a-soon', title: 'A Hidden Soon' };
const A_LATER: Ev = { id: 'event-id-a-later', title: 'A Registered Later' };
const A_PAST: Ev = { id: 'event-id-a-past', title: 'A Past Event' };
const A_EVENTS: Mine = { upcoming: [A_SOON, A_LATER], past: [A_PAST], registeredIds: [A_LATER.id] };
const MY_TAB = /^My events/;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function ui(props: { embedded?: boolean; orgId?: string } = {}, entry = '/events/list') {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <EventsList {...props} />
    </MemoryRouter>
  );
}

const titles = () => screen.queryAllByTestId('card').map((c) => c.firstChild?.textContent);

beforeEach(() => {
  mocks.user = null;
  mocks.sessionUserId = undefined;
  mocks.getUpcomingEvents.mockReset().mockResolvedValue([PUBLIC_EVENT]);
  mocks.getPastEvents.mockReset().mockResolvedValue([]);
  mocks.getViewerRsvps.mockReset().mockResolvedValue([]);
  mocks.getMyEvents.mockReset().mockResolvedValue(A_EVENTS);
});

describe('P1698 My events: the tab and its list', () => {
  it('a signed-in person with events gets "My events (N)": upcoming first, then a Past divider, Going from the registered read', async () => {
    mocks.user = USER_A;
    render(ui());
    const tab = await screen.findByRole('tab', { name: MY_TAB });
    expect(tab).toHaveTextContent('My events (3)');
    expect(mocks.getMyEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getMyEvents).toHaveBeenCalledWith(USER_A.id, { throwOnError: true, signal: expect.any(AbortSignal) });

    await userEvent.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(titles()).toEqual([A_SOON.title, A_LATER.title, A_PAST.title]);
    const past = screen.getByTestId('my-events-past');
    expect(within(past).getByText('Past')).toBeInTheDocument();
    expect(within(past).getByText(A_PAST.title)).toBeInTheDocument();
    expect(within(past).queryByText(A_SOON.title)).not.toBeInTheDocument();
    // Going comes from the registered ids, not from the global marks read (which never sees a hidden event).
    const going = screen.getAllByTestId('going-mark');
    expect(going).toHaveLength(1);
    expect(going[0]?.closest('article')).toHaveTextContent(A_LATER.title);
  });

  it('a signed-in person with no events gets no tab', async () => {
    mocks.user = USER_A;
    mocks.getMyEvents.mockResolvedValue({ upcoming: [], past: [], registeredIds: [] });
    render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();
    await act(async () => {});
    expect(mocks.getMyEvents).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('without the third pill, the tab row and pills carry today\'s classes byte for byte; with it, the row may wrap', async () => {
    // Copied from main's EventsList before P1698 (`git show main:…EventsList.tsx`, the tablist div and pill template).
    const TODAY_ROW = 'flex gap-1 bg-muted p-1 rounded-lg w-fit';
    const TODAY_PILL = 'px-4 py-2 rounded-md text-sm font-medium transition-colors';
    const view = render(ui());
    await screen.findByText(PUBLIC_EVENT.title);
    expect(screen.getByRole('tablist').className).toBe(TODAY_ROW);
    expect(screen.getByRole('tab', { name: /^Upcoming/ }).className).toBe(`${TODAY_PILL} bg-background text-foreground shadow-sm`);
    expect(screen.getByRole('tab', { name: /^Past/ }).className).toBe(`${TODAY_PILL} text-muted-foreground hover:text-foreground`);
    view.unmount();

    mocks.user = USER_A;
    render(ui());
    await screen.findByRole('tab', { name: MY_TAB });
    expect(screen.getByRole('tablist').className.split(' ')).toEqual(expect.arrayContaining(['flex-wrap', 'max-w-full']));
  });

  it('the past half is omitted when there is nothing past (no empty divider)', async () => {
    mocks.user = USER_A;
    mocks.getMyEvents.mockResolvedValue({ upcoming: [A_SOON], past: [], registeredIds: [] });
    render(ui());
    await userEvent.click(await screen.findByRole('tab', { name: MY_TAB }));
    expect(titles()).toEqual([A_SOON.title]);
    expect(screen.queryByTestId('my-events-past')).not.toBeInTheDocument();
  });
});

describe('P1698 My events: where it exists, and what it costs (decisions 1, 9)', () => {
  it('signed out: the personal read is never called and there is no tab', async () => {
    render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();
    await act(async () => {});
    expect(mocks.getMyEvents).not.toHaveBeenCalled();
    expect(mocks.getViewerRsvps).not.toHaveBeenCalled();
    expect(mocks.getUpcomingEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getPastEvents).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
  });

  it('a profile whose session is someone else counts as nobody: no read for either', async () => {
    mocks.user = USER_A;
    mocks.sessionUserId = USER_B.id;
    render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();
    await act(async () => {});
    expect(mocks.getMyEvents).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
  });

  it.each([
    ['embedded', { embedded: true }, '/events/list'],
    ['group-scoped', { orgId: 'org-id-1' }, '/events/list'],
    ['embedded without a group', { embedded: true, orgId: undefined }, '/events/list'],
    ['webinar-series filtered', {}, '/events/list?series=lost-cofounders'],
  ])('%s: the personal read is never called, even for a signed-in host', async (_label, props, entry) => {
    mocks.user = USER_A;
    render(ui(props, entry));
    await act(async () => {});
    await act(async () => {});
    expect(mocks.getUpcomingEvents).toHaveBeenCalled(); // control: the page did read
    expect(mocks.getMyEvents).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
  });
});

describe('P1698 My events: loading and failure (decision 7)', () => {
  it('while the personal read is out there is no tab, and Upcoming draws as before', async () => {
    mocks.user = USER_A;
    const mine = deferred<Mine>();
    mocks.getMyEvents.mockReturnValue(mine.promise);
    render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveTextContent('Upcoming (1)');
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);

    await act(async () => {
      mine.resolve(A_EVENTS);
    });
    expect(screen.getByRole('tab', { name: MY_TAB })).toBeInTheDocument();
    // Arriving does not move the selection or the Upcoming list.
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    expect(titles()).toEqual([PUBLIC_EVENT.title]);
  });

  it('a failed personal read: no tab, the page unchanged (no failure line), and no retry', async () => {
    mocks.user = USER_A;
    mocks.getMyEvents.mockRejectedValue(new Error('boom'));
    const view = render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Re-renders for the same person never re-ask.
    view.rerender(ui());
    await act(async () => {});
    view.rerender(ui());
    await act(async () => {});
    expect(mocks.getMyEvents).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['still loading', () => new Promise(() => {})],
    ['failed', () => Promise.reject(new Error('boom'))],
  ])('global lists %s, My events selected: Host Event follows the tab shown and is in the header', async (_label, globalRead) => {
    mocks.user = USER_A;
    mocks.getUpcomingEvents.mockImplementation(globalRead);
    render(ui());
    await userEvent.click(await screen.findByRole('tab', { name: MY_TAB }));
    expect(titles()).toEqual([A_SOON.title, A_LATER.title, A_PAST.title]);
    const header = screen.getByRole('heading', { name: 'Events' }).closest('header') as HTMLElement;
    expect(within(header).getByRole('link', { name: /Host Event/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Host Event/ })).toHaveLength(1);
  });

  it('the main lists failing does not take My events away', async () => {
    mocks.user = USER_A;
    mocks.getUpcomingEvents.mockRejectedValue(new Error('boom'));
    render(ui());
    await userEvent.click(await screen.findByRole('tab', { name: MY_TAB }));
    expect(titles()).toEqual([A_SOON.title, A_LATER.title, A_PAST.title]);
  });
});

describe('P1698 My events: keyed by the verified viewer (decisions 2, 8)', () => {
  async function openMyTabAsA() {
    mocks.user = USER_A;
    const view = render(ui());
    await userEvent.click(await screen.findByRole('tab', { name: MY_TAB }));
    expect(titles()).toEqual([A_SOON.title, A_LATER.title, A_PAST.title]);
    return view;
  }

  it('signing out on My events: A\'s events and the tab are gone in the same render, and Upcoming is shown', async () => {
    const view = await openMyTabAsA();
    mocks.user = null;
    view.rerender(ui());
    // No await: the very next render.
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.queryByText(A_SOON.title)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    expect(titles()).toEqual([PUBLIC_EVENT.title]);
    expect(mocks.getMyEvents).toHaveBeenCalledTimes(1);
  });

  it('A to B (B has no events) on My events: A\'s events and the tab are gone in the same render, B is asked', async () => {
    const view = await openMyTabAsA();
    const mineB = deferred<Mine>();
    mocks.getMyEvents.mockReturnValueOnce(mineB.promise);
    mocks.user = USER_B;
    view.rerender(ui());
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.queryByText(A_SOON.title)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.getMyEvents).toHaveBeenLastCalledWith(USER_B.id, { throwOnError: true, signal: expect.any(AbortSignal) });

    await act(async () => {
      mineB.resolve({ upcoming: [], past: [], registeredIds: [] });
    });
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(titles()).toEqual([PUBLIC_EVENT.title]);
  });

  it('A on My events, switch to B, B\'s read then answers with events: the selected tab is Upcoming, not My events', async () => {
    const view = await openMyTabAsA();
    const mineB = deferred<Mine>();
    mocks.getMyEvents.mockReturnValueOnce(mineB.promise);
    mocks.user = USER_B;
    view.rerender(ui());
    await act(async () => {});

    await act(async () => {
      mineB.resolve({ upcoming: [{ id: 'event-id-b', title: 'B Own Event' }], past: [], registeredIds: [] });
    });
    // B gets their own tab, but A's selection does not carry over to it.
    expect(screen.getByRole('tab', { name: MY_TAB })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true');
    expect(titles()).toEqual([PUBLIC_EVENT.title]);
  });

  it('the session moving to B before the profile does: A\'s events are gone at once', async () => {
    const view = await openMyTabAsA();
    mocks.sessionUserId = USER_B.id;
    view.rerender(ui());
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
    expect(screen.queryByText(A_SOON.title)).not.toBeInTheDocument();
  });

  it('A\'s read answering after the switch to B never shows A\'s events to B', async () => {
    mocks.user = USER_A;
    const mineA = deferred<Mine>();
    const mineB = deferred<Mine>();
    mocks.getMyEvents.mockReturnValueOnce(mineA.promise).mockReturnValueOnce(mineB.promise);
    const view = render(ui());
    expect(await screen.findByText(PUBLIC_EVENT.title)).toBeInTheDocument();

    mocks.user = USER_B;
    view.rerender(ui());
    await act(async () => {
      mineA.resolve(A_EVENTS);
    });
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();

    await act(async () => {
      mineB.resolve({ upcoming: [], past: [], registeredIds: [] });
    });
    expect(screen.queryByRole('tab', { name: MY_TAB })).not.toBeInTheDocument();
  });

  it('the previous request is aborted when the viewer changes', async () => {
    mocks.user = USER_A;
    mocks.getMyEvents.mockReturnValueOnce(new Promise(() => {}));
    const view = render(ui());
    await screen.findByText(PUBLIC_EVENT.title);
    const { signal } = mocks.getMyEvents.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);
    mocks.user = null;
    view.rerender(ui());
    expect(signal.aborted).toBe(true);
  });
});
