// @vitest-environment jsdom
/**
 * P1586 §1 "Optional section": the preparation banner renders nothing when it does not apply, but
 * when it applies and is still being read it would push the room's content as it lands, so it holds
 * its footprint with a skeleton. A failed read, or a banner that does not apply, still renders nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const prep = vi.hoisted(() => ({ state: { loading: true, error: false } as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'viewer-id-1' }, session: { user: { id: 'viewer-id-1' } } }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({ usePrepState: () => prep.state }));

import { PrepRoomBanner } from '@/app/prototypes/events/prep/PrepRoom';

const base = { id: 'event-id-1', slug: 'night', hostId: 'host-id-1', preparationEnabled: true };
const show = (event: object | null, source: 'room' | 'event') =>
  render(<MemoryRouter><PrepRoomBanner event={event as never} source={source} /></MemoryRouter>);

beforeEach(() => {
  prep.state = { loading: true, error: false };
});

describe('P1586 PrepRoomBanner while its status is read', () => {
  it.each(['room', 'event'] as const)('%s: an applicable banner shows a skeleton, no text, no spinner', (source) => {
    const { container, getByTestId } = show(base, source);
    const skeleton = getByTestId('prep-banner-skeleton');
    expect(skeleton.querySelectorAll('.animate-pulse.bg-muted').length).toBeGreaterThan(1);
    expect(container.textContent).toBe('');
    expect(container.querySelector('.animate-spin, svg[aria-label="Loading"], .clarity-page-loader')).toBeNull();
  });

  it('a banner that does not apply (the host) renders nothing while loading', () => {
    expect(show({ ...base, hostId: 'viewer-id-1' }, 'room').container.firstChild).toBeNull();
  });

  it('a banner for an event without preparation renders nothing while loading', () => {
    expect(show({ ...base, preparationEnabled: false }, 'event').container.firstChild).toBeNull();
  });

  it('a failed read renders nothing (never "not started" for an unknown state)', () => {
    prep.state = { loading: false, error: true };
    expect(show(base, 'room').container.firstChild).toBeNull();
  });
});
