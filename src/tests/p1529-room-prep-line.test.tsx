/**
 * P1529 D24: the mastermind's room carries no "Preparation not started / Start your preparation" line. The same banner in
 * Clarity Night's room, and on the mastermind's event page, is unchanged.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: false, error: false, progress: { done: 0, total: 3, complete: false }, prep: null }),
}));

import { PrepRoomBanner } from '@/app/prototypes/events/prep/PrepRoom';

const event = (flow: string | null) => ({ id: 'ev-1', slug: 'night', hostId: 'host-1', preparationEnabled: true, flow }) as never;
const show = (flow: string | null, source: 'room' | 'event') =>
  render(<MemoryRouter><PrepRoomBanner event={event(flow)} source={source} /></MemoryRouter>);

describe('the room\'s preparation line', () => {
  it('is hidden in the mastermind\'s room', () => {
    show('sales-mastermind', 'room');
    expect(screen.queryByTestId('prep-room-banner')).toBeNull();
    expect(screen.queryByText('Preparation not started')).toBeNull();
    expect(screen.queryByText('Start your preparation')).toBeNull();
  });
  it('is unchanged in Clarity Night\'s room', () => {
    show('clarity-night', 'room');
    expect(screen.getByText('Preparation not started')).toBeTruthy();
    expect(screen.getByText('Start your preparation')).toBeTruthy();
  });
  it('is unchanged on the mastermind\'s event page', () => {
    show('sales-mastermind', 'event');
    expect(screen.getByText('Start your preparation')).toBeTruthy();
  });
});
