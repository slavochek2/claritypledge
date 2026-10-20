/**
 * @file p1512-prep-banner-marker.test.tsx
 * @description P1512: the preparation's end-screen "Back to the event" pops only when the event page opened it. The event
 * page's banner (source="event") therefore marks the route state; the room's banner (source="room") does not,
 * since the entry below prepare is then a room page.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: false, error: false, progress: { done: 0, total: 3, complete: false }, prep: null }),
}));

import { PrepRoomBanner } from '@/app/prototypes/events/prep/PrepRoom';

const event = { id: 'ev-1', slug: 'night', hostId: 'host-1', preparationEnabled: true } as never;

function Prepare() {
  const loc = useLocation();
  return <p data-testid="prepare">{loc.pathname + loc.search + '|' + JSON.stringify(loc.state)}</p>;
}

function renderBanner(source: 'event' | 'room') {
  return render(
    <MemoryRouter initialEntries={['/events/night']}>
      <Routes>
        <Route path="/events/:slug" element={<PrepRoomBanner event={event} source={source} />} />
        <Route path="/events/:slug/prepare" element={<Prepare />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1512 PrepRoomBanner marks who opened prepare', () => {
  it('the event page banner marks fromEvent', () => {
    renderBanner('event');
    fireEvent.click(screen.getByTestId('prep-room-banner-cta'));
    expect(screen.getByTestId('prepare').textContent).toBe('/events/night/prepare|{"fromEvent":true}');
  });

  it('the room banner does not (and keeps ?from=room)', () => {
    renderBanner('room');
    fireEvent.click(screen.getByTestId('prep-room-banner-cta'));
    expect(screen.getByTestId('prepare').textContent).toBe('/events/night/prepare?from=room|null');
  });
});
