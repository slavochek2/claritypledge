/**
 * @file p1593-install-placement.test.tsx
 * @description P1593: visibility rules for the avatar-menu item ("Add to home screen") and the
 * return-visit nudge in the mobile bottom bar. The real provider runs; only the platform
 * (user agent, standalone, beforeinstallprompt, localStorage) and the today's-event hook are staged.
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTodays = vi.fn();
vi.mock('@/app/components/layout/app-shell/shell-nav', async () => ({
  ...(await vi.importActual<object>('@/app/components/layout/app-shell/shell-nav')),
  useShellTodaysEvent: () => mockTodays(),
}));
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({ showUserMenu: true, slug: 'test-user' }),
}));
vi.mock('@/app/contexts/live-session-context', () => ({ useLiveSession: () => ({ isLive: false }) }));
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => ({ count: 0 }) }));
vi.mock('@/app/hooks/useUnreadSharedCount', () => ({ useUnreadSharedCount: () => ({ count: 0 }) }));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null }) }));
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => ({ count: 0 }),
}));
const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { BottomNav } from '@/app/components/layout/bottom-nav';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { PwaInstallProvider, recordActivity } from '@/hooks/use-pwa-install';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS) Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120';
const DAY = 24 * 60 * 60 * 1000;

function stage({ ua, standalone = false }: { ua: string; standalone?: boolean }) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: standalone && q.includes('standalone'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function nativePrompt() {
  const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: 'dismissed' });
  act(() => { window.dispatchEvent(e); });
  return e;
}

/** Two visits on this device: the earlier one was a day ago. */
function seedReturnVisit() {
  localStorage.setItem('pwa_visit_count', '1');
  localStorage.setItem('pwa_last_activity_at', String(Date.now() - DAY));
}

function renderBar() {
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <PwaInstallProvider>
        <BottomNav />
      </PwaInstallProvider>
    </MemoryRouter>,
  );
}

const nudge = () => screen.queryByTestId('install-nudge');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockTodays.mockReturnValue(null);
});
afterEach(() => localStorage.clear());

describe('P1593 return-visit nudge', () => {
  it('first visit: no nudge', () => {
    stage({ ua: ANDROID });
    renderBar();
    nativePrompt();
    expect(nudge()).toBeNull();
  });

  it('2nd visit, Android with a captured prompt: shows, and tapping prompts natively', async () => {
    stage({ ua: ANDROID });
    seedReturnVisit();
    renderBar();
    expect(nudge()).toBeNull(); // nothing can act yet
    const e = nativePrompt();
    expect(nudge()).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /add clarity pledge to your home screen/i })); });
    expect(e.prompt).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('pwa_install_prompted', { source: 'return_nudge' });
  });

  it('2nd visit, iPhone: shows without a prompt, and tapping opens the iOS drawer', () => {
    stage({ ua: IPHONE });
    seedReturnVisit();
    renderBar();
    expect(nudge()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add clarity pledge to your home screen/i }));
    expect(screen.getByText(/Add ClarityPledge to your Home Screen/)).toBeInTheDocument();
  });

  it('installed (standalone): no nudge', () => {
    stage({ ua: IPHONE, standalone: true });
    seedReturnVisit();
    renderBar();
    expect(nudge()).toBeNull();
  });

  it('desktop browser that cannot prompt: no nudge', () => {
    stage({ ua: DESKTOP });
    seedReturnVisit();
    renderBar();
    expect(nudge()).toBeNull();
  });

  it('desktop Chrome with a captured prompt on a return visit: no nudge (mobile only)', () => {
    stage({ ua: DESKTOP });
    seedReturnVisit();
    renderBar();
    nativePrompt();
    expect(nudge()).toBeNull();
  });

  it("today's event wins: the strip shows and the nudge does not", () => {
    stage({ ua: IPHONE });
    seedReturnVisit();
    mockTodays.mockReturnValue({ href: '/events/x', event: { title: 'Tonight', registered: false } });
    renderBar();
    expect(screen.getByTestId('tonights-event-cta')).toBeInTheDocument();
    expect(nudge()).toBeNull();
  });

  it('dismissed: closing hides it, and it stays hidden after a reload', () => {
    stage({ ua: IPHONE });
    seedReturnVisit();
    const first = renderBar();
    const close = screen.getByRole('button', { name: 'Dismiss' });
    expect(close.className).toContain('w-10');
    fireEvent.click(close);
    expect(nudge()).toBeNull();
    expect(track).toHaveBeenCalledWith('pwa_install_dismissed', { source: 'return_nudge' });
    first.unmount();
    renderBar();
    expect(nudge()).toBeNull();
  });

  it('the two controls are siblings, not nested buttons', () => {
    stage({ ua: IPHONE });
    seedReturnVisit();
    renderBar();
    expect(nudge()!.querySelectorAll('button button')).toHaveLength(0);
    expect(nudge()!.querySelectorAll(':scope > button')).toHaveLength(2);
  });
});

