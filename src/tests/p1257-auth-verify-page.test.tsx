/**
 * @file p1257-auth-verify-page.test.tsx
 * @description P1257 canary for the generic /auth/verify?token_hash= sign-in landing page.
 *
 * The defect this page closes: `admin.generateLink` mints implicit-flow (`#access_token=`)
 * URLs, and auth-js refuses them under `flowType: 'pkce'`, so no minted sign-in link was
 * redeemable. This page redeems the `token_hash` half instead, via `verifyOtp`.
 *
 * Canary gate — before the page existed, every test here fails at import (no such module).
 * The cases that matter beyond that:
 *   - the token reaches verifyOtp and the user is handed to the profile Writer
 *   - a single-use token is not redeemed twice (StrictMode / re-render)
 *   - post-auth intent (?redirect=) survives the hand-off, and the token does not
 *   - an attacker-supplied ?type= cannot steer GoTrue onto an unintended path
 *   - failure shows a route OUT, not the /sign-pledge loop decisions.md 2026-09-03 named
 *
 * Per epistemic gate 7c, the fixture deliberately contains legitimate inputs that must be
 * ALLOWED (valid magiclink, valid signup type, forwarded redirect), not only rejects.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const verifyOtp = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { verifyOtp: (...args: unknown[]) => verifyOtp(...args) } },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/components/ui/clarity-loader', () => ({
  ClarityPageLoader: () => <div data-testid="loading" />,
}));

import { AuthVerifyPage } from '@/auth/AuthVerifyPage';

/** Point window.location at a given verify URL, the way a mail client would open it. */
function atUrl(search: string) {
  window.history.replaceState(null, '', `/auth/verify${search}`);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthVerifyPage />
    </MemoryRouter>
  );
}

describe('P1257 — /auth/verify redeems a token_hash link', () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    navigate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redeems the token and hands off to the profile Writer at /auth/callback', async () => {
    atUrl('?token_hash=abc123');
    renderPage();

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'magiclink' });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true })
    );
  });

  it('strips the token from the address bar once its fate is known', async () => {
    atUrl('?token_hash=secret-token');
    renderPage();

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/auth/verify');
  });

  it('strips the token when GoTrue definitively rejects it', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
    atUrl('?token_hash=stale');
    renderPage();

    await screen.findByText(/this link can't be used/i);
    expect(window.location.search).toBe('');
  });

  // Adversarial review finding B-1. Stripping the token before the call meant a dropped
  // connection burned a still-unspent link from the user's side, and then told them it was
  // already used — the dead end this whole page exists to remove.
  it('KEEPS the token in the URL when the request never reached the server', async () => {
    verifyOtp.mockRejectedValue(new Error('network down'));
    atUrl('?token_hash=unspent-token');
    renderPage();

    await screen.findByText(/couldn't reach the server/i);
    expect(window.location.search).toContain('unspent-token');
  });

  it('tells the user the link still works, and offers retry rather than a new link', async () => {
    verifyOtp.mockRejectedValue(new Error('network down'));
    atUrl('?token_hash=unspent-token');
    renderPage();

    expect(await screen.findByText(/your link is still good/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /send me a new link/i })).not.toBeInTheDocument();
  });

  // Adversarial review finding B-2, corrected: `reauthentication` is NOT an EmailOtpType.
  // The real union in node_modules/@supabase/auth-js is
  // signup | invite | magiclink | recovery | email_change | email.
  it.each(['invite', 'email_change', 'recovery', 'email', 'signup', 'magiclink'])(
    'passes the real OTP type %s straight through instead of mislabelling it magiclink',
    async (type) => {
      atUrl(`?token_hash=abc123&type=${type}`);
      renderPage();

      await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type });
    }
  );

  it('forwards post-auth intent to the callback but never the token', async () => {
    atUrl('?token_hash=abc123&redirect=%2Fevents%2Fhike&action=rsvp');
    renderPage();

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const target = navigate.mock.calls[0][0] as string;
    expect(target).toContain('redirect=%2Fevents%2Fhike');
    expect(target).toContain('action=rsvp');
    expect(target).not.toContain('token_hash');
    expect(target).not.toContain('abc123');
  });

  it('redeems a signup-type confirmation link (the Mailgun signup path)', async () => {
    atUrl('?token_hash=abc123&type=signup');
    renderPage();

    await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'signup' });
  });

  it('falls back to magiclink rather than passing an unlisted type to GoTrue', async () => {
    atUrl('?token_hash=abc123&type=phone_change');
    renderPage();

    await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'magiclink' });
  });

  it('redeems a single-use token exactly once across a re-render', async () => {
    atUrl('?token_hash=abc123');
    const { rerender } = renderPage();

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
    rerender(
      <MemoryRouter>
        <AuthVerifyPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
  });

  it('shows an error with a way out when the link is already used or expired', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    atUrl('?token_hash=stale');
    renderPage();

    expect(await screen.findByText(/this link can't be used/i)).toBeInTheDocument();
    // Must route to login, not /sign-pledge — the loop named in decisions.md 2026-09-03.
    const out = screen.getByRole('link', { name: /send me a new link/i });
    expect(out).toHaveAttribute('href', '/login');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not claim a cause it cannot know', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'bad token' } });
    atUrl('?token_hash=stale');
    renderPage();

    await screen.findByText(/this link can't be used/i);
    // AuthCallbackPage asserts "valid for 1 hour"; a used link and an expired link are
    // indistinguishable from here, so this page must not repeat that claim.
    expect(screen.queryByText(/valid for 1 hour/i)).not.toBeInTheDocument();
  });

  it('errors without calling verifyOtp when there is no token at all', async () => {
    atUrl('');
    renderPage();

    expect(await screen.findByText(/this link can't be used/i)).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('errors rather than hanging when verifyOtp rejects', async () => {
    verifyOtp.mockRejectedValue(new Error('network down'));
    atUrl('?token_hash=abc123');
    renderPage();

    // Superseded by B-1: a rejected request is a NETWORK failure, not a dead link, so this
    // asserts the retry copy. It previously asserted "this link can't be used", which was
    // the defect — the message told the truth about the request and lied about the link.
    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
