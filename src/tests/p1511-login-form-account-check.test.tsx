/**
 * P1511: the login form maps the check-login-email outcomes.
 *   absent      → today's "No account found" message, no link sent
 *   found       → today's link flow (no shouldCreateUser override)
 *   limited /
 *   unavailable → link sent with shouldCreateUser: false and the normal "check your email" screen,
 *                 whatever the sign-in call answers — no message, no account created.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

const checkLoginEmail = vi.fn();
const signInWithEmail = vi.fn();

vi.mock('@/app/data/api', () => ({
  checkLoginEmail: (...a: unknown[]) => checkLoginEmail(...a),
  signInWithEmail: (...a: unknown[]) => signInWithEmail(...a),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/auth/google-auth-button', () => ({ GoogleAuthButton: () => null }));

import { LoginForm } from '@/app/components/pledge/login-form';

const NO_ACCOUNT = 'No account found with this email. Sign up instead.';

function submit(email = 'someone@example.com') {
  render(
    <MemoryRouter>
      <LoginForm onSwitchToSign={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /send me a magic link/i }));
}

describe('P1511 login form account check', () => {
  beforeEach(() => {
    checkLoginEmail.mockReset();
    signInWithEmail.mockReset().mockResolvedValue({ error: null });
  });

  test('absent: shows the no-account message and sends nothing', async () => {
    checkLoginEmail.mockResolvedValue('absent');
    submit();
    expect(await screen.findByText(NO_ACCOUNT)).toBeTruthy();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  test('found: today\'s link flow, unchanged options', async () => {
    checkLoginEmail.mockResolvedValue('found');
    submit();
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
    expect(signInWithEmail).toHaveBeenCalledTimes(1);
    expect(signInWithEmail.mock.calls[0][2]).not.toHaveProperty('shouldCreateUser');
  });

  test('found: a sign-in error is still shown, as before', async () => {
    checkLoginEmail.mockResolvedValue('found');
    signInWithEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });
    submit();
    expect(await screen.findByText('Email rate limit exceeded')).toBeTruthy();
  });

  for (const outcome of ['limited', 'unavailable'] as const) {
    test(`${outcome}: link with shouldCreateUser false, check-your-email screen, no message`, async () => {
      checkLoginEmail.mockResolvedValue(outcome);
      submit();
      expect(await screen.findByText(/check your email/i)).toBeTruthy();
      expect(signInWithEmail).toHaveBeenCalledTimes(1);
      expect(signInWithEmail.mock.calls[0][2]).toMatchObject({ shouldCreateUser: false });
      expect(screen.queryByText(NO_ACCOUNT)).toBeNull();
    });

    test(`${outcome}: a refused sign-in (no such account) still shows the same screen`, async () => {
      checkLoginEmail.mockResolvedValue(outcome);
      signInWithEmail.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } });
      submit();
      expect(await screen.findByText(/check your email/i)).toBeTruthy();
      expect(screen.queryByText(/signups not allowed/i)).toBeNull();
    });
  }

  test('limited: a network failure on the send is shown — it cannot depend on the address', async () => {
    checkLoginEmail.mockResolvedValue('limited');
    signInWithEmail.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    submit();
    expect(await screen.findByText('An unexpected error occurred. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/check your email/i)).toBeNull();
  });

  test('limited: a 504 from the auth server stays hidden — the server answered, and may only time out for known addresses', async () => {
    checkLoginEmail.mockResolvedValue('limited');
    signInWithEmail.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', message: '{}', status: 504 } });
    submit();
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
    expect(screen.queryByText('An unexpected error occurred. Please try again.')).toBeNull();
  });

  test('unavailable: a thrown send is shown as the generic error', async () => {
    checkLoginEmail.mockResolvedValue('unavailable');
    signInWithEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    submit();
    expect(await screen.findByText('An unexpected error occurred. Please try again.')).toBeTruthy();
  });

  test('limited: GoTrue rate limit (429) stays hidden — it only reaches known addresses', async () => {
    checkLoginEmail.mockResolvedValue('limited');
    signInWithEmail.mockResolvedValue({ error: { name: 'AuthApiError', message: 'Email rate limit exceeded', status: 429 } });
    submit();
    expect(await screen.findByText(/check your email/i)).toBeTruthy();
    expect(screen.queryByText(/rate limit/i)).toBeNull();
  });

  test('check call itself throws: treated as unavailable, never as absent', async () => {
    checkLoginEmail.mockRejectedValue(new Error('network'));
    submit();
    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledTimes(1));
    expect(signInWithEmail.mock.calls[0][2]).toMatchObject({ shouldCreateUser: false });
    expect(screen.queryByText(NO_ACCOUNT)).toBeNull();
  });
});
