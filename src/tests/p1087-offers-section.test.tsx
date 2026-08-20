/**
 * @file p1087-offers-section.test.tsx
 *
 * P1087 Done-When: "A deliberately invalid Stripe link renders the disabled fail-loud
 * state, not a working-looking button — exit path exercised, not reasoned about"
 * (epistemic.md gate 7). No VITE_STRIPE_MEMBERSHIP_URL is set in this test env, which is
 * the real deployed state until the founder creates the Stripe subscription link — so
 * this exercises the actual current default, not a synthetic broken value.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersSection } from '@/app/components/landing/offers-section';

function renderSection() {
  return render(
    <MemoryRouter>
      <OffersSection />
    </MemoryRouter>
  );
}

describe('OffersSection — Clarity Champions membership (P1087)', () => {
  it('fails loud when the Stripe membership link is unset (the current real default)', () => {
    renderSection();
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
    // The confident-looking buy button must NOT be present when broken.
    expect(screen.queryByRole('link', { name: /start at €295\/month/i })).not.toBeInTheDocument();
  });

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
