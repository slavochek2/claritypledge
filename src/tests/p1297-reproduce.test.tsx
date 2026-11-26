/**
 * @file p1297-reproduce.test.tsx
 * @description P1297 canary: AuthProvider must not report "signed out" while it holds a stored
 * session it has neither accepted nor seen rejected.
 *
 * Every auth gate in the app redirects on `sessionChecked && !isLoading && !user`. So that
 * state means "nobody is signed in", and the provider may only reach it when that is true.
 * Two cold-load paths reach it while a usable session sits in storage:
 *
 *  A. The session is restored, but the profile request fails (3 attempts, 1 s apart). The
 *     provider settles user=null, isLoading=false and never retries — reproduced live against
 *     TEST in e2e/p1297-reproduce.spec.ts.
 *  B. The stored access token is near expiry and its refresh fails on the network. auth-js
 *     keeps the stored session (retryable error) but getSession() returns
 *     { session: null, error: AuthRetryableFetchError } and INITIAL_SESSION fires with null.
 *     The provider takes that as a sign-out.
 *
 * The control (no stored session at all) must settle as signed out — before and after the fix.
 */
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { authStorageKey } from '@/auth/stored-session';

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), reset: vi.fn(), identify: vi.fn() },
  isInternalAccount: vi.fn().mockResolvedValue(false),
}));

let authCallback: ((event: string, session: unknown) => void) | null = null;
const getSession = vi.fn();
const refreshSession = vi.fn();
const authSignOut = vi.fn();
const getUser = vi.fn();
const captureMessage = vi.fn();

vi.mock('@sentry/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/react')>()),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      refreshSession: (...a: unknown[]) => refreshSession(...a),
      signOut: (...a: unknown[]) => authSignOut(...a),
      getUser: (...a: unknown[]) => getUser(...a),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: vi.fn(),
  },
}));

