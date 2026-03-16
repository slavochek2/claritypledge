import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';

const mockGetSession = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/app/data/api', () => ({
  getProfileResult: vi.fn().mockResolvedValue({ success: false, error: 'not_found' }),
  signOut: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { identify: vi.fn(), reset: vi.fn() },
}));

import { useAuth, AuthProvider } from '@/auth';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('P537: useAuth() reference stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  it('refreshProfile should be the same reference across re-renders', async () => {
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const firstRef = result.current.refreshProfile;
    rerender();
    expect(result.current.refreshProfile).toBe(firstRef);
  });

  it('signOut should be the same reference across re-renders', async () => {
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const firstRef = result.current.signOut;
    rerender();
    expect(result.current.signOut).toBe(firstRef);
  });

  it('user should remain the same reference when value unchanged', async () => {
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const firstUser = result.current.user;
    rerender();
    expect(result.current.user).toBe(firstUser);
  });

  it('session should remain the same reference when value unchanged', async () => {
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const firstSession = result.current.session;
    rerender();
    expect(result.current.session).toBe(firstSession);
  });
});
