/**
 * @file p1604-shell-route-audit.test.tsx
 * @description P1604 (founder, 2026-11-04): a signed-in person on desktop gets the sidebar shell on EVERY route unless the route is
 * deliberately immersive or deliberately keeps another chrome. /transcribe showed the old top menu by accident (P1149 folded it
 * into the /live gates). This reads src/App.tsx, takes every <Route> that mounts a ClarityLandingLayout with its real props
 * (surface, compact, logoOnly, chromeFree, roomShell), renders the layout for a signed-in person and classifies the chrome:
 *   shell    the sidebar            top-nav  the old top menu            none  no menu at all (chromeFree / immersive)
 * A route that shows the top menu or no menu must be in DELIBERATE below with its reason; any other is a failure, so a new
 * route cannot ship the wrong chrome by accident. The audit's own control: /transcribe is in the table and must be a shell.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const mockUnread = vi.fn();
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => mockUnread() }));
// P1545: the Artifacts badge is unread "Shared with you" (same shape, same values).
vi.mock('@/app/hooks/useUnreadSharedCount', () => ({ useUnreadSharedCount: () => mockUnread() }));
const mockPartnerCount = vi.fn();
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => mockPartnerCount(),
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null, loading: false }) }));

const mockTonight = vi.fn();
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => mockTonight(),
}));

import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
import { isPublicSitePath } from '@/app/components/layout/nav-links';

const signedIn = {
  session: { user: { id: 'u1' } },
  user: { id: 'u1', slug: 'ada', name: 'Ada', isVerified: true, hasPledged: false, avatarColor: '#10b981' },
  isLoading: false,
  sessionChecked: true,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
};


interface AppRoute { path: string; surface: 'product' | 'public'; compact: boolean; logoOnly: boolean; chromeFree: boolean; roomShell: boolean }

/** Every <Route path="..."> in App.tsx whose element mounts a ClarityLandingLayout, with that layout's props. */
function appRoutes(): AppRoute[] {
  const src = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
  const out: AppRoute[] = [];
  for (const m of src.matchAll(/<Route\s+(?:[^>]*?\s)?path="([^"]+)"/gs)) {
    const start = (m.index ?? 0) + m[0].length;
    const next = src.slice(start).search(/<Route\b/);
    const seg = src.slice(start, start + Math.min(next < 0 ? 2500 : next, 2500));
    const layout = /<ClarityLandingLayout\s+([^>]*)>/.exec(seg);
    if (!layout) continue;
    const props = layout[1];
    const has = (f: string) => new RegExp(`\\b${f}\\b`).test(props);
    out.push({
      path: m[1],
      surface: /surface="public"/.test(props) ? 'public' : 'product',
      compact: has('compact'), logoOnly: has('logoOnly'), chromeFree: has('chromeFree'), roomShell: has('roomShell'),
    });
  }
  return out;
}

type Chrome = 'shell' | 'top-nav' | 'none';

function chromeOf(r: AppRoute): Chrome {
  const url = r.path.replace(/:[A-Za-z]+/g, 'x').replace(/\/\*$/, '/x');
  const { container, unmount } = render(
    <MemoryRouter initialEntries={[url]}>
      <ClarityLandingLayout surface={r.surface} compact={r.compact} logoOnly={r.logoOnly} chromeFree={r.chromeFree} roomShell={r.roomShell}>
        <div>page body</div>
      </ClarityLandingLayout>
    </MemoryRouter>,
  );
  const result: Chrome = container.querySelector('[data-nav="sidebar"]') ? 'shell'
    : container.querySelector('[data-nav="main"]') ? 'top-nav' : 'none';
  unmount();
  return result;
}

/**
 * The routes that deliberately do NOT show the sidebar for a signed-in desktop person, each with why. Everything else must.
 * /stake/:tag moved into the shell by founder decision, so it is no longer listed.
 */
