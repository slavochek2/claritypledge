/**
 * @file p1515-link-token-session-end.test.tsx
 * @description P1515: a canvas link token held in the tab must not outlive the person, wherever the session ends and
 * whatever page the person is on. AuthProvider (mounted app-wide) clears it on every session-ending auth event: a
 * sign-out (nav menu, account erasure), expiry or revocation surfacing as a null session, and a sign-out in another
 * tab. An anonymous boot (INITIAL_SESSION with no session) is not a session ending and leaves it alone. Harness mirrors
 * p1421-nav-hint-cleared-on-sign-out.
 */
import { act, render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), reset: vi.fn(), identify: vi.fn() },
  isInternalAccount: vi.fn().mockResolvedValue(false),
}));

let authCallback: ((event: string, session: unknown) => void) | null = null;
const getSession = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: vi.fn(),
  },
}));
vi.mock('@/app/data/api', () => ({
  getProfileResult: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1', name: 'T', isVerified: true } }),
  signOut: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));
vi.mock('@/app/contexts/live-session-context', () => ({ clearActiveSessionFromStorage: vi.fn() }));

import { AuthProvider, INITIAL_SESSION_FALLBACK_MS } from '@/auth/AuthContext';
import { clearLinkTokens, readLinkToken, storeLinkToken } from '@/lib/canvas-link-token';

const FAKE_SESSION = { user: { id: 'u1', email: 'u@example.com' }, expires_at: 1 } as unknown;

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  localStorage.clear();
  sessionStorage.clear();
  clearLinkTokens();
  getSession.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
});

describe('P1515: the stored canvas link token goes when the session ends (the canvas page is NOT mounted here)', () => {
  it.each([
    ['SIGNED_OUT', 'sign-out from the nav menu, account erasure, or a sign-out in another tab'],
    ['TOKEN_REFRESHED', 'session expiry or revocation surfacing as a null session'],
  ])('%s with no session clears it (%s)', async (event) => {
    storeLinkToken('ana', 'sales', 'tok');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', FAKE_SESSION);
    expect(readLinkToken('ana', 'sales')).toBe('tok'); // CONTROL: a session starting does not clear it

    authCallback!(event, null);

    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });

  it('an anonymous boot is not a session ending: a visitor\'s token survives INITIAL_SESSION with no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    storeLinkToken('ana', 'sales', 'tok');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', null);
    expect(readLinkToken('ana', 'sales')).toBe('tok');
  });
});

/** auth-js's real order for an expired, unrefreshable stored session (GoTrueClient: _initialize -> _recoverAndRefresh ->
 * _removeSession -> SIGNED_OUT to the subscribers registered by then; initializePromise resolves; THEN each subscriber gets
 * INITIAL_SESSION, and getSession() also resolves after initializePromise). getSession can therefore resolve BEFORE the
 * subscriber hears SIGNED_OUT or INITIAL_SESSION: these tests resolve it first. */
async function getSessionSettled() {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  return async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
}

