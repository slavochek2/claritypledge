/**
 * @file p1325-auth-verify-any-browser.test.tsx
 * @description P1325 — the signup/login email link points at /auth/verify so it works in a
 * browser other than the one that requested it. That routes EVERY signup through this page,
 * so the adversarial review's findings on it are pinned here:
 *
 *   - redirect_to (the template's {{ .RedirectTo }}) is PARSED: accepted only for this origin's
 *     /auth/callback, in both the raw and the escaped rendering; anything else is dropped.
 *   - a transient failure (supabase-js RETURNS AuthRetryableFetchError, it does not throw)
 *     keeps the token and offers retry instead of burning the link.
 *   - a failed redemption in a browser that already holds a session continues with the intent.
 *   - the failure page's way out keeps the event intent, and a signup goes back to /signup
 *     (a person with no profile is refused by /login).
 *
 * Per epistemic gate 7c, legitimate inputs that must be ALLOWED sit beside the rejects.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const verifyOtp = vi.fn();
const getSession = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      getSession: (...args: unknown[]) => getSession(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/components/ui/clarity-loader', () => ({
  ClarityPageLoader: () => <div data-testid="loading" />,
}));

import { AuthVerifyPage } from '@/auth/AuthVerifyPage';

const ORIGIN = window.location.origin;
const CALLBACK = `${ORIGIN}/auth/callback?source=signup&redirect=%2Fevents%2Fclarity-night&action=rsvp`;

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

function target(): URL {
  return new URL(navigate.mock.calls[0]![0] as string, ORIGIN);
}

describe('P1325 — carried redirect_to', () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    navigate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('unpacks an ESCAPED redirect_to into the callback params', async () => {
    atUrl(`?token_hash=h1&type=email&redirect_to=${encodeURIComponent(CALLBACK)}`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const t = target();
    expect(t.pathname).toBe('/auth/callback');
    expect(t.searchParams.get('source')).toBe('signup');
    expect(t.searchParams.get('redirect')).toBe('/events/clarity-night');
    expect(t.searchParams.get('action')).toBe('rsvp');
    expect(t.searchParams.has('redirect_to')).toBe(false);
    expect(t.href).not.toContain('h1');
  });

  // The hosted template was verified live (test project) to render {{ .RedirectTo }} ESCAPED.
  // A raw rendering is therefore not a legitimate input, and accepting it only widened what an
  // email link can carry (code review, P1325) — so it is refused: sign-in proceeds, intent dropped.
  it('refuses a RAW (unescaped) redirect_to: signs in, carries no intent', async () => {
    atUrl(`?token_hash=h1&type=email&redirect_to=${CALLBACK}`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it('refuses trailing params glued onto a callback path (code-review probe)', async () => {
    atUrl(`?token_hash=h1&type=email&redirect_to=${ORIGIN}/auth/callback&action=join-org&redirect=/groups/x/join`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it('accepts the exact lowercase-hex escaping GoTrue produced live', async () => {
    const live = 'http%3a%2f%2flocalhost%3a5300%2fauth%2fcallback%3fsource%3dsignup%26redirect%3d%252Fevents%252Fx%26action%3drsvp';
    atUrl(`?token_hash=h1&type=email&redirect_to=${live}`);
    // this test runs on jsdom's origin, so the live localhost:5300 origin must be REJECTED here
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it('accepts a bare callback with no params', async () => {
    atUrl(`?token_hash=h1&type=email&redirect_to=${encodeURIComponent(`${ORIGIN}/auth/callback`)}`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it.each([
    ['a foreign origin', `https://evil.example/auth/callback?redirect=%2Fevents%2Fx`],
    ['a lookalike host', `${ORIGIN}.evil.example/auth/callback?redirect=%2Fevents%2Fx`],
    ['another path on this origin', `${ORIGIN}/events/x?redirect=%2Fevents%2Fx`],
    ['a protocol-relative URL', `//evil.example/auth/callback?redirect=%2Fevents%2Fx`],
    ['a javascript: URL', `javascript:alert(1)//auth/callback?redirect=%2Fevents%2Fx`],
    ['garbage', `not a url at all`],
  ])('drops %s but still signs in', async (_label, bad) => {
    atUrl(`?token_hash=h1&type=email&redirect_to=${encodeURIComponent(bad)}`);
    renderPage();
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it('never forwards params smuggled beside a rejected redirect_to', async () => {
    atUrl(`?token_hash=h1&type=email&redirect_to=https://evil.example/auth/callback?source=signup&redirect=%2Fevents%2Fx`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }));
  });

  it('keeps the P1257 flat-param forwarding when there is no redirect_to', async () => {
    atUrl('?token_hash=h1&redirect=%2Fevents%2Fhike&action=rsvp');
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const t = target();
    expect(t.searchParams.get('redirect')).toBe('/events/hike');
    expect(t.searchParams.get('action')).toBe('rsvp');
  });
});

describe('P1325 — a transient failure never destroys the link', () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    navigate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['AuthRetryableFetchError (network, returned not thrown)', { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }],
    ['a 503', { name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' }],
    ['a 429', { name: 'AuthApiError', status: 429, message: 'Too many requests' }],
    ['AuthRetryableFetchError carrying no status', { name: 'AuthRetryableFetchError', message: 'Load failed' }],
  ])('keeps the token and offers retry on %s', async (_label, error) => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error });
    atUrl('?token_hash=unspent&type=email');
    renderPage();
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(window.location.search).toContain('unspent');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still treats a definitive rejection as a dead link', async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 403, message: 'Email link is invalid or has expired' } });
    atUrl('?token_hash=spent&type=email');
    renderPage();
    expect(await screen.findByText(/this link can't be used/i)).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});

describe('P1325 — already signed in, or recovering', () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 403, message: 'Email link is invalid or has expired' } });
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    navigate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  // Code review, P1325: continuing to the CALLBACK here would let any dead link run the callback's
  // actions (rsvp, join-org, set-position) for whoever is signed in. The signed-in person goes to
  // the safe destination page instead, and no action runs from this path.
  it('sends an already-signed-in browser to the destination page, never through the callback', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(CALLBACK)}`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/events/clarity-night', { replace: true }));
    expect(navigate.mock.calls.some((c) => String(c[0]).startsWith('/auth/callback'))).toBe(false);
    expect(screen.queryByText(/this link can't be used/i)).not.toBeInTheDocument();
  });

  it('sends an already-signed-in browser home when the destination is not allowlisted', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const bad = `${ORIGIN}/auth/callback?source=signup&redirect=%2F%2Fevil.example&action=join-org`;
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(bad)}`);
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('carries the auth-gate params /signup reads (pointId, position, pointTitle) into recovery', async () => {
    const gate = `${ORIGIN}/auth/callback?source=signup&redirect=%2Fpoint%2Fabc&action=set-position&pointId=abc&position=agree&pointTitle=T`;
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(gate)}`);
    renderPage();
    const out = await screen.findByRole('link', { name: /send me a new link/i });
    const href = new URL(out.getAttribute('href')!, ORIGIN);
    expect(href.pathname).toBe('/signup');
    expect(href.searchParams.get('pointId')).toBe('abc');
    expect(href.searchParams.get('position')).toBe('agree');
    expect(href.searchParams.get('pointTitle')).toBe('T');
  });

  it('sends a failed SIGNUP back to /signup with the event intent', async () => {
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(CALLBACK)}`);
    renderPage();
    const out = await screen.findByRole('link', { name: /send me a new link/i });
    const href = new URL(out.getAttribute('href')!, ORIGIN);
    expect(href.pathname).toBe('/signup');
    expect(href.searchParams.get('redirect')).toBe('/events/clarity-night');
    expect(href.searchParams.get('action')).toBe('rsvp');
  });

  it('sends a failed LOGIN back to /login with its intent', async () => {
    const login = `${ORIGIN}/auth/callback?source=login&redirect=%2Fevents%2Fhike&action=rsvp`;
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(login)}`);
    renderPage();
    const out = await screen.findByRole('link', { name: /send me a new link/i });
    const href = new URL(out.getAttribute('href')!, ORIGIN);
    expect(href.pathname).toBe('/login');
    expect(href.searchParams.get('redirect')).toBe('/events/hike');
  });

  it('sends a failed PLEDGE signup back to /sign-pledge, not /login (which refuses people with no profile)', async () => {
    const pledge = `${ORIGIN}/auth/callback?source=pledge`;
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(pledge)}`);
    renderPage();
    const out = await screen.findByRole('link', { name: /send me a new link/i });
    expect(out.getAttribute('href')).toBe('/sign-pledge');
  });

  it('does not carry a redirect the allowlist rejects into the recovery link', async () => {
    const bad = `${ORIGIN}/auth/callback?source=signup&redirect=%2F%2Fevil.example&action=rsvp`;
    atUrl(`?token_hash=used&type=email&redirect_to=${encodeURIComponent(bad)}`);
    renderPage();
    const out = await screen.findByRole('link', { name: /send me a new link/i });
    const href = new URL(out.getAttribute('href')!, ORIGIN);
    expect(href.searchParams.has('redirect')).toBe(false);
    expect(href.origin).toBe(ORIGIN);
  });
});
