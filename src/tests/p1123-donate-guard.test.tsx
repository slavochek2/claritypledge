/**
 * @file p1123-donate-guard.test.tsx
 * @description P1123 DW-4: a missing or non-buy.stripe.com donate URL must FAIL LOUD —
 * disabled control plus a visible notice — never a link that silently goes nowhere.
 * Mirrors the P951 guard in offers-section.tsx: a dead donate button is an invisible
 * loss of a gift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { DonatePage } from '@/app/pages/donate-page';
import { isStripeLink } from '@/lib/donate-links';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/donate" element={<DonatePage />} />
        <Route path="/donate/:amount" element={<DonatePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('P1123 donate URL guard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['not a URL', 'not-a-url'],
    ['wrong host', 'https://evil.example.com/pay'],
    ['http downgrade of the right host', 'http://buy.stripe.com/x'],
  ])('%s → no link rendered, notice visible', (_label, value) => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', value as string);
    renderAt('/donate');

    expect(screen.queryByRole('link', { name: /support the work/i })).toBeNull();
    expect(screen.getByRole('button', { name: /support the work/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('alerts Sentry on mount when the link is broken', () => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', '');
    renderAt('/donate');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('P1123'),
      expect.objectContaining({ level: 'error' }),
    );
  });

  it('does not alert when the link is valid', () => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', 'https://buy.stripe.com/ok');
    renderAt('/donate');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('a broken tier link falls back to the valid base link rather than breaking', () => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', 'https://buy.stripe.com/base');
    vi.stubEnv('VITE_STRIPE_DONATE_URL_50', '');
    renderAt('/donate/50');
    expect(screen.getByRole('link', { name: /support the work/i })).toHaveAttribute(
      'href',
      'https://buy.stripe.com/base',
    );
  });

  describe('isStripeLink', () => {
    it.each([
      ['https://buy.stripe.com/abc', true],
      ['https://buy.stripe.com.evil.com/abc', false],
      ['http://buy.stripe.com/abc', false],
      ['https://dashboard.stripe.com/abc', false],
      ['javascript:alert(1)', false],
      ['', false],
      [undefined, false],
    ])('%s → %s', (input, expected) => {
      expect(isStripeLink(input as string)).toBe(expected);
    });
  });
});
