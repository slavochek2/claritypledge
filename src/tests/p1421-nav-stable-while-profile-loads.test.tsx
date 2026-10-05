/**
 * @file p1421-nav-stable-while-profile-loads.test.tsx
 * @description P1421 — while a known session's profile loads, the signed-in chrome already
 * has its final slots, so nothing reflows under the cursor when the profile lands.
 * Pixel stability itself is bound by e2e/p1421-nav-stable-while-profile-loads.spec.ts.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => ({ links: [] })), getUpcomingEvents: vi.fn(async () => []) },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/contexts/live-session-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/live-session-context')>()),
  // Every field the layout's consumers read (BottomNav, useActiveSession): a partial fake left
  // useActiveSession calling an undefined clearActiveSession as an unhandled rejection.
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

import { SimpleNavigation } from '@/app/components/layout/simple-navigation';
import { BottomNav } from '@/app/components/layout/bottom-nav';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
import { hasNavVerifiedHint, setNavVerifiedHint } from '@/lib/nav-verified-hint';
import { EventLinksMenu } from '@/app/components/layout/event-links-menu';

const loading = {
  session: { user: { id: 'u1' } },
  user: null,
  isLoading: true,
  sessionChecked: true,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
};
const loaded = {
  ...loading,
  isLoading: false,
  user: { id: 'u1', slug: 'ada', name: 'Ada', isVerified: true, hasPledged: false },
};
const signedOut = { ...loading, session: null, isLoading: false };

const slotLabels = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('[data-nav-slot-placeholder]')).map((el) =>
    el.getAttribute('data-nav-slot-placeholder'),
  );

describe('P1421: header holds its signed-in slots while the profile loads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setNavVerifiedHint('u1', true); // this device last saw u1 resolve verified
  });

  it('renders Partners, My Profile and avatar as inert slots in their final order', () => {
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    const main = container.querySelector('[data-nav="main"]') as HTMLElement;
    expect(slotLabels(main)).toEqual(['Partners', 'My Profile', 'avatar']);
    // Order matches the loaded row: Home, Letters, Partners, Groups, My Profile.
    const row = main.querySelector('.hidden.lg\\:flex') as HTMLElement;
    const order = Array.from(row.querySelectorAll('a, [data-nav-slot-placeholder]'))
      .map((el) => el.getAttribute('data-nav-slot-placeholder') ?? el.textContent?.trim());
    expect(order).toEqual(['Home', 'Letters', 'Partners', 'Groups', 'My Profile', 'avatar']);
    // Slots are not clickable links (a click there must not navigate anywhere).
    expect(screen.queryByRole('link', { name: /partners/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my profile/i })).not.toBeInTheDocument();
  });

  it('a Partners slot carries the real tab markup, so its box equals the link box', () => {
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    const slot = container.querySelector('[data-nav-slot-placeholder="Partners"]') as HTMLElement;
    for (const cls of ['px-4', 'py-2', 'min-w-[80px]', 'flex-col']) expect(slot.className).toContain(cls);
  });

  it('loaded: slots are replaced by real links', () => {
    mockUseAuth.mockReturnValue(loaded);
    const { container } = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    expect(slotLabels(container)).toEqual([]);
    expect(screen.getAllByRole('link', { name: /partners/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /my profile/i }).length).toBeGreaterThan(0);
  });

  it('signed out: no signed-in slots (no regression)', () => {
    mockUseAuth.mockReturnValue(signedOut);
    const { container } = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    expect(slotLabels(container)).toEqual([]);
    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
  });
});

describe('P1421: bottom nav appears as soon as the session is known', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setNavVerifiedHint('u1', true); // this device last saw u1 resolve verified
  });

  it('loading: renders all five tabs, profile-dependent ones as inert slots', () => {
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(<MemoryRouter initialEntries={['/feed']}><BottomNav /></MemoryRouter>);
    const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    expect(nav).not.toBeNull();
    const tabs = Array.from(nav.querySelectorAll('a, [data-nav-slot-placeholder]'));
    expect(tabs.map((t) => t.querySelector('span.text-xs')?.textContent)).toEqual([
      'Home', 'Letters', 'Partners', 'Groups', 'My Profile',
    ]);
    expect(slotLabels(nav)).toEqual(['Partners', 'My Profile']);
  });

  it('signed out: no bottom nav', () => {
    mockUseAuth.mockReturnValue(signedOut);
    const { container } = render(<MemoryRouter><BottomNav /></MemoryRouter>);
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
  });

  it('session check still in flight: no bottom nav', () => {
    mockUseAuth.mockReturnValue({ ...loading, sessionChecked: false });
    const { container } = render(<MemoryRouter><BottomNav /></MemoryRouter>);
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
  });
});

describe('P1421 review: early chrome needs evidence the user is verified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('no hint (first sign-in on this device): pre-P1421 loading behaviour, no bottom nav', () => {
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(
      <MemoryRouter><SimpleNavigation /><BottomNav /></MemoryRouter>,
    );
    expect(slotLabels(container)).toEqual([]);
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
    expect(screen.getAllByRole('link', { name: /letters/i }).length).toBeGreaterThan(0);
  });

  it('pending → resolves UNVERIFIED: hint is cleared, layout is logged-out', () => {
    setNavVerifiedHint('u1', true);
    mockUseAuth.mockReturnValue(loading);
    const view = render(<MemoryRouter><SimpleNavigation /><BottomNav /></MemoryRouter>);
    expect(slotLabels(view.container).length).toBeGreaterThan(0);
    mockUseAuth.mockReturnValue({ ...loaded, user: { ...loaded.user, isVerified: false } });
    view.rerender(<MemoryRouter><SimpleNavigation /><BottomNav /></MemoryRouter>);
    expect(hasNavVerifiedHint('u1')).toBe(false);
    expect(view.container.querySelector('[data-nav="bottom"]')).toBeNull();
    expect(slotLabels(view.container)).toEqual([]);
  });

  it('pending → profile fetch FAILED (no cached user): hint is cleared', () => {
    setNavVerifiedHint('u1', true);
    mockUseAuth.mockReturnValue(loading);
    const view = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    mockUseAuth.mockReturnValue({ ...loading, isLoading: false, user: null });
    view.rerender(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    expect(hasNavVerifiedHint('u1')).toBe(false);
  });

  it('resolves verified: hint is written for the next load', () => {
    mockUseAuth.mockReturnValue(loaded);
    render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    expect(hasNavVerifiedHint('u1')).toBe(true);
  });

  it('mobile avatar slot is disabled while pending — no signed-out menu flashes on tap', () => {
    setNavVerifiedHint('u1', true);
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(<MemoryRouter><SimpleNavigation /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /open menu/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(container.querySelector('#' + btn.getAttribute('aria-controls'))).toBeNull();
  });

  it('layout keeps bottom padding while pending (bottom nav is on screen)', () => {
    setNavVerifiedHint('u1', true);
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(
      <MemoryRouter initialEntries={['/feed']}>
        <ClarityLandingLayout surface="product"><div>page</div></ClarityLandingLayout>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-nav="bottom"]')).not.toBeNull();
    expect(container.querySelector('main')?.className).toContain('pb-20');
  });
});

describe('P1421 review round 2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setNavVerifiedHint('u1', true);
  });

  const tree = (compact: boolean) => (
    <MemoryRouter initialEntries={['/feed']}>
      <EventLinksMenu enabled><SimpleNavigation compact={compact} /></EventLinksMenu>
    </MemoryRouter>
  );

  it.each([false, true])('A: Tools trigger is the SAME DOM node across pending → loaded (compact=%s)', (compact) => {
    mockUseAuth.mockReturnValue(loading);
    const view = render(tree(compact));
    const desktopTools = () =>
      view.container.querySelector('.hidden.lg\\:flex [data-testid="event-links-button"]');
    const before = desktopTools();
    expect(before).not.toBeNull();
    mockUseAuth.mockReturnValue(loaded);
    view.rerender(tree(compact));
    expect(desktopTools()).toBe(before); // not unmounted → an open menu stays open
  });

  it('B: compact + pending shows the avatar-sized placeholder in the mobile group', () => {
    mockUseAuth.mockReturnValue(loading);
    render(tree(true));
    const btn = screen.getByRole('button', { name: /open menu/i });
    expect(btn.querySelector('.w-10.h-10')).not.toBeNull();
    expect(btn).toBeDisabled();
  });

  it('E: placeholders sit inside the fixed nav, which paints a background (catches clicks)', () => {
    mockUseAuth.mockReturnValue(loading);
    const { container } = render(tree(false));
    const nav = container.querySelector('[data-nav="main"]') as HTMLElement;
    expect(nav.className).toMatch(/\bfixed\b/);
    expect(nav.className).toMatch(/\bbg-background/);
    for (const el of container.querySelectorAll('[data-nav-slot-placeholder]')) {
      expect(nav.contains(el)).toBe(true);
    }
  });
});
