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
import { OffersSection, ChampionsCloseCta, Testimonials } from '@/app/components/landing/offers-section';
import { ProgramTimelineSection } from '@/app/components/landing/program-timeline-section';

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
    expect(screen.getByRole('heading', { name: 'Clarity Champions Program' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Partnership Clarity Package' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Coaching, Training & Consulting' })
    ).toBeInTheDocument();

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
      // Both non-self-serve rungs now carry the SAME label (founder UAT), so there are
      // two of these — getAllBy, not getBy, or the query throws on the ambiguity.
      ...screen.getAllByRole('link', { name: /book 15 minutes/i }),
    ];
    expect(ctas).toHaveLength(3);
    // Consistent shape — the thing founder UAT flagged as lost ("before we had the
    // consistency, and now we don't anymore").
    for (const cta of ctas) {
      expect(cta.className).toContain('h-12');
      expect(cta.className).toContain('w-full');
    }
    // P955: exactly ONE primary (filled blue) action on the page.
    expect(ctas.filter((c) => c.className.includes('bg-blue-500'))).toHaveLength(1);
  });

  it('sends both talk-first rungs to /intro and keeps the off-site link gone', () => {
    renderSection();
    const talkFirst = screen.getAllByRole('link', { name: /book 15 minutes/i });
    expect(talkFirst).toHaveLength(2);
    for (const cta of talkFirst) {
      expect(cta).toHaveAttribute('href', '/intro');
    }
    // "See the package" → ladischenski.com was cut at UAT: it sent a reader off-site to
    // learn what the card should already say, and the card now carries those bullets.
    expect(screen.queryByRole('link', { name: /see the package/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ladischenski/i })).not.toBeInTheDocument();
  });

  it('names the third rung for what it is, and never says "Custom" twice', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: 'Coaching, Training & Consulting' })
    ).toBeInTheDocument();
    // The heading "Custom Offers" over a "Custom" price said the same word twice and
    // named nothing (founder UAT). "Offers" must be gone from the section entirely —
    // otherwise the page carries two labels ("Pricing" and "Offers") for one thing.
    expect(screen.queryByText(/custom offers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bOffers\b/)).not.toBeInTheDocument();
  });

  it('carries no explanatory subhead above the grid (UAT round 3)', () => {
    renderSection();
    // The grid now OPENS the page and the program detail follows it, so the three cards no
    // longer read as three sizes of one program — the prose that said so is unnecessary.
    expect(screen.queryByText(/Clarity Champions is the program above/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/two other ways in/i)).not.toBeInTheDocument();
  });

  it('sells each rung on its outcome, not on a feature list (UAT round 3)', () => {
    renderSection();
    // The founder-named defect: three feature lists made three offers look like three sizes
    // of one thing, because features are the axis on which they overlap. Each card now leads
    // with who has the problem and what changes.
    expect(screen.getByText(/one working relationship safe before it costs you/i)).toBeInTheDocument();
    expect(screen.getByText(/you know that you both know/i)).toBeInTheDocument();
    expect(screen.getByText(/Carry it into your own organization/i)).toBeInTheDocument();
    expect(screen.getByText(/a problem you already feel/i)).toBeInTheDocument();

    // The deliverable stays verbatim from ladischenski.com, which owns and sells it.
    expect(screen.getByText(/signed Clarity Partnership Agreement you both own/i)).toBeInTheDocument();
    expect(screen.queryByText(/four 1:1 sessions/i)).not.toBeInTheDocument();

    // Delivery mechanics cut at UAT: "who cares about that? We need to stay high level."
    expect(screen.queryByText(/retainer available/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fixed curriculum/i)).not.toBeInTheDocument();
  });

  it('carries no in-house vocabulary in the bullets (UAT round 4 jargon pass)', () => {
    renderSection();
    // Founder: "the whole page, we need to scan and see what is jargony... delete it."
    // These are words that mean something INSIDE the project and nothing to a first-time
    // reader. Product names that denote a real, purchasable thing (Clarity Badge, Clarity
    // Partnership Agreement, Clarity Organization) are NOT jargon and stay.
    expect(screen.queryByText(/de-risk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gaps surfaced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/calibrated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not a curriculum/i)).not.toBeInTheDocument();
  });

  it('keeps both testimonials within one length band of each other (UAT round 4)', () => {
    render(
      <MemoryRouter>
        <Testimonials />
      </MemoryRouter>
    );
    const quotes = screen.getAllByRole('figure').map((f) => f.querySelector('blockquote')!.textContent!.length);
    expect(quotes).toHaveLength(2);
    // The imbalance the founder flagged was ~3.5x. Anything under 3x reads as two quotes
    // rather than one quote and one footnote; this asserts the SHAPE, not an exact length,
    // so a future copy edit that keeps the balance does not fail the suite.
    const [longest, shortest] = [Math.max(...quotes), Math.min(...quotes)];
    expect(longest / shortest).toBeLessThan(3);
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
    expect(screen.getByText(/clarity badges you can show/i)).toBeInTheDocument();
    expect(screen.getByText(/long after month three/i)).toBeInTheDocument();

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

describe('Page close — Champions-only CTA and the month arc (P1087, founder UAT round 3)', () => {
  it('repeats the membership buy as an AUTO-width primary, so the grid keeps the only full-width one', () => {
    render(
      <MemoryRouter>
        <ChampionsCloseCta />
      </MemoryRouter>
    );
    const cta = screen.getByRole('link', { name: /start at €295\/month/i });
    expect(cta).toHaveAttribute('href', LIVE_LINK);
    // P955: exactly one full-width primary per view. The grid's buy button owns that slot,
    // so the closing repeat must NOT be w-full or the page carries two competing primaries.
    expect(cta.className).toContain('w-auto');
    expect(cta.className).not.toContain('w-full');
    expect(cta.className).toContain('bg-blue-500');
  });

  it('runs the month arc past month three, where the monthly price keeps charging', () => {
    render(
      <MemoryRouter>
        <ProgramTimelineSection />
      </MemoryRouter>
    );
    expect(screen.getByText('Month 4 and beyond')).toBeInTheDocument();
    expect(screen.getByText(/help each other grow the practice/i)).toBeInTheDocument();
    // The lead no longer promises three months, because the arc no longer stops there.
    expect(screen.queryByText(/your first three months/i)).not.toBeInTheDocument();
    // The countdown moved to the page close — it is not part of this section any more.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});
