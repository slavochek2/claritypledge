/**
 * @file donate-links.ts
 * @description P1123: maps a donation tier to its Stripe payment link.
 *
 * Stripe Payment Link URLs accept only utm_*, client_reference_id, prefilled_email
 * and prefilled_promo_code — there is NO amount parameter, and unknown params are
 * silently dropped (docs.stripe.com/payment-links/url-parameters, read 2026-08-20).
 * A `?amount=` approach would therefore look like it worked while charging the
 * preset. Hence one pre-created link per tier, resolved here.
 *
 * Every link is a PRESET, not a fixed charge: the donor can still edit the amount
 * at Stripe. A tier link is a suggestion, so someone who can give less than the
 * link they were sent is never turned away.
 */

/** Tiers with a pre-created Stripe link. Order is display order. */
export const DONATE_TIERS = [5, 15, 50, 150, 500] as const;

export type DonateTier = (typeof DONATE_TIERS)[number];

/**
 * A donate URL is trusted only if it is https on exactly buy.stripe.com.
 * Rejects lookalike hosts (buy.stripe.com.evil.com), http downgrades, and
 * javascript: — this value ends up in an href.
 */
export const isStripeLink = (u: string | undefined): boolean => {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && parsed.host === "buy.stripe.com";
  } catch {
    return false;
  }
};

/** Base (pay-what-you-want, $5 preset) link — the fallback for every route. */
const baseUrl = (): string | undefined => import.meta.env.VITE_STRIPE_DONATE_URL;

const tierUrl = (tier: DonateTier): string | undefined => {
  // Indexed rather than computed: Vite statically replaces import.meta.env.X at
  // build time, so a template-literal key would resolve to undefined in prod.
  const byTier: Record<DonateTier, string | undefined> = {
    5: import.meta.env.VITE_STRIPE_DONATE_URL_5,
    15: import.meta.env.VITE_STRIPE_DONATE_URL_15,
    50: import.meta.env.VITE_STRIPE_DONATE_URL_50,
    150: import.meta.env.VITE_STRIPE_DONATE_URL_150,
    500: import.meta.env.VITE_STRIPE_DONATE_URL_500,
  };
  return byTier[tier];
};

/** Parse a route param into a known tier, or null. Rejects 0, negatives, decimals, junk. */
export const parseTier = (raw: string | undefined): DonateTier | null => {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return (DONATE_TIERS as readonly number[]).includes(n) ? (n as DonateTier) : null;
};

/**
 * Resolve the checkout URL for a route param.
 * An unmapped or broken tier falls back to the base link rather than 404ing or
 * rendering dead — the donor still reaches a working donation page.
 * Returns null only when NOTHING is configured, which the page must fail loud on.
 */
export const resolveDonateUrl = (rawAmount?: string): string | null => {
  const tier = parseTier(rawAmount);
  const candidate = tier ? tierUrl(tier) : undefined;
  if (isStripeLink(candidate)) return candidate as string;
  const base = baseUrl();
  return isStripeLink(base) ? (base as string) : null;
};
