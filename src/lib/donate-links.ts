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

/**
 * Hardcoded prod links, env var as override only.
 *
 * These are PUBLIC URLs — they embed a product and price, never a credential, so
 * there is no security rationale for env-var indirection. Env-var-only `VITE_*`
 * for a public value is a silent prod outage waiting to happen: Vite bakes
 * `VITE_*` at build time, Vercel builds the prod bundle, and a var that lives
 * only in a gitignored `.env.local` becomes `undefined` there. That exact failure
 * took /pricing's checkout down once already — decisions.md 2026-06-19 (P954).
 *
 * Verify they are baked into prod with:
 *   curl -s https://claritypledge.com/assets/index-*.js | grep -o "buy.stripe.com/[A-Za-z0-9]*"
 */
const PROD_LINKS = {
  base: "https://buy.stripe.com/eVqcN5epPex1dbR4i01Jm05", // $15 default
  5: "https://buy.stripe.com/aFa4gz5Tj60vc7N29S1Jm04",
  15: "https://buy.stripe.com/eVqcN5epPex1dbR4i01Jm05",
  50: "https://buy.stripe.com/7sY3cvepP1Kf6NtdSA1Jm06",
  150: "https://buy.stripe.com/dRmbJ13Lb60vc7NaGo1Jm07",
  500: "https://buy.stripe.com/00w14n3Lb9cHc7NcOw1Jm08",
} as const;

/** Base (pay-what-you-want, $15 preset) link — the fallback for every route. */
const baseUrl = (): string | undefined =>
  import.meta.env.VITE_STRIPE_DONATE_URL ?? PROD_LINKS.base;

const tierUrl = (tier: DonateTier): string | undefined => {
  // Indexed rather than computed: Vite statically replaces import.meta.env.X at
  // build time, so a template-literal key would resolve to undefined in prod.
  const byTier: Record<DonateTier, string | undefined> = {
    5: import.meta.env.VITE_STRIPE_DONATE_URL_5 ?? PROD_LINKS[5],
    15: import.meta.env.VITE_STRIPE_DONATE_URL_15 ?? PROD_LINKS[15],
    50: import.meta.env.VITE_STRIPE_DONATE_URL_50 ?? PROD_LINKS[50],
    150: import.meta.env.VITE_STRIPE_DONATE_URL_150 ?? PROD_LINKS[150],
    500: import.meta.env.VITE_STRIPE_DONATE_URL_500 ?? PROD_LINKS[500],
  };
  return byTier[tier];
};

/**
 * Parse a route param into a tier, resolving to the NEAREST one.
 * /donate/55 -> $50, /donate/145 -> $150. Any positive whole number reaches a
 * sensible preset instead of silently landing on the default.
 *
 * Ties break UPWARD (/donate/10 -> $15, /donate/100 -> $150): rounding should
 * never quietly lower the ask the donor was sent.
 *
 * Returns null for junk, zero, negatives and decimals — those fall to the default.
 * Note /donate/1000 resolves DOWN to $500, the top tier; the donor can still edit
 * the amount at Stripe, so a generous giver is inconvenienced, never blocked.
 */
export const parseTier = (raw: string | undefined): DonateTier | null => {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  let best: DonateTier = DONATE_TIERS[0];
  let bestGap = Math.abs(n - best);
  for (const tier of DONATE_TIERS) {
    const gap = Math.abs(n - tier);
    // `<=` with ascending DONATE_TIERS makes an exact tie select the higher tier.
    if (gap <= bestGap) {
      best = tier;
      bestGap = gap;
    }
  }
  return best;
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