describe('P1593 visit counting', () => {
  it('reloads inside a visit do not add a visit; a 30+ minute gap does', () => {
    const t0 = 1_000_000_000_000;
    expect(recordActivity(t0)).toBe(1);
    expect(recordActivity(t0 + 60_000)).toBe(1);
    expect(recordActivity(t0 + 29 * 60_000)).toBe(1);
    expect(recordActivity(t0 + 29 * 60_000 + 31 * 60_000)).toBe(2);
  });
});

describe('P1593 visit counting across tab switches', () => {
  const setVisibility = (state: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  };
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('a 35-minute first visit then a tab switch is still visit 1', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    stage({ ua: IPHONE });
    renderBar();
    vi.setSystemTime(new Date('2026-01-01T10:35:00Z'));
    setVisibility('hidden');
    vi.setSystemTime(new Date('2026-01-01T10:35:05Z'));
    setVisibility('visible');
    expect(localStorage.getItem('pwa_visit_count')).toBe('1');
    expect(nudge()).toBeNull();
  });

  it('hidden at t0, back 31 minutes later: visit 2, nudge shows', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    stage({ ua: IPHONE });
    renderBar();
    setVisibility('hidden');
    vi.setSystemTime(new Date('2026-01-01T10:31:00Z'));
    setVisibility('visible');
    expect(localStorage.getItem('pwa_visit_count')).toBe('2');
    expect(nudge()).toBeInTheDocument();
  });
});

describe('P1593 avatar menu item', () => {
  const renderMenu = () =>
    render(
      <MemoryRouter>
        <PwaInstallProvider>
          <NavigationMenuItems variant="mobile" onSignOut={vi.fn()} />
        </PwaInstallProvider>
      </MemoryRouter>,
    );
  const item = () => screen.queryByRole('button', { name: 'Add to home screen' });

  it('iPhone: shown, opens the drawer', () => {
    stage({ ua: IPHONE });
    renderMenu();
    fireEvent.click(item()!);
    expect(screen.getByText(/Add ClarityPledge to your Home Screen/)).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('pwa_install_prompted', { source: 'avatar_menu' });
  });

  it('Android: hidden until the prompt is captured, then fires it', async () => {
    stage({ ua: ANDROID });
    renderMenu();
    expect(item()).toBeNull();
    const e = nativePrompt();
    await act(async () => { fireEvent.click(item()!); });
    expect(e.prompt).toHaveBeenCalled();
  });

  it('desktop without a prompt: absent; desktop Chrome with one: present', () => {
    stage({ ua: DESKTOP });
    renderMenu();
    expect(item()).toBeNull();
    nativePrompt();
    expect(item()).toBeInTheDocument();
  });

  it('installed: absent', () => {
    stage({ ua: IPHONE, standalone: true });
    renderMenu();
    expect(item()).toBeNull();
  });

  it('shown on a first visit and when the nudge was dismissed (not gated by either)', () => {
    stage({ ua: IPHONE });
    localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    renderMenu();
    expect(item()).toBeInTheDocument();
  });
});