const getProfileResult = vi.fn();
vi.mock('@/app/data/api', () => ({
  getProfileResult: (...a: unknown[]) => getProfileResult(...a),
  signOut: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));
vi.mock('@/app/contexts/live-session-context', () => ({
  clearActiveSessionFromStorage: vi.fn(),
}));

// Setup (P1297 review): the profile function gives the owner their own email, so a real self read
// carries one; a read made with the anon key does not (see the anon-read case below).
const PROFILE = { id: 'u1', name: 'Signed In', email: 'u@example.com' };
const nowSec = () => Math.floor(Date.now() / 1000);
const SESSION = () => ({
  access_token: 'a', refresh_token: 'r', expires_at: nowSec() + 2700,
  user: { id: 'u1', email: 'u@example.com' },
});
// Setup (P1297 fix): the provider now checks the exact key this client stores its session
// under (stored-session.ts authStorageKey), not any '*-auth-token' key — seed that one.
const STORAGE_KEY = authStorageKey() ?? 'sb-proj-auth-token';

type Snap = { user: unknown; isLoading: boolean; sessionChecked: boolean };
type Ctx = Snap & { signOut: () => Promise<void>; refreshProfile: () => Promise<void> };
let AuthProvider: React.ComponentType<{ children: React.ReactNode }>;
let useAuth: () => Ctx;
/** The provider's signOut, as the last render saw it. */
let ctxSignOut: () => Promise<void> = async () => {};
/** The provider's refreshProfile, as the last render saw it. */
let ctxRefresh: () => Promise<void> = async () => {};

beforeEach(async () => {
  vi.clearAllMocks();
  authCallback = null;
  localStorage.clear();
  sessionStorage.clear();
  const mod = await import('@/auth/AuthContext');
  AuthProvider = mod.AuthProvider;
  useAuth = mod.useAuth as unknown as () => Ctx;
});

/**
 * P1718: a request a test leaves unanswered is registered here and rejected after the test, so no
 * promise outlives it; the test then yields one macrotask for the rejection to settle.
 */
const unanswered: Array<(reason: unknown) => void> = [];
function pendingUntilTeardown<T>(): Promise<T> {
  return new Promise<T>((_resolve, reject) => { unanswered.push(reject); });
}

afterEach(async () => {
  vi.useRealTimers(); // first: the yield below needs a real timer
  unanswered.splice(0).forEach((reject) => reject(new Error('test ended')));
  await new Promise((r) => setTimeout(r, 0));
  setVisibility('visible');
});

/** jsdom reports a visible tab; tests that hide it override the two properties auth code reads. */
let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' });
function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Mounts the provider; records every state a gate could act on. */
function mount() {
  const states: Snap[] = [];
  let latest: Snap | null = null;
  const Probe = () => {
    const a = useAuth();
    latest = { user: a.user, isLoading: a.isLoading, sessionChecked: a.sessionChecked };
    ctxSignOut = a.signOut;
    ctxRefresh = a.refreshProfile;
    states.push(latest);
    return null;
  };
  render(<AuthProvider><Probe /></AuthProvider>);
  return {
    states,
    get: () => latest as Snap,
    /** The exact condition every auth gate redirects on. */
    redirected: () => states.some((s) => s.sessionChecked && !s.isLoading && !s.user),
  };
}

describe('P1297 — cold load with a usable stored session', () => {
  it('control: with no stored session the provider settles as signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const m = mount();
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(m.get().user).toBeNull();
  });

  it('control: a healthy restore never passes through the redirect state', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    expect(m.redirected()).toBe(false);
  });

  it('A: profile request fails for a while, then recovers — the user is never reported signed out', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    let calls = 0;
    // Fails for the first 5 calls (longer than the current 3-attempt budget), then succeeds.
    getProfileResult.mockImplementation(async () => {
      calls += 1;
      return calls <= 5
        ? { success: false, error: 'server_error', message: 'Failed to fetch' }
        : { success: true, data: PROFILE };
    });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });

    await waitFor(() => expect(m.get().user).toEqual(PROFILE), { timeout: 20_000 });
    expect(m.redirected()).toBe(false);
  }, 30_000);

  it('B: refresh of a near-expiry stored session fails on the network — not reported signed out', async () => {
    const s = { ...SESSION(), expires_at: nowSec() + 30 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    const retryable = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
    // auth-js keeps the stored session on a retryable failure and reports "cannot tell".
    getSession.mockResolvedValueOnce({ data: { session: null }, error: retryable });
    // Once the network is back, the session is restored.
    getSession.mockResolvedValue({ data: { session: { ...s, expires_at: nowSec() + 3600 } }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { ...s, expires_at: nowSec() + 3600 } }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });

    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', null); });
    // Give the provider time to settle the way it does today.
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

    expect(m.redirected()).toBe(false);

    // auth-js's own retry (its 30 s ticker, or the tab becoming visible) succeeds and reports it.
    const fresh = { ...s, expires_at: nowSec() + 3600 };
    await act(async () => { authCallback?.('TOKEN_REFRESHED', fresh); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    expect(m.redirected()).toBe(false);
    // The provider never polled getSession() while it waited (each call would hold the auth lock).
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('B, refused: the refresh is later refused by the server — settles signed out, says the session expired', async () => {
    const s = { ...SESSION(), expires_at: nowSec() + 30 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', null); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.redirected()).toBe(false);

    // auth-js removes a session whose refresh the server refuses, then emits SIGNED_OUT.
    localStorage.removeItem(STORAGE_KEY);
    await act(async () => { authCallback?.('SIGNED_OUT', null); });
    await waitFor(() => expect(m.redirected()).toBe(true));
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
  });
});

describe('P1297 — the retry loop', () => {
  const rejected = { success: false, error: 'server_error', message: 'JWT', status: 401, code: 'PGRST301' };

  it('a refused token is refreshed once; the profile then loads', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValueOnce(rejected).mockResolvedValue({ success: true, data: PROFILE });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith(); // no argument: auth-js reads the CURRENT stored token
    expect(m.redirected()).toBe(false);
  });

  it('a refresh the server refuses: auth-js signs out, the provider says the session expired', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    // As auth-js does: a refused refresh removes the stored session and emits SIGNED_OUT before
    // refreshSession() returns (GoTrueClient _callRefreshToken -> _removeSession).
    refreshSession.mockImplementation(async () => {
      localStorage.removeItem(STORAGE_KEY);
      authCallback?.('SIGNED_OUT', null);
      return { data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } };
    });
    getProfileResult.mockResolvedValue(rejected);
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.redirected()).toBe(true));
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
    expect(authSignOut).not.toHaveBeenCalled(); // auth-js already cleared it
  });

  it('a refresh refused with no SIGNED_OUT after it: the provider clears the session itself', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } });
    authSignOut.mockResolvedValue({ error: null });
    getProfileResult.mockResolvedValue(rejected);
    mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
    expect(getProfileResult).toHaveBeenCalledTimes(1); // no retry loop against a refused token
  });

  it('refused again after a successful refresh: the stored session is cleared locally', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: s }, error: null });
    // The auth server refuses it too: the session really is unusable.
    getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', status: 403, message: 'session not found' } });
    authSignOut.mockResolvedValue({ error: null });
    getProfileResult.mockResolvedValue(rejected);
    mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
    // auth-js then emits SIGNED_OUT: an explained loss, kept out of the P1240 measurement.
    localStorage.removeItem(STORAGE_KEY);
    await act(async () => { authCallback?.('SIGNED_OUT', null); });
    const { analytics } = await import('@/lib/mixpanel');
    expect(vi.mocked(analytics.track).mock.calls.some(([e]) => e === 'session_lost_unexplained')).toBe(false);
  });

  it('a sign-out the person chose leaves no "session expired" notice, here or in another tab', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    await act(async () => { await ctxSignOut(); });
    localStorage.removeItem(STORAGE_KEY);
    await act(async () => { authCallback?.('SIGNED_OUT', null); });
    expect(sessionStorage.getItem('p1297-session-expired')).toBeNull();
    // Another tab hears the same sign-out as a plain SIGNED_OUT; the shared marker covers it.
    expect(localStorage.getItem('p1297-deliberate-sign-out-at')).not.toBeNull();
  });

  it('a profile that genuinely does not exist still settles with no user (unchanged)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'not_found' });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(m.get().user).toBeNull();
    expect(getProfileResult).toHaveBeenCalledTimes(1);
  });

  it("an account switch never shows the previous account's profile (P1560)", async () => {
    const a = SESSION();
    const b = { ...SESSION(), user: { id: 'u2', email: 'u2@example.com' } };
    const PROFILE_B = { id: 'u2', name: 'Other', email: 'u2@example.com' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    getSession.mockResolvedValue({ data: { session: a }, error: null });
    getProfileResult.mockImplementation(async (id: string) =>
      id === 'u1' ? { success: true, data: PROFILE } : { success: false, error: 'server_error', message: 'Failed to fetch' });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', a); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));

    const before = m.states.length;
    await act(async () => { authCallback?.('SIGNED_IN', b); });
    await act(async () => { await new Promise((r) => setTimeout(r, 2500)); });
    // B's profile has not loaded yet: nothing — certainly not A — is shown as the signed-in user.
    expect(m.states.slice(before).some((st) => (st.user as { id?: string } | null)?.id === 'u1')).toBe(false);

    getProfileResult.mockImplementation(async () => ({ success: true, data: PROFILE_B }));
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE_B), { timeout: 5000 });
  });

  it('unmounting stops the retries', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', message: 'Failed to fetch' });
    mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(getProfileResult).toHaveBeenCalledTimes(3), { timeout: 5000 });
    cleanup();
    const n = getProfileResult.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('online')); await new Promise((r) => setTimeout(r, 1500)); });
    expect(getProfileResult.mock.calls.length).toBe(n);
  });

  it("a profile response for the previous account that lands after the switch is dropped (P1560)", async () => {
    const a = SESSION();
    const b = { ...SESSION(), user: { id: 'u2', email: 'u2@example.com' } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    getSession.mockResolvedValue({ data: { session: a }, error: null });
    let resolveA: (v: unknown) => void = () => {};
    getProfileResult.mockImplementation((id: string) =>
      id === 'u1' ? new Promise((r) => { resolveA = r; }) : pendingUntilTeardown());
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', a); });
    await waitFor(() => expect(getProfileResult).toHaveBeenCalledWith('u1'));
    // The switch and A's answer arrive in the same tick: A's continuation runs before React
    // re-renders and re-runs the profile effect for B.
    await act(async () => {
      authCallback?.('SIGNED_IN', b);
      resolveA({ success: true, data: PROFILE });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(m.states.some((st) => (st.user as { id?: string } | null)?.id === 'u1')).toBe(false);
  });

  it('a hidden tab makes no requests; showing it retries at once (metered-services rule 3)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', message: 'Failed to fetch' });
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(getProfileResult).toHaveBeenCalledTimes(3); // the first round

    act(() => setVisibility('hidden'));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(30 * 60_000);
    });
    expect(getProfileResult).toHaveBeenCalledTimes(3);

    await act(async () => { setVisibility('visible'); await vi.advanceTimersByTimeAsync(0); });
    expect(getProfileResult).toHaveBeenCalledTimes(4);
    expect(m.redirected()).toBe(false);
  });

  it('a wait that starts in a hidden tab (request in flight when hidden) arms no timer (rule 3)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    const failed = { success: false, error: 'server_error', message: 'Failed to fetch' };
    let answerInFlight: (r: unknown) => void = () => {};
    getProfileResult
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(failed)
      .mockImplementationOnce(() => new Promise((r) => { answerInFlight = r; })) // the third, in flight
      .mockResolvedValue(failed);
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(getProfileResult).toHaveBeenCalledTimes(3);

    act(() => setVisibility('hidden'));
    await act(async () => { answerInFlight(failed); }); // fails while hidden: the next wait starts hidden
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
    expect(getProfileResult).toHaveBeenCalledTimes(3);

    await act(async () => { setVisibility('visible'); await vi.advanceTimersByTimeAsync(0); });
    expect(getProfileResult).toHaveBeenCalledTimes(4);
    expect(m.redirected()).toBe(false);
  });

  it('retries are bounded: at most 28 requests in an hour-long outage, then 15 an hour (rule 4)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', message: 'Failed to fetch' });
    // The shortest jitter (factor 0.8) is the most requests the schedule can make: the budget's case.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    // 3 in the first round (by 2 s); 12 fast retries over 0.8 x 423 s = 338.4 s, the last at about
    // 340 s; then one per 0.8 x 300 = 240 s: floor(3259.6 / 240) = 13.
    expect(getProfileResult).toHaveBeenCalledTimes(28);
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    expect(getProfileResult).toHaveBeenCalledTimes(43); // 15 an hour from then on
    expect(m.redirected()).toBe(false);
    vi.mocked(Math.random).mockRestore();
  });

  it('an answer that will repeat (403, function not granted) settles as before and is reported once', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', message: 'permission denied', status: 403, code: '42501' });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(getProfileResult).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a bare 401 with no PostgREST code is not a refused token: no refresh, no sign-out', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', message: 'Invalid API key', status: 401 });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(refreshSession).not.toHaveBeenCalled();
    expect(authSignOut).not.toHaveBeenCalled();
  });

  it('refused again but the auth server accepts the token: the session is kept (data-server fault)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: s }, error: null });
    getUser.mockResolvedValue({ data: { user: s.user }, error: null });
    getProfileResult.mockResolvedValue(rejected);
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(authSignOut).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('p1297-session-expired')).toBeNull();
    expect(m.redirected()).toBe(false);
  });

  it('a refresh that fails on the network is not repeated every round (it holds the auth lock)', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    getProfileResult.mockResolvedValue(rejected);
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(getProfileResult.mock.calls.length).toBeGreaterThan(3);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(m.redirected()).toBe(false);
  });

  it('a read made with no usable token (anon key: no owner email) is not taken as the person', async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValueOnce({ data: { session: s }, error: null }); // initSession
    // The token then lapses and its refresh fails on the network: auth-js reports no session.
    getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    getProfileResult.mockResolvedValue({ success: true, data: { ...PROFILE, email: '' } });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(m.states.some((st) => st.user !== null)).toBe(false);
    expect(m.redirected()).toBe(false);
    // The network returns: the session is confirmed, and the next read is taken as it is.
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(m.get().user).toEqual({ ...PROFILE, email: '' }));
  });

  it("auth-js's SIGNED_IN replay on a shown tab does not clear another tab's sign-out marker", async () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    localStorage.setItem('p1297-deliberate-sign-out-at', String(Date.now())); // another tab signing out
    await act(async () => { authCallback?.('SIGNED_IN', s); }); // this tab, shown again
    expect(localStorage.getItem('p1297-deliberate-sign-out-at')).not.toBeNull();
  });

  it('a new sign-in clears the sign-out marker', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    localStorage.setItem('p1297-deliberate-sign-out-at', String(Date.now()));
    await act(async () => { authCallback?.('SIGNED_IN', SESSION()); });
    expect(localStorage.getItem('p1297-deliberate-sign-out-at')).toBeNull();
  });

  it('boot: a token stored at load and dropped by auth-js leaves the expired notice', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SESSION()));
    vi.resetModules(); // authTokenStoredAtBoot is read at module load
    const fresh = await import('@/auth/AuthContext');
    AuthProvider = fresh.AuthProvider;
    useAuth = fresh.useAuth as unknown as () => Ctx;
    // auth-js's boot recovery: the refresh is refused, the session removed, getSession() reports none.
    getSession.mockImplementation(async () => {
      localStorage.removeItem(STORAGE_KEY);
      return { data: { session: null }, error: null };
    });
    const m = mount();
    await waitFor(() => expect(m.redirected()).toBe(true));
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
  });

  it('boot control: no token at load, no notice', async () => {
    vi.resetModules();
    const fresh = await import('@/auth/AuthContext');
    AuthProvider = fresh.AuthProvider;
    useAuth = fresh.useAuth as unknown as () => Ctx;
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const m = mount();
    await waitFor(() => expect(m.redirected()).toBe(true));
    expect(sessionStorage.getItem('p1297-session-expired')).toBeNull();
  });
});

