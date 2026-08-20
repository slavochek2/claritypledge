/**
 * @file p1087-offers-section.test.tsx
 *
 * P1087 Done-When: "A deliberately invalid Stripe link renders the disabled fail-loud
 * state, not a working-looking button — exit path exercised, not reasoned about"
 * (epistemic.md gate 7). Both branches of `STRIPE_MEMBERSHIP_URL` are tested explicitly
 * via `vi.stubEnv` + `vi.resetModules()` (the module reads the env var at import time),
 * not by relying on the ambient test-env default.
 *
 * NOTE on the unset case: the module now carries the LIVE payment link as its hardcoded
 * default (P954 — env indirection baked empty strings into the prod bundle), so an unset
 * env var is the WORKING state, not the broken one. `''` is therefore stubbed explicitly
 * to reach the fail-loud branch; the ambient default is asserted separately as working.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OffersSection } from '@/app/components/landing/offers-section';

const LIVE_LINK = 'https://buy.stripe.com/fZu8wPchH88D9ZFaGo1Jm09';

function renderSection(Component: typeof OffersSection = OffersSection) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );
}

async function renderWithStripeUrl(value: string) {
  vi.stubEnv('VITE_STRIPE_MEMBERSHIP_URL', value);
  vi.resetModules();
  const { OffersSection: FreshSection } = await import('@/app/components/landing/offers-section');
  return renderSection(FreshSection);
}

describe('OffersSection — Stripe membership link state (P1087)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails loud when the Stripe membership link is explicitly blanked', async () => {
    await renderWithStripeUrl('');
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
    // The confident-looking buy button must NOT be present when broken.
    expect(screen.queryByRole('link', { name: /start at €295\/month/i })).not.toBeInTheDocument();
  });

  it('renders a real working checkout link when a valid Stripe subscription URL is set', async () => {
    await renderWithStripeUrl('https://buy.stripe.com/test_abc123');
    expect(screen.queryByText(/checkout temporarily unavailable/i)).not.toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /start at €295\/month/i });
    expect(cta).toHaveAttribute('href', 'https://buy.stripe.com/test_abc123');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('falls back to the hardcoded LIVE payment link when no env override is set', () => {
    renderSection();
    const cta = screen.getByRole('link', { name: /start at €295\/month/i });
    expect(cta).toHaveAttribute('href', LIVE_LINK);
    expect(screen.queryByText(/checkout temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it('fails loud on a non-Stripe host even when the scheme/path look plausible (host-pinned, not startsWith)', async () => {
    await renderWithStripeUrl('https://evil.example/buy.stripe.com');
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
  });

  it('fails loud on a non-https scheme even with the right host (protocol-pinned, not host-only)', async () => {
    await renderWithStripeUrl('javascript://buy.stripe.com/%0aalert(1)');
    expect(screen.getByText(/checkout temporarily unavailable/i)).toBeInTheDocument();
  });

  it('drops the "next Clarity Experiment" fallback line from the broken state (founder UAT)', async () => {
    await renderWithStripeUrl('');
    expect(screen.queryByText(/next clarity experiment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/to enroll/i)).not.toBeInTheDocument();
  });
});

describe('OffersSection — three-card offer ladder (P1087, founder UAT)', () => {
  it('shows all three offers, with the membership as the one selected card', () => {
    const { container } = renderSection();
    expect(screen.getByText('Clarity Champions')).toBeInTheDocument();
    expect(screen.getByText('Partnership Clarity Package')).toBeInTheDocument();
    expect(screen.getByText('Custom Offers')).toBeInTheDocument();

    // Exactly one card carries the "selected" treatment.
    expect(container.querySelectorAll('.border-blue-500.border-2')).toHaveLength(1);

    // The retired P937/P951 tier names must not come back.
    expect(screen.queryByText('Standard Program')).not.toBeInTheDocument();
    expect(screen.queryByText('Premium Program')).not.toBeInTheDocument();
  });

  it('prices each card: €295/month, €1,450 one-off, and Custom (never €950)', () => {
    renderSection();
    // Scoped to the price element — a bare /€295/ also matches the CTA label
    // ("Start at €295/month") and the wrapping <p>.
    expect(screen.getByText(/^€295/, { selector: 'span.text-4xl' })).toBeInTheDocument();
    expect(screen.getByText('/ month')).toBeInTheDocument();
    expect(screen.getByText('€1,450')).toBeInTheDocument();
    expect(screen.getByText('one-off')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.queryByText(/€950/)).not.toBeInTheDocument();
  });

  it('gives all three cards the same CTA geometry, with only the membership primary', () => {
    renderSection();
    const ctas = [
      screen.getByRole('link', { name: /start at €295\/month/i }),
      screen.getByRole('link', { name: /see the package/i }),
      screen.getByRole('link', { name: /book 15 minutes/i }),
    ];
    // Consistent shape — the thing founder UAT flagged as lost ("before we had the
    // consistency, and now we don't anymore").
    for (const cta of ctas) {
      expect(cta.className).toContain('h-12');
      expect(cta.className).toContain('w-full');
    }
    // P955: exactly ONE primary (filled blue) action on the page.
    expect(ctas.filter((c) => c.className.includes('bg-blue-500'))).toHaveLength(1);
  });

  it('routes each CTA to its own destination', () => {
    renderSection();
    expect(screen.getByRole('link', { name: /see the package/i })).toHaveAttribute(
      'href',
      'https://ladischenski.com'
    );
    expect(screen.getByRole('link', { name: /book 15 minutes/i })).toHaveAttribute('href', '/intro');
  });

  it('names training, coaching and consulting on the Custom Offers card', () => {
    renderSection();
    expect(screen.getByText(/training, coaching, and consulting/i)).toBeInTheDocument();
  });
});

describe('OffersSection — assurance band and de-duplicated bullets (P1087, founder UAT)', () => {
  it('states the guarantee OUTSIDE the cards, scoped to the membership, with no "no refund after delivery" clause', () => {
    const { container } = renderSection();
    const guarantee = screen.getByText(/full refund on month one/i);
    expect(guarantee).toBeInTheDocument();
    expect(screen.queryByText(/no refund after delivery/i)).not.toBeInTheDocument();

    // It must not live inside any offer card — the pre-P1087 placement, restored.
    const cards = Array.from(container.querySelectorAll('.rounded-2xl'));
    expect(cards.some((card) => card.contains(guarantee))) .toBe(false);
    // …and it must say which offer it covers, since two of the three don't carry it.
    expect(guarantee.textContent).toMatch(/clarity champions/i);
  });

  it('keeps the VAT note with the guarantee band, below the grid', () => {
    renderSection();
    expect(screen.getByText(/price excludes VAT/i)).toBeInTheDocument();
  });

  it('drops every membership bullet that another part of the page already states', () => {
    renderSection();
    // Kept — nothing else on the page says these.
    expect(screen.getByText(/partial clarity badges on the situations you cover/i)).toBeInTheDocument();
    expect(screen.getByText(/the standing practice community after month three/i)).toBeInTheDocument();

    // Cut at UAT: duplicated the batch-size chip, the "/ month" price line, and the
    // Month 2 / Month 3 headings respectively.
    expect(screen.queryByText(/3–10 people/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cancel any month/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/help taking the practice to people in your own organization/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/help opening your Clarity Organization/i)).not.toBeInTheDocument();

    // Full 9-of-9 badging must never be implied.
    expect(screen.queryByText(/full clarity badge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/9-of-9/i)).not.toBeInTheDocument();
  });

  it('drops the free-platform line and the /org/cm cross-link (founder UAT: both cut)', () => {
    renderSection();
    expect(screen.queryByText(/the platform itself is free, always/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /see what a practice community looks like/i })).not.toBeInTheDocument();
  });
});
