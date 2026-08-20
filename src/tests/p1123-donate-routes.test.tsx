/**
 * @file p1123-donate-routes.test.tsx
 * @description P1123 DW-2/DW-3: every donate route resolves to the correct Stripe
 * payment link, and an unmapped amount falls through to /donate rather than 404ing.
 *
 * These links are LIVE-mode. Tests assert the href only — never a checkout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DonatePage } from '@/app/pages/donate-page';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

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

describe('P1123 donate routes', () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(URLS)) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['/donate', 'https://buy.stripe.com/base'],
    ['/donate/5', 'https://buy.stripe.com/tier5'],
    ['/donate/15', 'https://buy.stripe.com/tier15'],
    ['/donate/50', 'https://buy.stripe.com/tier50'],
    ['/donate/150', 'https://buy.stripe.com/tier150'],
    ['/donate/500', 'https://buy.stripe.com/tier500'],
  ])('%s links to %s', (path, expected) => {
    renderAt(path);
    const cta = screen.getByRole('link', { name: /support the work/i });
    expect(cta).toHaveAttribute('href', expected);
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it.each(['/donate/37', '/donate/0', '/donate/abc', '/donate/-5', '/donate/5.5'])(
    'unmapped %s falls through to the base link, never 404',
    (path) => {
      renderAt(path);
      const cta = screen.getByRole('link', { name: /support the work/i });
      expect(cta).toHaveAttribute('href', 'https://buy.stripe.com/base');
    },
  );

  it('shows the founder-approved headline and funding copy', () => {
    renderAt('/donate');
    expect(screen.getByRole('heading', { name: /support clarity pledge/i })).toBeInTheDocument();
    expect(
      screen.getByText(/open source and free to use.*hosting.*research/i),
    ).toBeInTheDocument();
  });

  it('renders exactly one primary action (P955)', () => {
    renderAt('/donate/50');
    expect(screen.getAllByRole('link', { name: /support the work/i })).toHaveLength(1);
  });
});
