/**
 * P935: Authenticated user shown anonymous "Save your responses" signup gate.
 *
 * Canary — asserts the USER-VISIBLE SYMPTOM:
 *   An already-logged-in user landing on /signup?source=letter-response must NOT
 *   see the anonymous gate (Continue with Google / Save my responses). Instead,
 *   their sessionStorage draft is submitted via submitLetterResponseAuthenticated
 *   and they are forwarded to the letter-response confirm page.
 *
 * Before the fix (signup-page has no useAuth guard): the anon gate renders for the
 * authenticated user and nothing is submitted → both assertions fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks ---------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Auth state is swapped per-test via this mutable holder.
const authState: { user: unknown; sessionChecked: boolean; isLoading: boolean } = {
  user: null,
  sessionChecked: true,
  isLoading: false,
};
vi.mock('@/auth', () => ({
  useAuth: () => authState,
}));

const mockSubmitAuthenticated = vi.fn().mockResolvedValue('delivery-1');
const mockRequestSignin = vi.fn().mockResolvedValue(undefined);
vi.mock('@/app/data/letters-service', () => ({
  submitLetterResponseAuthenticated: (...args: unknown[]) => mockSubmitAuthenticated(...args),
  requestLetterResponseSignin: (...args: unknown[]) => mockRequestSignin(...args),
}));

vi.mock('@/app/data/api', () => ({
  signInWithEmail: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), identify: vi.fn(), setUserProperties: vi.fn() },
}));

// Stub the Google button so the "Continue with Google" affordance is a stable
// marker for "the anonymous gate is rendered".
vi.mock('@/app/components/auth/google-auth-button', () => ({
  GoogleAuthButton: () => <button>Continue with Google</button>,
}));

import { SignupPage } from '@/app/pages/signup-page';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/signup${search}`]}>
      <SignupPage />
    </MemoryRouter>,
  );
}

describe('P935: authenticated user on letter-response signup gate', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSubmitAuthenticated.mockClear();
    mockRequestSignin.mockClear();
    sessionStorage.clear();
    authState.user = null;
    authState.sessionChecked = true;
    authState.isLoading = false;
  });

  it('does NOT show the anonymous gate to an authenticated user; submits draft and forwards to confirm', async () => {
    authState.user = { id: 'u1', slug: 'jane-doe' };
    sessionStorage.setItem(
      'letter-response-draft-L1',
      JSON.stringify({
        letterId: 'L1',
        ratings: [{ storyId: 's1', rating: 2 }],
        positions: [{ pointId: 'p1', position: 'agree' }],
      }),
    );

    const { queryByText } = renderAt('?source=letter-response&letterId=L1&senderName=Vyacheslav');

    // Symptom: the anonymous gate must not be shown to a logged-in user.
    await waitFor(() => {
      expect(mockSubmitAuthenticated).toHaveBeenCalledTimes(1);
    });
    expect(queryByText('Continue with Google')).toBeNull();
    expect(queryByText('Save my responses')).toBeNull();

    // Draft submitted with the exact authenticated call shape (string position, not numeric).
    expect(mockSubmitAuthenticated).toHaveBeenCalledWith(
      'L1',
      [{ storyId: 's1', rating: 2 }],
      [{ pointId: 'p1', position: 'agree' }],
      expect.any(String),
    );

    // Forwarded to the confirm page.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/letter/L1/confirm', { replace: true });
    });
  });

  it('bounces an authenticated user out of a non-letter /signup (mirrors login-page)', async () => {
    authState.user = { id: 'u1', slug: 'jane-doe' };
    const { queryByText } = renderAt('?redirect=%2Fevents%2Fmy-event');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/events/my-event', { replace: true });
    });
    expect(queryByText('Continue with Google')).toBeNull();
    expect(mockSubmitAuthenticated).not.toHaveBeenCalled();
  });

  it('bounces an authenticated user with no redirect to their profile', async () => {
    authState.user = { id: 'u1', slug: 'jane-doe' };
    renderAt('');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/p/jane-doe', { replace: true });
    });
  });

  it('still shows the anonymous gate to an unauthenticated user (no regression)', () => {
    authState.user = null;
    const { queryByText } = renderAt('?source=letter-response&letterId=L1&senderName=Vyacheslav');

    expect(queryByText('Continue with Google')).not.toBeNull();
    expect(queryByText('Save my responses')).not.toBeNull();
    expect(mockSubmitAuthenticated).not.toHaveBeenCalled();
  });
});