describe('P1297 — review round 2 guards', () => {
  const rejected = { success: false, error: 'server_error', message: 'JWT', status: 401, code: 'PGRST301' };
  const transient = { success: false, error: 'server_error', message: 'Failed to fetch' };
  const NO_EMAIL = { ...PROFILE, email: '' };
  const seed = () => {
    const s = SESSION();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return s;
  };
  const notice = () => sessionStorage.getItem('p1297-session-expired');

  it('a tab hidden at load makes no profile request until it is shown (rule 3)', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    setVisibility('hidden');
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(getProfileResult).not.toHaveBeenCalled();
    expect(m.redirected()).toBe(false);
    await act(async () => { setVisibility('visible'); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
  });

  it('a refusal that lands while the tab is hidden sends no refresh until it is shown (rule 3)', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: s }, error: null });
    let answer: (r: unknown) => void = () => {};
    getProfileResult
      .mockImplementationOnce(() => new Promise((r) => { answer = r; }))
      .mockResolvedValue({ success: true, data: PROFILE });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(getProfileResult).toHaveBeenCalledTimes(1));
    act(() => setVisibility('hidden'));
    await act(async () => { answer(rejected); await new Promise((r) => setTimeout(r, 50)); });
    expect(refreshSession).not.toHaveBeenCalled();
    await act(async () => { setVisibility('visible'); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('the auth server rate-limiting the check (429) is no verdict: the session is kept', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: s }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', status: 429, message: 'rate limited' } });
    getProfileResult.mockResolvedValue(rejected);
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(authSignOut).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
    expect(m.redirected()).toBe(false);
  });

  it('a local sign-out that fails is tried again on the next refusal; the notice waits for it', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token' } });
    authSignOut
      .mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } })
      .mockResolvedValue({ error: null });
    getProfileResult.mockResolvedValue(rejected);
    mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(authSignOut).toHaveBeenCalledTimes(1));
    expect(notice()).toBeNull(); // the session is still there: nothing has expired yet
    await waitFor(() => expect(authSignOut).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(authSignOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(refreshSession).toHaveBeenCalledTimes(1); // the pending sign-out, not a second refresh
    expect(notice()).toBe('1');
  });

  it('a read that threw in our own code repeats: it settles as before and is reported once', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: false, error: 'server_error', thrown: true });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(getProfileResult).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('a self-read confirmation covers one read: a later email-less read is confirmed again', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult
      .mockResolvedValueOnce({ success: true, data: NO_EMAIL }) // confirmed -> read again at once
      .mockResolvedValueOnce(transient) // that read fails: wait
      .mockResolvedValue({ success: true, data: NO_EMAIL });
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const asked = getSession.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(m.get().user).toEqual(NO_EMAIL);
    expect(getSession.mock.calls.length).toBe(asked + 1); // asked again before taking the later read
  });

  it('an auth call that throws inside a restore step is "cannot tell": the restore goes on', async () => {
    const s = seed();
    getSession
      .mockResolvedValueOnce({ data: { session: s }, error: null }) // boot
      .mockRejectedValueOnce(new Error('lock acquire timed out')) // the self-read confirmation throws
      .mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: NO_EMAIL });
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(m.get().user).toEqual(NO_EMAIL);
    expect(m.redirected()).toBe(false);
  });

  it('an email-less read with no stored session at all ends it and settles signed out', async () => {
    const s = seed();
    getSession.mockResolvedValueOnce({ data: { session: s }, error: null });
    getSession.mockResolvedValue({ data: { session: null }, error: null }); // storage cleared underneath
    authSignOut.mockResolvedValue({ error: null });
    getProfileResult.mockResolvedValue({ success: true, data: NO_EMAIL });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().sessionChecked && !m.get().isLoading).toBe(true));
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(m.states.some((st) => st.user !== null)).toBe(false);
  });

  it('boot: a failed getSession() leaves loading to the restore when an event delivered a session', async () => {
    const s = seed();
    let bootRead: (v: unknown) => void = () => {};
    getSession.mockImplementationOnce(() => new Promise((r) => { bootRead = r; }));
    let answer: (r: unknown) => void = () => {};
    getProfileResult.mockImplementation(() => new Promise((r) => { answer = r; }));
    const m = mount();
    await act(async () => { authCallback?.('SIGNED_IN', s); });
    await waitFor(() => expect(getProfileResult).toHaveBeenCalled());
    await act(async () => { bootRead({ data: { session: null }, error: { name: 'AuthApiError', status: 400, message: 'bad' } }); });
    expect(m.redirected()).toBe(false);
    await act(async () => { answer({ success: true, data: PROFILE }); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
  });

  it('refreshProfile in a hidden tab still ends (its waits are plain timers)', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValueOnce({ success: true, data: PROFILE }).mockResolvedValue(transient);
    vi.useFakeTimers();
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(m.get().user).toEqual(PROFILE);
    act(() => setVisibility('hidden'));
    let ended = false;
    await act(async () => { void ctxRefresh().then(() => { ended = true; }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(ended).toBe(true);
    expect(m.get().user).toEqual(PROFILE);
  });

  it('refreshProfile: an email-less read never replaces a profile with one, and needs a session otherwise', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: PROFILE });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().user).toEqual(PROFILE));
    getProfileResult.mockResolvedValue({ success: true, data: { ...NO_EMAIL, name: 'Read as nobody' } });
    await act(async () => { await ctxRefresh(); });
    expect(m.get().user).toEqual(PROFILE);
  });

  it('refreshProfile: with no email on screen, an email-less read is taken only while a session exists', async () => {
    const s = seed();
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    getProfileResult.mockResolvedValue({ success: true, data: NO_EMAIL });
    const m = mount();
    await act(async () => { authCallback?.('INITIAL_SESSION', s); });
    await waitFor(() => expect(m.get().user).toEqual(NO_EMAIL));
    const renamed = { ...NO_EMAIL, name: 'Renamed' };
    getProfileResult.mockResolvedValue({ success: true, data: renamed });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await act(async () => { await ctxRefresh(); });
    expect(m.get().user).toEqual(NO_EMAIL); // no session: not taken
    getSession.mockResolvedValue({ data: { session: s }, error: null });
    await act(async () => { await ctxRefresh(); });
    expect(m.get().user).toEqual(renamed);
  });
});