describe('P1515: a boot with an expired, unrefreshable session must not wipe the token the head script just stored', () => {
  it('real order (subscribe, getSession resolves, SIGNED_OUT, INITIAL_SESSION null): the token is kept through the boot SIGNED_OUT', async () => {
    const settle = await getSessionSettled();
    storeLinkToken('ana', 'sales', 'tok');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await settle(); // getSession has resolved and its finally has run
    authCallback!('SIGNED_OUT', null); // auth-js drops the dead session at boot
    expect(readLinkToken('ana', 'sales')).toBe('tok');
    authCallback!('SIGNED_OUT', null); // and may say it again, still before INITIAL_SESSION
    expect(readLinkToken('ana', 'sales')).toBe('tok');
    authCallback!('INITIAL_SESSION', null);
    expect(readLinkToken('ana', 'sales')).toBe('tok'); // an anonymous boot is not a session ending
  });

  it('CONTROL: a SIGNED_OUT AFTER INITIAL_SESSION(null) clears it', async () => {
    const settle = await getSessionSettled();
    storeLinkToken('ana', 'sales', 'tok');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await settle();
    authCallback!('INITIAL_SESSION', null);
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });

  it('CONTROL: a session this tab really held, then signed out, clears it', async () => {
    storeLinkToken('ana', 'sales', 'tok');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', FAKE_SESSION);
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
  });

  it('fallback: if INITIAL_SESSION never arrives, getSession settling plus the grace period ends the boot window', async () => {
    // Capture the fallback timer instead of faking the clock: the harness's own waits need real timers.
    const real = globalThis.setTimeout;
    let fire: (() => void) | undefined;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === INITIAL_SESSION_FALLBACK_MS) { fire = fn; return 0 as unknown as ReturnType<typeof setTimeout>; }
      return real(fn, ms, ...rest);
    }) as typeof setTimeout);
    try {
      const settle = await getSessionSettled();
      storeLinkToken('ana', 'sales', 'tok');
      render(<AuthProvider><div /></AuthProvider>);
      await waitFor(() => expect(authCallback).not.toBeNull());
      await settle();
      expect(fire, 'getSession settling armed the fallback').toBeDefined();
      authCallback!('SIGNED_OUT', null); // inside the grace period: still boot recovery
      expect(readLinkToken('ana', 'sales')).toBe('tok');
      act(() => { fire!(); }); // the grace period ends with no INITIAL_SESSION
      authCallback!('SIGNED_OUT', null); // after it: a real sign-out
      expect(readLinkToken('ana', 'sales')).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('P1515: a boot-time SIGNED_OUT keeps ONLY the token that arrived in this load; tokens left by earlier loads of the tab go', () => {
  /** What a previous load left behind: in storage only (a new load starts with no in-memory copy and no load keys). */
  const leaveFromEarlierLoad = (handle: string, name: string, token: string) => sessionStorage.setItem(`canvas-link:${handle}/${name}`, token);

  it('an older token plus this load\'s token, then SIGNED_OUT at boot: only this load\'s survives', async () => {
    const settle = await getSessionSettled();
    leaveFromEarlierLoad('bob', 'plan', 'older-persons-token');
    storeLinkToken('ana', 'sales', 'this-loads-token'); // what the head script (or an in-app arrival) records
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await settle();
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBe('this-loads-token');
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
    expect(sessionStorage.getItem('canvas-link:bob/plan')).toBeNull();
  });

  it('CONTROL: no older token, so this load\'s survives', async () => {
    const settle = await getSessionSettled();
    storeLinkToken('ana', 'sales', 'this-loads-token');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await settle();
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBe('this-loads-token');
  });

  it('CONTROL: a session this tab really held, then SIGNED_OUT: both the older and this load\'s tokens go', async () => {
    leaveFromEarlierLoad('bob', 'plan', 'older-persons-token');
    storeLinkToken('ana', 'sales', 'this-loads-token');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', FAKE_SESSION);
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
  });

  it('the older token is not inherited by the next person: after the boot SIGNED_OUT a new sign-in finds none of it', async () => {
    const settle = await getSessionSettled();
    leaveFromEarlierLoad('bob', 'plan', 'older-persons-token');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await settle();
    authCallback!('SIGNED_OUT', null);
    authCallback!('SIGNED_IN', FAKE_SESSION); // the next person signs in on this tab
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
  });
});

describe('P1515: after auth initialization, ANY session loss clears every link token, this load\'s included', () => {
  /** Auth has settled with no session: getSession resolved null and the first INITIAL_SESSION was anonymous. */
  async function anonymousTabAfterInit() {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    storeLinkToken('ana', 'sales', 'this-loads-token');
    sessionStorage.setItem('canvas-link:bob/plan', 'older-persons-token');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    authCallback!('INITIAL_SESSION', null); // auth-js has finished its initial recovery: the boot window is over
  }

  it('a sign-out before any live session was observed, but after initialization, clears this load\'s token and the older one', async () => {
    await anonymousTabAfterInit();
    authCallback!('SIGNED_OUT', null);
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
    expect(sessionStorage.getItem('canvas-link:ana/sales')).toBeNull();
  });

  it('a cross-tab SIGNED_OUT arriving at an anonymous tab (a visitor who followed a link) clears everything', async () => {
    await anonymousTabAfterInit();
    expect(readLinkToken('ana', 'sales')).toBe('this-loads-token'); // the anonymous boot cleared nothing
    expect(readLinkToken('ana', 'sales')).toBe('this-loads-token');
    authCallback!('SIGNED_OUT', null); // the person signs out in another tab on this device
    expect(readLinkToken('ana', 'sales')).toBeUndefined();
    expect(readLinkToken('bob', 'plan')).toBeUndefined();
  });

  it('CONTROL: the same anonymous tab, with no session-ending event, keeps both', async () => {
    await anonymousTabAfterInit();
    expect(readLinkToken('ana', 'sales')).toBe('this-loads-token');
    expect(readLinkToken('bob', 'plan')).toBe('older-persons-token');
  });
});
