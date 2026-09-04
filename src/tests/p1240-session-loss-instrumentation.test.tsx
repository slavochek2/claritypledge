/**
 * @file p1240-session-loss-instrumentation.test.tsx
 * @description P1240 canary: the session-loss recorder must fire on an UNEXPLAINED
 * loss and stay silent on a deliberate sign-out.
 *
 * Why this test exists: P1240 has no reproduction. Three candidate causes were
 * falsified (in-app WebView spawn, PKCE cross-browser, refresh-token reuse
 * revocation — the last by direct test against the test project, 2026-09-04), and
 * nothing in the product recorded the event, so there is no way to tell which
 * remaining cause is live or whether it happens at all. The recorder IS the
 * deliverable, which makes an unexercised recorder worthless: a silent one is
 * indistinguishable from "the bug never happens" — exactly the wrong conclusion.
 *
 * Both directions are asserted deliberately. A recorder that fires on everything
 * would also "pass" a fires-on-loss test alone, and would then report every normal
 * sign-out as a defect.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const track = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track, reset: vi.fn(), identify: vi.fn() },
  isInternalAccount: vi.fn().mockResolvedValue(false),
}));

let authCallback: ((event: string, session: unknown) => void) | null = null;
const getSession = vi.fn();
const signOutSpy = vi.fn().mockResolvedValue(undefined);

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
  getProfileResult: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1', name: 'T' } }),
  signOut: (...a: unknown[]) => signOutSpy(...a),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));
vi.mock('@/app/contexts/live-session-context', () => ({
  clearActiveSessionFromStorage: vi.fn(),
}));

const FAKE_SESSION = { user: { id: 'u1', email: 'u@example.com' }, expires_at: 1 } as unknown;

let AuthProvider: React.ComponentType<{ children: React.ReactNode }>;
let useAuth: () => { signOut: (o?: unknown) => Promise<void> };

beforeEach(async () => {
  vi.clearAllMocks();
  authCallback = null;
  localStorage.clear();
  getSession.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
  const mod = await import('@/auth/AuthContext');
  AuthProvider = mod.AuthProvider;
  const hook = await import('@/auth/useAuth');
  useAuth = hook.useAuth as typeof useAuth;
});

function mount() {
  let api: ReturnType<typeof useAuth> | null = null;
  const Probe = () => { api = useAuth(); return null; };
  render(<AuthProvider><Probe /></AuthProvider>);
  return () => api!;
}

describe('P1240 — session-loss recorder', () => {
  it('FIRES when a session disappears with no sign-out, and says whether the token survived', async () => {
    localStorage.setItem('sb-proj-auth-token', '{"access_token":"x"}');
    mount();
    await waitFor(() => expect(authCallback).not.toBeNull());

    authCallback!('TOKEN_REFRESHED', null);

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('session_lost_unexplained', expect.objectContaining({
        auth_event: 'TOKEN_REFRESHED',
        stored_token_present: true,   // token still on disk => the client dropped it
      }));
    });
  });

  it('reports stored_token_present:false when storage was cleared underneath us', async () => {
    mount();                          // no token seeded
    await waitFor(() => expect(authCallback).not.toBeNull());

    authCallback!('SIGNED_OUT', null);

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('session_lost_unexplained', expect.objectContaining({
        stored_token_present: false,  // the discriminator that separates the causes
      }));
    });
  });

  it('STAYS SILENT on a deliberate sign-out', async () => {
    const get = mount();
    await waitFor(() => expect(authCallback).not.toBeNull());

    await get().signOut();
    authCallback!('SIGNED_OUT', null);

    const calls = track.mock.calls.filter(c => c[0] === 'session_lost_unexplained');
    expect(calls).toHaveLength(0);
  });

  it('STAYS SILENT when there was never a session to lose', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount();
    await waitFor(() => expect(authCallback).not.toBeNull());

    authCallback!('INITIAL_SESSION', null);

    const calls = track.mock.calls.filter(c => c[0] === 'session_lost_unexplained');
    expect(calls).toHaveLength(0);
  });
});