const DELIBERATE: Record<string, { chrome: Chrome; why: string }> = {
  '/live': { chrome: 'top-nav', why: 'immersive two-person session (founder: live and letters stay immersive)' },
  '/live/:code': { chrome: 'top-nav', why: 'immersive two-person session' },
  '/meet': { chrome: 'top-nav', why: 'single-focus terms page: one tap on one button; compact on purpose (P1016, P1024)' },
  '/ready': { chrome: 'top-nav', why: 'single-focus page upstream of /meet (P1077)' },
  '/events/:slug/host': { chrome: 'top-nav', why: 'the host console stays compact (P1542: "/host stays compact")' },
  '/intro': { chrome: 'none', why: 'logo-only intro' },
  '/auth/callback': { chrome: 'none', why: 'logo-only sign-in hand-off' },
  '/explain-back/:id': { chrome: 'none', why: 'chromeFree focus page (P904)' },
  '/letter/:docId/preview': { chrome: 'none', why: 'chromeFree letter flow (P665)' },
  '/letter/:letterId/confirm': { chrome: 'none', why: 'chromeFree letter flow (P684)' },
  '/letter/:docId/compose': { chrome: 'none', why: 'immersive letter compose (P852)' },
  '/cm': { chrome: 'none', why: 'chromeFree calendar page (P909)' },
  '/prepare': { chrome: 'none', why: 'immersive preparation (P1542: a page may declare the app menu back)' },
  '/events/:slug/prepare': { chrome: 'none', why: 'immersive preparation (P1542)' },
  '/events/:slug/close': { chrome: 'none', why: 'the event close ritual is immersive (P1542)' },
};
/** The marketing site read while signed in keeps the PUBLIC top nav with "Open app" (P1512): isPublicSitePath is that rule. */

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockUseAuth.mockReturnValue(signedIn);
  mockUnread.mockReturnValue({ count: 0, loading: false });
  mockPartnerCount.mockReturnValue({ count: 0, loading: false });
  mockTonight.mockReturnValue(null);
});

const routes = appRoutes();

describe('signed-in desktop chrome, every route in App.tsx', () => {
  it('finds the routes (the parse is not blind)', () => {
    expect(routes.length).toBeGreaterThan(60);
    expect(routes.map((r) => r.path)).toEqual(expect.arrayContaining(['/transcribe', '/transcribe/:code', '/live', '/feed', '/chats/*']));
  });

  it.each(routes.map((r) => [r.path, r] as const))('%s', (path, r) => {
    const actual = chromeOf(r);
    const expected = DELIBERATE[path]?.chrome ?? (r.surface === 'public' && isPublicSitePath(path) ? 'top-nav' : 'shell');
    expect(`${path} -> ${actual}`, DELIBERATE[path]?.why ?? 'a signed-in person on this route gets the sidebar shell').toBe(`${path} -> ${expected}`);
  });

  it('CONTROL: /transcribe and /transcribe/:code are inside the shell (the old behaviour was the top menu)', () => {
    for (const p of ['/transcribe', '/transcribe/:code']) {
      const r = routes.find((x) => x.path === p);
      expect(r, `${p} is in App.tsx`).toBeDefined();
      expect(chromeOf(r!)).toBe('shell');
    }
  });

  it('CONTROL: the audit can see a top menu (/live is one) and a chromeless page (/cm)', () => {
    expect(chromeOf(routes.find((x) => x.path === '/live')!)).toBe('top-nav');
    expect(chromeOf(routes.find((x) => x.path === '/cm')!)).toBe('none');
  });
});

describe('/transcribe inside the shell: its screens do not keep padding for a nav that is gone', () => {
  // The join, room and ended views share ONE frame (founder: Stop never navigates), so the padding lives there and only there.
  const page = readFileSync(resolve(__dirname, '../app/pages/transcribe-room-frame.tsx'), 'utf8');
  const pageSource = readFileSync(resolve(__dirname, '../app/pages/transcribe-room-page.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  it('every screen that pads itself below the fixed nav says so, so the shell can take that padding back', () => {
    const padded = (page.match(/pt-\[calc\(4rem\+env\(safe-area-inset-top\)\+[12]rem\)\]/g) ?? []).length;
    const marked = (page.match(/data-clears-nav="[12]"/g) ?? []).length;
    expect(padded).toBeGreaterThan(0);
    expect(marked, 'one marker per padded screen').toBe(padded);
    expect(pageSource, 'and the page pads nothing of its own, so no screen escapes the frame').not.toMatch(/pt-\[calc\(4rem\+env\(safe-area-inset-top\)/);
  });
  it('and the stylesheet gives the shell that rule, for the gap each screen wanted', () => {
    expect(css).toMatch(/\[data-shell-top-nav="none"\] \[data-clears-nav="1"\][^}]*env\(safe-area-inset-top\) \+ 1rem/);
    expect(css).toMatch(/\[data-shell-top-nav="none"\] \[data-clears-nav="2"\][^}]*env\(safe-area-inset-top\) \+ 2rem/);
  });
});
