// @vitest-environment jsdom
/**
 * P1586 §2 "Page → ClarityPageLoader" (blank frame before a redirect): a frozen event's /ready
 * redirects to /meet. Until that redirect lands the page shows the page loader, never a blank frame.
 * `Navigate` is a probe here so the pre-redirect frame stays observable.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
      <i data-testid="redirect" data-to={to} data-replace={String(!!replace)} />
    ),
  };
});
vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null, isLoading: false, sessionChecked: true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => ({
    slug: 'night-2',
    // Started long ago: past the grace window, so the room is frozen.
    event: { id: 'event-id-1', slug: 'night-2', datetime: '2020-01-01T10:00:00Z' },
    loading: false,
    granted: true,
    isLoggedIn: true,
    offline: false,
  }),
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn(), runSelfWrite: vi.fn() }),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ isCapturingForEvent: () => false, barVisible: false }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useOfflineStripShown: () => false,
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflinePageReport: () => {},
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn(() => new Promise(() => {})),
  setRoomReadiness: vi.fn(),
  subscribeToRoomRoster: vi.fn(() => () => {}),
}));
vi.mock('@/app/prototypes/events/rounds/RoomSteps', () => ({ RoomSteps: () => null }));

import { EventRoomReady } from '@/app/prototypes/events/components/EventRoomReady';

describe('P1586 EventRoomReady, frozen event', () => {
  it('shows the page loader (not a blank frame) while it redirects to /meet', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/events/night-2/ready']}>
        <Routes>
          <Route path="/events/:slug/ready" element={<EventRoomReady />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.firstChild, 'a blank frame before the redirect').not.toBeNull();
    expect(container.querySelector('.clarity-page-loader')).not.toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
    const redirect = screen.getByTestId('redirect');
    expect(redirect).toHaveAttribute('data-to', '/events/night-2/meet');
    expect(redirect).toHaveAttribute('data-replace', 'true');
  });
});
