/**
 * @file p1421-nav-hint-cleared-on-sign-out.test.tsx
 * @description P1421: the nav's "this user was verified on this device" marker must not
 * outlive the session — a shared device would keep the previous account's id and evidence.
 * Every session-ending auth event (deliberate sign-out, expiry/revocation, other-tab sign-out)
 * clears it. Harness mirrors p1240-session-loss-instrumentation.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

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
vi.mock('@/app/contexts/live-session-context', () => ({
  clearActiveSessionFromStorage: vi.fn(),
}));

import { AuthProvider } from '@/auth/AuthContext';
import { hasNavVerifiedHint, setNavVerifiedHint } from '@/lib/nav-verified-hint';

const FAKE_SESSION = { user: { id: 'u1', email: 'u@example.com' }, expires_at: 1 } as unknown;

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  localStorage.clear();
  getSession.mockResolvedValue({ data: { session: FAKE_SESSION }, error: null });
});

describe('P1421: nav-verified marker is removed when the session ends', () => {
  it.each(['SIGNED_OUT', 'TOKEN_REFRESHED'])('%s with no session clears the outgoing user marker', async (event) => {
    setNavVerifiedHint('u1', true);
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', FAKE_SESSION); // session established
    expect(hasNavVerifiedHint('u1')).toBe(true);

    authCallback!(event, null); // sign-out, or expiry/revocation surfacing as a null session

    expect(hasNavVerifiedHint('u1')).toBe(false);
  });

  it('an anonymous boot (no session ever) does not touch storage it does not own', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    localStorage.setItem('unrelated', 'x');
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(authCallback).not.toBeNull());
    authCallback!('INITIAL_SESSION', null);
    expect(localStorage.getItem('unrelated')).toBe('x');
  });
});
