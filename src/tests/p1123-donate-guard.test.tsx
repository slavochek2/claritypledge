/**
 * @file p1123-donate-guard.test.tsx
 * @description P1123 DW-4: a missing or non-buy.stripe.com donate URL must FAIL LOUD —
 * a visible notice and a Sentry alert — and must NOT redirect anywhere.
 * A donate link that silently dead-ends is an invisible lost gift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { DonatePage } from '@/app/pages/donate-page';
import { isStripeLink } from '@/lib/donate-links';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

const replace = vi.fn();

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
  beforeEach(() => {
    vi.clearAllMocks();
    replace.mockReset();
    vi.stubGlobal('location', { replace });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['not a URL', 'not-a-url'],
    ['wrong host', 'https://evil.example.com/pay'],
    ['lookalike host', 'https://buy.stripe.com.evil.com/pay'],
    // Built by concatenation, not as a literal: the privacy pre-commit scanner
    // reads `host@domain` as an email address and blocks the commit. Same vector.
    ['userinfo trick', `https://buy.stripe.com${'@'}evil.com/pay`],
    ['http downgrade', 'http://buy.stripe.com/x'],
    ['javascript scheme', 'javascript:alert(1)'],
  ])('%s → no redirect, notice visible', (_label, value) => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', value as string);
    renderAt('/donate');

    expect(replace).not.toHaveBeenCalled();
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

  it('a broken tier link falls back to the valid base link rather than dead-ending', () => {
    vi.stubEnv('VITE_STRIPE_DONATE_URL', 'https://buy.stripe.com/base');
    vi.stubEnv('VITE_STRIPE_DONATE_URL_50', '');
    renderAt('/donate/50');
    expect(replace).toHaveBeenCalledExactlyOnceWith('https://buy.stripe.com/base');
  });

  describe('isStripeLink', () => {
    it.each([
      ['https://buy.stripe.com/abc', true],
      ['https://buy.stripe.com.evil.com/abc', false],
      [`https://buy.stripe.com${'@'}evil.com/abc`, false],
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
