/**
 * @file p1433-event-night-navigation.test.tsx
 * @description P1433 — event-night navigation (Clarity Night 2026-10-06 findings H1–H3):
 *   D1/D2 who sees "Today's event" and where it goes (pure rules; the header rendering is in
 *         p1087-nav-groups.test.tsx),
 *   D3    "Go back" with nowhere in-app to go lands in the room during the window,
 *   D4    a return visit to the room goes straight to the table; a first visit to Ready.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  eventNightBackFallback,
  pickWindowEvent,
  todaysEventWindowOpen,
  type TonightsEvent,
} from '@/app/hooks/useTonightsEvent';

// ── D3 wiring: useGoBack reads useTonightsEvent; the rest of that module stays real. ──
const tonight = vi.hoisted(() => ({ current: null as null | TonightsEvent }));
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => tonight.current,
}));

// ── D4 wiring: the room gate's collaborators. ──
const room = vi.hoisted(() => ({
  readiness: null as number | null,
  capturing: false,
  arrivalGate: false as boolean | null,
  prepGate: false as boolean | null,
}));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => ({
    slug: 'night-2', event: { id: 'ev-1', slug: 'night-2' }, loading: false, granted: true, isLoggedIn: true, offline: false,
  }),
  useEventRoomSelf: () => ({ self: room.readiness == null ? { readinessValue: null } : { readinessValue: room.readiness }, loading: false }),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({
  useRoomPrepGate: () => ({ gate: room.prepGate }),
  PrepRoomGate: () => <p data-testid="prep-gate" />,
}));
vi.mock('@/app/prototypes/events/arrival/ArrivalGate', () => ({
  useArrivalGate: () => ({ gate: room.arrivalGate, answered: () => {} }),
  ArrivalQuestion: () => <p data-testid="arrival-question" />,
}));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ isCapturingForEvent: () => room.capturing }),
}));

import { FocusHeader } from '@/app/components/layout/focus-header';
import { EventRoomGate } from '@/app/prototypes/events/components/EventRoomGate';

// A Clarity Night: 2026-10-06 18:00 ICT (11:00Z), 3 hours, preparation on.
const night: TonightsEvent = {
  slug: 'night-2', title: 'Clarity Night', datetime: '2026-10-06T11:00:00Z', durationMinutes: 180, preparationEnabled: true,
};
const at = (iso: string) => new Date(iso);

describe('P1433 D1 — the event-night window: 1h before start to 3h after end', () => {
  it('opens an hour before the start', () => {
    expect(todaysEventWindowOpen(night, at('2026-10-06T09:59:59Z'))).toBe(false);
    expect(todaysEventWindowOpen(night, at('2026-10-06T10:00:00Z'))).toBe(true);
  });
  it('stays open three hours after the end, then closes', () => {
    // end = 14:00Z; +3h = 17:00Z
    expect(todaysEventWindowOpen(night, at('2026-10-06T17:00:00Z'))).toBe(true);
    expect(todaysEventWindowOpen(night, at('2026-10-06T17:00:01Z'))).toBe(false);
  });
  it('an unknown duration counts as an hour (the room\'s own default)', () => {
    const e = { ...night, durationMinutes: null };
    expect(todaysEventWindowOpen(e, at('2026-10-06T15:00:00Z'))).toBe(true);
    expect(todaysEventWindowOpen(e, at('2026-10-06T15:00:01Z'))).toBe(false);
  });
});

describe('P1433 D2 — what a person NOT registered is shown', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    slug: 'night-2', title: 'Clarity Night', datetime: '2026-10-06T11:00:00Z', timezone: 'Asia/Bangkok',
    status: 'upcoming', duration_minutes: 180, preparation_enabled: true, ...over,
  });

  it('a prep-enabled event inside its window', () => {
    expect(pickWindowEvent([row()], at('2026-10-06T12:00:00Z'))).toMatchObject({ slug: 'night-2', registered: false, preparationEnabled: true });
  });
  it('nothing outside the window (earlier the same day, or after it closed)', () => {
    expect(pickWindowEvent([row()], at('2026-10-06T05:00:00Z'))).toBeNull();
    expect(pickWindowEvent([row()], at('2026-10-06T17:30:00Z'))).toBeNull();
  });
  it('never a prep-off event (hikes, external hosts) — those are registered-only', () => {
    expect(pickWindowEvent([row({ preparation_enabled: false })], at('2026-10-06T12:00:00Z'))).toBeNull();
  });
  it('never a cancelled event', () => {
    expect(pickWindowEvent([row({ status: 'cancelled' })], at('2026-10-06T12:00:00Z'))).toBeNull();
  });
  it('the earliest when two windows overlap', () => {
    const r = pickWindowEvent([row({ slug: 'late', datetime: '2026-10-06T11:30:00Z' }), row({ slug: 'early' })], at('2026-10-06T12:00:00Z'));
    expect(r?.slug).toBe('early');
  });
});

describe('P1433 D3 — eventNightBackFallback', () => {
  const mid = at('2026-10-06T12:00:00Z');
  it('the room, from a page outside the event, in the window', () => {
    expect(eventNightBackFallback(night, '/point/abc', mid)).toBe('/events/night-2/room');
  });
  it('null outside the window — the page keeps its own fallback', () => {
    expect(eventNightBackFallback(night, '/point/abc', at('2026-10-06T06:00:00Z'))).toBeNull();
  });
  it('null for a prep-off event (it has no room)', () => {
    expect(eventNightBackFallback({ ...night, preparationEnabled: false }, '/point/abc', mid)).toBeNull();
  });
  it('null inside the event\'s own pages — /ready → /room would loop back to /ready', () => {
    for (const p of ['/events/night-2', '/events/night-2/ready', '/events/night-2/meet', '/events/night-2/prepare']) {
      expect(eventNightBackFallback(night, p, mid), p).toBeNull();
    }
  });
  it('null with no event', () => {
    expect(eventNightBackFallback(null, '/point/abc', mid)).toBeNull();
  });
});

function Here() {
  const loc = useLocation();
  return <p data-testid="path">{loc.pathname}</p>;
}
const path = () => screen.getByTestId('path').textContent;

describe('P1433 D3 — "Go back" during the event night', () => {
  beforeEach(() => { tonight.current = null; });
  afterEach(() => vi.restoreAllMocks());

  // An event in its window right now (starts in 30 minutes).
  const nowNight = (): TonightsEvent => ({ ...night, datetime: new Date(Date.now() + 30 * 60 * 1000).toISOString() });

  function renderPoint(entries: string[]) {
    return render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/point/:id" element={<><FocusHeader fallback="/feed" /><Here /></>} />
          <Route path="*" element={<Here />} />
        </Routes>
      </MemoryRouter>,
    );
  }
  const cold = () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
  };

  it('a fresh entry (nowhere in-app to go) lands in the room, not /feed (H2)', () => {
    cold();
    tonight.current = nowNight();
    renderPoint(['/point/abc']);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(path()).toBe('/events/night-2/room');
  });

  it('control: with no event night the same click goes to /feed', () => {
    cold();
    renderPoint(['/point/abc']);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(path()).toBe('/feed');
  });

  it('with an in-app page to return to, it still pops there ("back to where you came from")', () => {
    tonight.current = nowNight();
    renderPoint(['/events/night-2/meet', '/point/abc']);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(path()).toBe('/events/night-2/meet');
  });
});

describe('P1433 D4 — room re-entry resumes at the table (supersedes P1307 D10)', () => {
  beforeEach(() => {
    room.readiness = null;
    room.capturing = false;
    room.arrivalGate = false;
    room.prepGate = false;
  });

  function renderRoom() {
    return render(
      <MemoryRouter initialEntries={['/events/night-2/room']}>
        <Routes>
          <Route path="/events/:slug/room" element={<EventRoomGate />} />
          <Route path="*" element={<Here />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('first visit (no readiness yet): Ready', () => {
    renderRoom();
    expect(path()).toBe('/events/night-2/ready');
  });

  it('return visit (readiness already set): straight to the table', () => {
    room.readiness = 7;
    renderRoom();
    expect(path()).toBe('/events/night-2/meet');
  });

  it('readiness 0 is a set value, not "none"', () => {
    room.readiness = 0;
    renderRoom();
    expect(path()).toBe('/events/night-2/meet');
  });

  it('already being transcribed: the table (unchanged)', () => {
    room.capturing = true;
    renderRoom();
    expect(path()).toBe('/events/night-2/meet');
  });

  it('invariant: "Have you arrived?" still comes first on a return visit', () => {
    room.readiness = 7;
    room.arrivalGate = true;
    renderRoom();
    expect(screen.getByTestId('arrival-question')).toBeInTheDocument();
  });

  it('invariant: the preparation offer still comes first on a return visit', () => {
    room.readiness = 7;
    room.prepGate = true;
    renderRoom();
    expect(screen.getByTestId('prep-gate')).toBeInTheDocument();
  });
});

describe('P1433 review — the public pick opens on its own while the page sits still', () => {
  it('an event 2h out: absent now, present once its window opens (no navigation, no refetch)', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-10-06T09:00:00Z');
    vi.setSystemTime(start);
    const rows = [{ slug: 'later', title: 'L', datetime: '2026-10-06T11:00:00Z', timezone: 'UTC', status: 'upcoming', duration_minutes: 60, preparation_enabled: true }];
    expect(pickWindowEvent(rows, new Date())).toBeNull();
    vi.setSystemTime(new Date('2026-10-06T10:00:30Z'));
    expect(pickWindowEvent(rows, new Date())?.slug).toBe('later');
    vi.useRealTimers();
  });
});
