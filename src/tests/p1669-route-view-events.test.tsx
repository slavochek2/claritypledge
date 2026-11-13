/**
 * P1669 — the mounted route view events, with a real router: one event per view, again on a new
 * slug or conversation, never on a re-render or a thread inside the same conversation, and no
 * conversation id in anything sent. The offline preloader is stubbed (it has its own tests).
 */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';

const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/app/components/offline/offline-pack-preloader', () => ({ OfflinePackPreloader: () => null }));
const auth = { user: { id: 'user-id-1234' } as { id: string } | null, sessionChecked: true };
vi.mock('@/auth', () => ({ useAuth: () => auth }));

import { AppRouteEffects } from '@/app/components/layout/app-route-effects';

let navigate: NavigateFunction = () => {};
function Nav() {
  navigate = useNavigate();
  return null;
}

function mount(start: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[start]}>
        <Nav />
        <AppRouteEffects />
      </MemoryRouter>
    </StrictMode>,
  );
}

const go = (to: string) => act(() => navigate(to));

describe('AppRouteEffects route view events', () => {
  beforeEach(() => {
    track.mockClear();
    auth.user = { id: 'user-id-1234' };
    auth.sessionChecked = true;
  });

  it('waits for the session before judging a route, then fires once', () => {
    auth.sessionChecked = false;
    const { rerender } = mount('/feed');
    expect(track).not.toHaveBeenCalled();
    auth.sessionChecked = true;
    rerender(
      <StrictMode>
        <MemoryRouter initialEntries={['/feed']}>
          <Nav />
          <AppRouteEffects />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(track.mock.calls).toEqual([['feed_viewed', undefined]]);
  });

  it('a signed-out visit to /chats sends nothing', () => {
    auth.user = null;
    mount('/chats');
    expect(track).not.toHaveBeenCalled();
  });

  it('fires once per view under StrictMode, again on a new slug, nothing on unmapped routes', () => {
    mount('/feed');
    expect(track.mock.calls).toEqual([['feed_viewed', undefined]]);
    go('/groups/cm');
    go('/groups/cm');
    go('/groups/run-club');
    go('/');
    expect(track.mock.calls.map((c) => c[0])).toEqual(['feed_viewed', 'group_viewed', 'group_viewed']);
    expect(track.mock.calls[2]).toEqual(['group_viewed', { org_slug: 'run-club' }]);
  });

  it('chats: list, then each conversation once, a thread in the same one does not refire, ids never sent', () => {
    mount('/chats');
    go('/chats/c/conv-a');
    go('/chats/c/conv-a/t/root-1');
    go('/chats/c/conv-b');
    go('/chats');
    expect(track.mock.calls.map((c) => c[0])).toEqual(['chats_viewed', 'chat_opened', 'chat_opened', 'chats_viewed']);
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/conv-|root-/);
  });

  it('event prepare and RSVP confirm carry the event slug', () => {
    mount('/events/cm-hike/prepare');
    go('/events/cm-hike/confirm');
    expect(track.mock.calls).toEqual([
      ['event_prepare_viewed', { event_slug: 'cm-hike' }],
      ['event_rsvp_confirm_viewed', { event_slug: 'cm-hike' }],
    ]);
  });
});
