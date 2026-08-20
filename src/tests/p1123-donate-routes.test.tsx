/**
 * @file p1123-donate-routes.test.tsx
 * @description P1123 DW-2/DW-3: every donate route redirects to the correct Stripe
 * payment link, and an unmapped amount falls through to the base link rather than 404.
 *
 * These links are LIVE-mode. Tests assert the redirect target only — never a checkout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DonatePage } from '@/app/pages/donate-page';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

const replace = vi.fn();

const URLS: Record<string, string> = {
  VITE_STRIPE_DONATE_URL: 'https://buy.stripe.com/base',
  VITE_STRIPE_DONATE_URL_5: 'https://buy.stripe.com/tier5',
  VITE_STRIPE_DONATE_URL_15: 'https://buy.stripe.com/tier15',
  VITE_STRIPE_DONATE_URL_50: 'https://buy.stripe.com/tier50',
  VITE_STRIPE_DONATE_URL_150: 'https://buy.stripe.com/tier150',
  VITE_STRIPE_DONATE_URL_500: 'https://buy.stripe.com/tier500',
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/donate" element={<DonatePage />} />
        <Route path="/donate/:amount" element={<DonatePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('P1123 donate routes redirect straight to Stripe', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.stubGlobal('location', { replace });
    for (const [k, v] of Object.entries(URLS)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['/donate', 'https://buy.stripe.com/base'],
    ['/donate/5', 'https://buy.stripe.com/tier5'],
    ['/donate/15', 'https://buy.stripe.com/tier15'],
    ['/donate/50', 'https://buy.stripe.com/tier50'],
    ['/donate/150', 'https://buy.stripe.com/tier150'],
    ['/donate/500', 'https://buy.stripe.com/tier500'],
  ])('%s redirects to %s', (path, expected) => {
    renderAt(path);
    expect(replace).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it.each([
    // Nearest tier, so any positive whole number reaches a sensible preset.
    ['/donate/55', 'tier50'],
    ['/donate/145', 'tier150'],
    ['/donate/37', 'tier50'],
    ['/donate/7', 'tier5'],
    ['/donate/1', 'tier5'],
    ['/donate/1000', 'tier500'],
    ['/donate/999999', 'tier500'],
  ])('%s resolves to the nearest tier (%s)', (path, tier) => {
    renderAt(path);
    expect(replace).toHaveBeenCalledExactlyOnceWith(`https://buy.stripe.com/${tier}`);
  });

  it.each([
    // Ties break UPWARD — rounding must never quietly lower the ask.
    ['/donate/10', 'tier15'],
    ['/donate/100', 'tier150'],
    ['/donate/325', 'tier500'],
  ])('%s breaks the tie upward (%s)', (path, tier) => {
    renderAt(path);
    expect(replace).toHaveBeenCalledExactlyOnceWith(`https://buy.stripe.com/${tier}`);
  });

  it('a digit string large enough to overflow to Infinity falls to the default', () => {
    // Guards the Number.isFinite() check: without it this coerces to Infinity and
    // the gap arithmetic compares NaN, silently picking tier 5.
    renderAt(`/donate/${'9'.repeat(400)}`);
    expect(replace).toHaveBeenCalledExactlyOnceWith('https://buy.stripe.com/base');
  });

  it.each([
    ['/donate/007', 'tier5'],
    ['/donate/0050', 'tier50'],
  ])('leading zeros in %s still resolve (%s)', (path, tier) => {
    renderAt(path);
    expect(replace).toHaveBeenCalledExactlyOnceWith(`https://buy.stripe.com/${tier}`);
  });

  it.each(['/donate/0', '/donate/abc', '/donate/-5', '/donate/5.5', '/donate/%20'])(
    'non-amount %s redirects to the default, never 404',
    (path) => {
      renderAt(path);
      expect(replace).toHaveBeenCalledExactlyOnceWith('https://buy.stripe.com/base');
    },
  );

  it('renders a manual fallback link from the first paint', () => {
    // A blocked navigation (tracker blocker, proxy) gives no callback to react to,
    // so the fallback cannot be scheduled after the fact — it must already be there.
    renderAt('/donate/50');
    expect(screen.getByRole('link', { name: /continue to checkout/i })).toHaveAttribute(
      'href',
      'https://buy.stripe.com/tier50',
    );
  });

  it('redirects exactly once under StrictMode (double-invoked effects)', () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/donate/50']}>
          <Routes>
            <Route path="/donate/:amount" element={<DonatePage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith('https://buy.stripe.com/tier50');
  });

  it('survives a throwing location.replace — link stays usable, Sentry alerted', async () => {
    const Sentry = await import('@sentry/react');
    replace.mockImplementation(() => { throw new Error('SecurityError'); });
    renderAt('/donate/50');
    expect(screen.getByRole('link', { name: /continue to checkout/i })).toBeInTheDocument();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('threw'),
      expect.objectContaining({ level: 'error' }),
    );
  });
});
