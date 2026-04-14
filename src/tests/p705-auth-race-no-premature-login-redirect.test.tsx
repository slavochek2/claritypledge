import { render, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '@/auth/AuthContext';

// Control mocks with closure-captured refs — assigned when the component mounts
let resolveGetSession: (val: unknown) => void;
let fireAuthStateChange: (event: string, session: unknown) => void;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => new Promise((r) => { resolveGetSession = r; }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        fireAuthStateChange = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

vi.mock('@/app/data/api', () => ({
  getProfileResult: vi.fn().mockResolvedValue({
    success: true,
    data: { id: 'u1', slug: 'test', name: 'Test' },
  }),
  signOut: vi.fn(),
  patchClaritySessionLiveState: vi.fn(),
  clearSessionJoiner: vi.fn(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() },
}));

vi.mock('@/app/contexts/live-session-context', () => ({
  clearActiveSessionFromStorage: vi.fn(),
}));

// Simulates the guard pattern used by letters-page, me-page, etc.
function TestGuard({ onRedirect }: { onRedirect: (path: string) => void }) {
  const { user, sessionChecked, isLoading } = useAuth();
  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) onRedirect('/login?redirect=/letters');
  }, [user, sessionChecked, isLoading, onRedirect]);
  return null;
}

describe('P705 — AuthContext does not allow protected guard to redirect during hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('with adversarial timing (getSession slow, onAuthStateChange silent), guard never sees user=null+sessionChecked=true+isLoading=false', async () => {
    const onRedirect = vi.fn();
    const session = { user: { id: 'u1' } };

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestGuard onRedirect={onRedirect} />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Adversarial timing: getSession resolves AFTER a tick, onAuthStateChange
    // does NOT fire any event before getSession resolves.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolveGetSession({ data: { session }, error: null });
    });

    // Let effects flush
    await waitFor(() => expect(onRedirect).not.toHaveBeenCalled());

    // Also validate profile eventually loads without the guard ever firing
    await act(async () => {
      fireAuthStateChange?.('INITIAL_SESSION', session);
    });

    await waitFor(() => {
      // Guard should NEVER have been called with /login
      expect(onRedirect).not.toHaveBeenCalled();
    });
  });

  test('genuinely logged out user: guard fires after sessionChecked flips true (else-branch still works)', async () => {
    const onRedirect = vi.fn();

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestGuard onRedirect={onRedirect} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await act(async () => {
      resolveGetSession({ data: { session: null }, error: null });
    });

    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith('/login?redirect=/letters');
    });
  });
});
