/**
 * @file p1087-offers-section.test.tsx
 *
 * P1087 Done-When: "A deliberately invalid Stripe link renders the disabled fail-loud
 * state, not a working-looking button — exit path exercised, not reasoned about"
 * (epistemic.md gate 7). Both branches of `STRIPE_MEMBERSHIP_URL` are tested explicitly
 * via `vi.stubEnv` + `vi.resetModules()` (the module reads the env var at import time),
 * not by relying on the ambient test-env default — code review flagged the earlier
 * version of this file for exactly that: it broke the moment the founder's own named
 * prerequisite (creating the real Stripe link) was fulfilled, and never modelled the
 * working checkout path at all.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersSection } from '@/app/components/landing/offers-section';

function renderSection(Component: typeof OffersSection = OffersSection) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

describe('OffersSection — Stripe membership link state (P1087)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails loud when the Stripe membership link is unset', async () => {
    vi.stubEnv('VITE_STRIPE_MEMBERSHIP_URL', '');
    vi.resetModules();
    const { OffersSection: FreshSection } = await import('@/app/components/landing/offers-section');

    renderSection(FreshSection);
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
    // The confident-looking buy button must NOT be present when broken.
    expect(screen.queryByRole('link', { name: /start at €295\/month/i })).not.toBeInTheDocument();
  });

  it('renders a real working checkout link when a valid Stripe subscription URL is set', async () => {
    vi.stubEnv('VITE_STRIPE_MEMBERSHIP_URL', 'https://buy.stripe.com/test_abc123');
    vi.resetModules();
    const { OffersSection: FreshSection } = await import('@/app/components/landing/offers-section');

    renderSection(FreshSection);
    expect(screen.queryByText(/checkout temporarily unavailable/i)).not.toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /start at €295\/month/i });
    expect(cta).toHaveAttribute('href', 'https://buy.stripe.com/test_abc123');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('fails loud on a non-Stripe host even when the scheme/path look plausible (host-pinned, not startsWith)', async () => {
    vi.stubEnv('VITE_STRIPE_MEMBERSHIP_URL', 'https://evil.example/buy.stripe.com');
    vi.resetModules();
    const { OffersSection: FreshSection } = await import('@/app/components/landing/offers-section');

    renderSection(FreshSection);
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
  });

  it('fails loud on a non-https scheme even with the right host (protocol-pinned, not host-only)', async () => {
    vi.stubEnv('VITE_STRIPE_MEMBERSHIP_URL', 'javascript://buy.stripe.com/%0aalert(1)');
    vi.resetModules();
    const { OffersSection: FreshSection } = await import('@/app/components/landing/offers-section');

    renderSection(FreshSection);
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
  });
});

describe('OffersSection — Clarity Champions membership (P1087)', () => {
  it('shows exactly one membership offer, not a three-card grid', () => {
    renderSection();
    expect(screen.getByText('Clarity Champions')).toBeInTheDocument();
    expect(screen.queryByText('Standard Program')).not.toBeInTheDocument();
    expect(screen.queryByText('Premium Program')).not.toBeInTheDocument();
    expect(screen.getByText('€295')).toBeInTheDocument();
  });

  it('states the guarantee with the exact required refund terms, no "no refund after delivery" clause', () => {
    renderSection();
    expect(
      screen.getByText(/full refund on month one/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/no refund after delivery/i)).not.toBeInTheDocument();
  });

  it('cites the badging add-on at €1,450, never €950', () => {
    renderSection();
    expect(screen.getByText(/€1,450/)).toBeInTheDocument();
    expect(screen.queryByText(/€950/)).not.toBeInTheDocument();
  });

  it('the Custom Offers CTA opens /intro and names the 90-minute introductory workshop', () => {
    renderSection();
    const cta = screen.getByRole('link', { name: /book 15 minutes/i });
    expect(cta).toHaveAttribute('href', '/intro');
    expect(screen.getByText(/90-minute introductory workshop/i)).toBeInTheDocument();
  });

  it('the free-platform line links to /signup and does not compete with the paid CTA', () => {
    renderSection();
    const freeLine = screen.getByText(/the platform itself is free, always/i);
    expect(freeLine.closest('a')).toHaveAttribute('href', '/signup');
  });

  it('cross-links to /org/cm as discovery, not a gate', () => {
    renderSection();
    const orgLink = screen.getByRole('link', { name: /see what a practice community looks like/i });
    expect(orgLink).toHaveAttribute('href', '/org/cm');
  });

  it('renders all 8 "what\'s included" bullets verbatim from the spec', () => {
    renderSection();
    expect(screen.getByText(/weekly live practice sessions with your batch \(3–10 people\)/i)).toBeInTheDocument();
    expect(screen.getByText(/partial clarity badges on the situations you cover/i)).toBeInTheDocument();
    expect(screen.getByText(/the standing practice community after month three/i)).toBeInTheDocument();
    // Full 9-of-9 badging must never be implied.
    expect(screen.queryByText(/full clarity badge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/9-of-9/i)).not.toBeInTheDocument();
  });
});
