/**
 * @file p1297-notices.test.tsx
 * @description P1297: what the person sees around a session that could not be confirmed.
 *  - /login says the session expired when a stored session ended without a sign-out — once, and
 *    the P1441 seat notice wins when both are set (one toast, never two).
 *  - useConnectivityAndAuthSettled lets an offline reader stop waiting on a restore that cannot
 *    finish without the network, and keeps an online one waiting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

const authState: { user: unknown; sessionChecked: boolean; isLoading: boolean } = { user: null, sessionChecked: true, isLoading: false };
vi.mock('@/auth', () => ({ useAuth: () => authState }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/app/components/pledge/login-form', () => ({ LoginForm: () => <div>login form</div> }));
vi.mock('@/app/components/auth/google-auth-button', () => ({ GoogleAuthButton: () => <button>Continue with Google</button> }));
vi.mock('@/app/data/api', () => ({ signInWithEmail: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn(), setUserProperties: vi.fn() } }));
let seatNotice: string | null = null;
vi.mock('@/lib/session-guard', () => ({ takeSignInAgainNotice: () => seatNotice }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import { LoginPage } from '@/app/pages/login-page';
import { SESSION_EXPIRED_MESSAGE, setSessionExpiredNotice } from '@/auth/stored-session';
import { OfflineStatusProvider, useConnectivityAndAuthSettled } from '@/app/contexts/offline-status-context';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes><Route path="/login" element={<LoginPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  seatNotice = null;
  Object.assign(authState, { user: null, sessionChecked: true, isLoading: false });
});

describe('P1297 — /login after a session ended on its own', () => {
  it('says the session expired, once', async () => {
    setSessionExpiredNotice();
    const first = renderLogin();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE));
    first.unmount();
    toastError.mockClear();
    renderLogin();
    await new Promise((r) => setTimeout(r, 20));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('no notice is written while the person is already on /login (it would show on a later visit)', () => {
    window.history.pushState({}, '', '/login');
    setSessionExpiredNotice();
    expect(sessionStorage.getItem('p1297-session-expired')).toBeNull();
    window.history.pushState({}, '', '/');
    setSessionExpiredNotice();
    expect(sessionStorage.getItem('p1297-session-expired')).toBe('1');
  });

  it('a bare visit to /login shows no notice', async () => {
    renderLogin();
    await new Promise((r) => setTimeout(r, 20));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('the P1441 seat notice wins when both are set: one toast', async () => {
    setSessionExpiredNotice();
    seatNotice = 'Please sign in again to reserve your seat.';
    renderLogin();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith('Please sign in again to reserve your seat.');
    // The expiry notice is consumed too, so it does not surface on a later visit.
    expect(sessionStorage.getItem('p1297-session-expired')).toBeNull();
  });
});

describe('P1297 — useConnectivityAndAuthSettled', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <OfflineStatusProvider>{children}</OfflineStatusProvider>;
  const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

  it('online and still restoring: not settled (the reader keeps waiting)', () => {
    setOnline(true);
    Object.assign(authState, { sessionChecked: false, isLoading: true });
    const { result } = renderHook(() => useConnectivityAndAuthSettled(), { wrapper });
    expect(result.current).toMatchObject({ offline: false, authSettled: false });
  });

  it('offline and still restoring: settled (the offline reader opens on its cache)', () => {
    setOnline(false);
    Object.assign(authState, { sessionChecked: false, isLoading: true });
    const { result } = renderHook(() => useConnectivityAndAuthSettled(), { wrapper });
    expect(result.current).toMatchObject({ offline: true, authSettled: true });
    setOnline(true);
  });

  it('online and restored: settled', () => {
    setOnline(true);
    const { result } = renderHook(() => useConnectivityAndAuthSettled(), { wrapper });
    expect(result.current.authSettled).toBe(true);
  });
});
