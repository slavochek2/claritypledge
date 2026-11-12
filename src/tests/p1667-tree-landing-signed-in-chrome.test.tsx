/**
 * P1667 — a signed-in person on the two /tree/landing-fable* pages sees the public site menu
 * (with "Open app"), not the app sidebar: they are marketing pages. Renders the real
 * ClarityLandingLayout with the props tree-routes.tsx gives it, as the P1604 shell audit does for
 * App.tsx. Control: /tree/old-landing mounts the same layout and is not on the list, so it must
 * still get the sidebar — without it, a layout that never drew a sidebar would pass.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => ({ links: [] })), getUpcomingEvents: vi.fn(async () => []) },
}));
vi.mock('@/app/contexts/live-session-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/live-session-context')>()),
  useLiveSession: () => ({
    isLive: false,
    activeSessionCode: null,
    activeSessionPartnerName: null,
    activeSessionRole: null,
    activeSessionGuestDisplayName: null,
    setActiveSession: vi.fn(),
    clearActiveSession: vi.fn(),
  }),
}));
const count = { count: 0, loading: false };
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => count }));
vi.mock('@/app/hooks/useUnreadSharedCount', () => ({ useUnreadSharedCount: () => count }));
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({ usePendingPartnerInvitationCount: () => count }));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null, loading: false }) }));
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => null,
}));

import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const signedIn = {
  session: { user: { id: 'user-id-1234' } },
  user: { id: 'user-id-1234', slug: 'ada', name: 'Ada', isVerified: true, hasPledged: false, avatarColor: '#3b82f6' },
  isLoading: false,
  sessionChecked: true,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
};

const routes = readFileSync(`${process.cwd()}/src/app/tree/tree-routes.tsx`, 'utf8');

function chromeAt(path: string) {
  const line = routes.split('\n').find((l) => l.includes(`path="${path}"`));
  expect(line, `tree-routes.tsx has a route line for ${path}`).toBeDefined();
  expect(line, `${path} mounts the public layout`).toContain('<ClarityLandingLayout surface="public">');
  const { container, unmount } = render(
    <MemoryRouter initialEntries={[path]}>
      <ClarityLandingLayout surface="public">
        <div>page body</div>
      </ClarityLandingLayout>
    </MemoryRouter>,
  );
  const result = {
    sidebar: !!container.querySelector('[data-nav="sidebar"]'),
    topNav: !!container.querySelector('[data-nav="main"]'),
    openApp: /Open app/.test(container.textContent ?? ''),
  };
  unmount();
  return result;
}

beforeEach(() => {
  localStorage.clear();
  mockUseAuth.mockReturnValue(signedIn);
});

describe('P1667: signed-in chrome on the landing redesign pages', () => {
  it.each(['/tree/landing-fable', '/tree/landing-fable-change'])('%s draws the public menu with "Open app" and no sidebar', (path) => {
    expect(chromeAt(path)).toEqual({ sidebar: false, topNav: true, openApp: true });
  });

  it('control: /tree/old-landing, same layout and not on the list, still gets the sidebar', () => {
    expect(chromeAt('/tree/old-landing').sidebar).toBe(true);
  });
});
