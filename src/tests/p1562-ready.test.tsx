// @vitest-environment jsdom
/**
 * P1562: Clarity Night's /ready.
 *  - §3.1: a series without readiness (a hike) or a frozen evening redirects to /meet — the loader shows until the
 *    redirect lands (never `return null`), and the redirect carries `fromEvent` forward.
 *  - §1/§2: its Back is "Back to the event" in the shell top bar; pop when the event page opened the room, else replace.
 *  - §2: Ready -> Meet carries `fromReady` AND `fromEvent`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ShellTopBar, ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn() }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn().mockResolvedValue([]),
  setRoomReadiness: vi.fn(),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));

// The redirect's element, recorded instead of followed, so the frame it renders in can be read.
const redirects = vi.hoisted(() => [] as { to: unknown; replace?: boolean; state?: unknown }[]);
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: (props: { to: unknown; replace?: boolean; state?: unknown }) => {
      redirects.push(props);
      return null;
    },
  };
});

import { EventRoomReady } from '@/app/prototypes/events/components/EventRoomReady';

const night = { id: 'ev-1', slug: 'night', title: 'Night', datetime: '2099-01-01T11:00:00Z', durationMinutes: 60, hostId: 'h', seriesSlug: null };

function Page({ name }: { name: string }) {
  const state = useLocation().state as Record<string, unknown> | null;
  return <p data-testid="page" data-state={JSON.stringify(state)}>{name}</p>;
}

beforeEach(() => {
  redirects.length = 0;
  room.access = { slug: 'night', event: night, loading: false, granted: true, isLoggedIn: true, offline: false };
});

describe('/ready redirects with the loader up and fromEvent carried', () => {
  it.each([
    ['a hike (no readiness step)', { ...night, seriesSlug: 'social-hike' }],
    ['a frozen evening', { ...night, datetime: '2000-01-01T11:00:00Z' }],
  ])('%s', (_name, event) => {
    room.access = { ...room.access as object, event };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/events/night/ready', state: { fromEvent: true } }]}>
        <Routes><Route path="/events/:slug/ready" element={<EventRoomReady />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('boot-loader')).toBeInTheDocument();
    expect(redirects.at(-1)).toMatchObject({ to: '/events/night/meet', replace: true, state: { fromEvent: true } });
  });
});

function mountReady(entries: (string | { pathname: string; state: unknown })[], inShell = false) {
  return render(
    <ShellTopBarProvider enabled={inShell}>
      {inShell && <ShellTopBar />}
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/events" element={<Page name="list" />} />
          <Route path="/events/:slug" element={<><FocusHeader fallback="/events" /><Page name="event" /></>} />
          <Route path="/events/:slug/ready" element={<EventRoomReady />} />
          <Route path="/events/:slug/meet" element={<Page name="meet" />} />
        </Routes>
      </MemoryRouter>
    </ShellTopBarProvider>,
  );
}

describe("/ready's Back: the shell top bar's \"Back to the event\"", () => {
  it('renders in the shell top bar, labelled, and there is no compact arrow', () => {
    mountReady([{ pathname: '/events/night/ready', state: { fromEvent: true } }], true);
    const bar = document.querySelector('[data-shell-top-bar]') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Back to the event' })).toHaveTextContent('Back to the event');
    expect(screen.queryByTestId('room-back')).toBeNull();
  });

  it('opened by the event page (fromEvent): pops, so the event\'s own Back reaches the list', async () => {
    mountReady(['/events', '/events/night', { pathname: '/events/night/ready', state: { fromEvent: true } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('list'));
  });

  it('no mark (a cold entry, another page below): replaces with the event, never pops elsewhere', async () => {
    mountReady(['/events', '/somewhere', '/events/night/ready']);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('event'));
  });

  it('Continue opens Meet with fromReady and fromEvent', async () => {
    mountReady([{ pathname: '/events/night/ready', state: { fromEvent: true } }]);
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('meet'));
    expect(JSON.parse(screen.getByTestId('page').dataset.state!)).toEqual({ fromReady: true, fromEvent: true });
  });
});

describe('round 5 (B1, B2): the head of /ready', () => {
  it("B2: the step bar is in the room's sticky head — the same element and offset as /meet", () => {
    mountReady([{ pathname: '/events/night/ready', state: { fromEvent: true } }], true);
    const head = screen.getByTestId('room-sticky-head');
    expect(head.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'z-20', 'bg-background']));
    expect(head.className).toContain('top-[calc(4rem+var(--room-head-offset)+env(safe-area-inset-top))]');
    expect(head.style.getPropertyValue('--room-head-offset')).toBe('0px');
    expect(within(head).getByTestId('room-steps')).toBeInTheDocument();
  });

  it('B1: in the shell bar the Back may shrink and its label truncates; the arrow and the accessible name stay', () => {
    mountReady([{ pathname: '/events/night/ready', state: { fromEvent: true } }], true);
    const back = within(document.querySelector('[data-shell-top-bar]') as HTMLElement).getByRole('button', { name: 'Back to the event' });
    expect(back.className.split(' ')).toContain('min-w-0');
    // Not max-w-full: with the button's -ml-3, the slot sizes to the button minus 12px, and a 100% cap then clips the
    // label by 12px even with nothing in the right slot ("Back to the e…" at 375, final screenshots).
    expect(back.className.split(' ')).not.toContain('max-w-full');
    const label = back.querySelector('span');
    expect(label?.textContent).toBe('Back to the event');
    expect(label?.className.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'truncate']));
    expect(back.querySelector('svg')).not.toBeNull();
  });
});

