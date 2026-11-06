/**
 * P1556: /connect/:token, every branch the page renders — signed out (owner card, or "no longer works" before sign-up),
 * signed in (redeems once and opens the chat, own code goes to /me, each refusal has its message).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StrictMode } from 'react';

const TOKEN = '0123456789abcdef0123456789abcdef'; // gitleaks:allow — a made-up test token, not a credential
const auth = { user: null as null | { id: string }, isLoading: false, sessionChecked: true };
vi.mock('@/auth', () => ({ useAuth: () => auth }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { stopSessionRecording: vi.fn() } }));
vi.mock('@/app/components/auth/google-auth-button', () => ({ GoogleAuthButton: () => <button type="button">Continue with Google</button> }));
const lookup = vi.fn();
const redeem = vi.fn();
vi.mock('@/app/data/contact-code-service', () => ({
  lookupContactCode: (t: string) => lookup(t),
  redeemContactCode: (t: string) => redeem(t),
}));

import { ConnectPage } from '@/app/pages/connect-page';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/connect/:token" element={<ConnectPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  auth.user = null;
  lookup.mockReset();
  redeem.mockReset();
});

describe('signed out', () => {
  it('shows who the code belongs to, with sign-in that returns to the code', async () => {
    lookup.mockResolvedValue({ name: 'Mira Chen', avatarUrl: null, avatarColor: null });
    renderAt(`/connect/${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Mira Chen' })).toBeInTheDocument();
    expect(screen.getByText(/message Mira/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use email' })).toHaveAttribute('href', `/signup?redirect=%2Fconnect%2F${TOKEN}`);
    expect(screen.getByRole('link', { name: 'I have an account' })).toHaveAttribute('href', `/login?redirect=%2Fconnect%2F${TOKEN}`);
    expect(redeem).not.toHaveBeenCalled();
  });

  it('says the code no longer works BEFORE sign-up', async () => {
    lookup.mockResolvedValue(null);
    renderAt(`/connect/${TOKEN}`);
    expect(await screen.findByTestId('connect-refused')).toHaveAttribute('data-reason', 'unavailable');
    expect(screen.queryByRole('link', { name: 'Use email' })).toBeNull();
  });

  it('refuses a malformed token without asking the server', async () => {
    renderAt('/connect/not-a-token');
    expect(await screen.findByTestId('connect-refused')).toHaveAttribute('data-reason', 'unavailable');
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('signed in', () => {
  beforeEach(() => {
    auth.user = { id: 'u-1' };
  });

  it('redeems once (even under StrictMode) and opens the chat', async () => {
    redeem.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
    renderAt(`/connect/${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/conv-9'));
    expect(redeem).toHaveBeenCalledTimes(1);
  });

  it('opens your own profile for your own code', async () => {
    redeem.mockResolvedValue({ ok: false, reason: 'own-code' });
    renderAt(`/connect/${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/me'));
  });

  it.each(['paused', 'too-many', 'unavailable'] as const)('shows the %s refusal', async (reason) => {
    redeem.mockResolvedValue({ ok: false, reason });
    renderAt(`/connect/${TOKEN}`);
    expect(await screen.findByTestId('connect-refused')).toHaveAttribute('data-reason', reason);
  });

  it('a network failure offers Try again, which redeems again', async () => {
    redeem.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, conversationId: 'conv-2' });
    renderAt(`/connect/${TOKEN}`);
    (await screen.findByRole('button', { name: 'Try again' })).click();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/chats/c/conv-2'));
  });
});