describe('P1297 — retry schedule helpers', () => {
  it('delays double from 1 s, cap at 60 s, then slow to 5 minutes', async () => {
    const { unconfirmedRetryDelayMs, FAST_RETRY_ROUNDS } = await import('@/auth/stored-session');
    expect([0, 1, 2, 5, 6, 11].map(unconfirmedRetryDelayMs)).toEqual([1000, 2000, 4000, 32000, 60000, 60000]);
    expect(unconfirmedRetryDelayMs(FAST_RETRY_ROUNDS)).toBe(300_000);
    expect(unconfirmedRetryDelayMs(100)).toBe(300_000);
  });

  it('token refusal is PostgREST JWT codes only; transient = no answer, 408, 429, 5xx', async () => {
    const { isTokenRejected, isTransientFailure } = await import('@/auth/stored-session');
    expect([{ status: 401, code: 'PGRST301' }, { status: 401, code: 'PGRST303' }].every(isTokenRejected)).toBe(true);
    expect([{ status: 401 }, { status: 401, code: '42501' }, null].some(isTokenRejected)).toBe(false);
    expect([{}, { status: 0 }, { status: 408 }, { status: 429 }, { status: 500 }, { status: 503 }].every(isTransientFailure)).toBe(true);
    expect([{ status: 400 }, { status: 401 }, { status: 403 }, { status: 404 }].some(isTransientFailure)).toBe(false);
  });

  it('jitter stays within +/-20 %', async () => {
    const { withJitter } = await import('@/auth/stored-session');
    expect(withJitter(10_000, () => 0)).toBe(8_000);
    expect(withJitter(10_000, () => 1)).toBe(12_000);
  });

  it("the restore checks this client's own storage key, never another backend's token", async () => {
    const { authStorageKey, hasStoredAuthToken } = await import('@/auth/stored-session');
    expect(authStorageKey()).not.toBeNull(); // otherwise this test proves nothing
    localStorage.setItem('sb-otherbackend-auth-token', '{"access_token":"other"}');
    expect(hasStoredAuthToken()).toBe(false);
    localStorage.setItem(STORAGE_KEY, '{"access_token":"mine"}');
    expect(hasStoredAuthToken()).toBe(true);
  });

  it('a definite auth refusal is 401/403/404 or no session; 429, 5xx and no answer are not', async () => {
    const { isDefiniteAuthRefusal } = await import('@/auth/stored-session');
    for (const status of [401, 403, 404]) expect(isDefiniteAuthRefusal({ status })).toBe(true);
    expect(isDefiniteAuthRefusal({ name: 'AuthSessionMissingError', status: 400 })).toBe(true);
    for (const status of [0, 400, 429, 500, 503]) expect(isDefiniteAuthRefusal({ status })).toBe(false);
    expect(isDefiniteAuthRefusal(null)).toBe(false);
  });
});
