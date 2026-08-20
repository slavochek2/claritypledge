/**
 * @file donate-page.tsx
 * @description P1123: /donate and /donate/:amount redirect straight to Stripe.
 *
 * No interstitial page — the founder's ask is a link you can paste anywhere and
 * have it land on checkout. The only thing rendered is the failure state.
 *
 * FAILS LOUD (notice + Sentry) rather than redirecting nowhere. A donate link
 * that silently dead-ends is an invisible lost gift — same reasoning as the
 * paid-CTA guard in offers-section.tsx (P951).
 *
 * Why not embed: keeping claritypledge.com in the address bar requires Stripe's
 * Buy Button — a js.stripe.com script, a CSP allowance, and Dashboard-created
 * button objects. Three moving parts in the money path, rejected for a redirect.
 */
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { analytics } from "@/lib/mixpanel";
import { parseTier, resolveDonateUrl } from "@/lib/donate-links";

export function DonatePage() {
  const { amount } = useParams<{ amount?: string }>();
  const tier = parseTier(amount);
  const href = resolveDonateUrl(amount);

  useEffect(() => {
    if (href === null) {
      Sentry.captureMessage("P1123: Stripe donate link unset/invalid on /donate", {
        level: "error",
        tags: { source: "donate-page", area: "donations" },
        extra: { amount: amount ?? null },
      });
      return;
    }
    analytics.track("donate_redirect", { tier: tier ?? null });
    // replace(), not assign(): Back from Stripe must return to wherever the donor
    // came from, not bounce them through this route into a redirect loop.
    window.location.replace(href);
  }, [href, tier, amount]);

  if (href !== null) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p role="alert" className="max-w-md text-center text-muted-foreground">
        Donations are temporarily unavailable. Please try again later.
      </p>
    </div>
  );
}
