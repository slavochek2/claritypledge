/**
 * @file donate-page.tsx
 * @description P1123: /donate and /donate/:amount redirect straight to Stripe.
 *
 * No interstitial page — the founder's ask is a link you can paste anywhere and
 * have it land on checkout.
 *
 * THREE failure modes, all of which must stay visible rather than silent. A donate
 * link that dead-ends is an invisible lost gift (same reasoning as the paid-CTA
 * guard in offers-section.tsx, P951):
 *   1. URL unset/invalid  → no redirect, notice, Sentry.
 *   2. redirect throws    → caught, manual link shown, Sentry.
 *   3. redirect blocked or slow (tracker blocker, proxy, flaky connection) →
 *      the manual link is ALREADY rendered, so a navigation that never happens
 *      leaves a working link on screen instead of a white page.
 *
 * (3) is why this renders markup at all instead of null: a blocked navigation
 * gives no callback to react to, so the fallback cannot be scheduled after the
 * fact — it has to be on screen from the first paint.
 *
 * Why not embed: keeping claritypledge.com in the address bar requires Stripe's
 * Buy Button — a js.stripe.com script, a CSP allowance, and Dashboard-created
 * button objects. Three moving parts in the money path, rejected for a redirect.
 */
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { analytics } from "@/lib/mixpanel";
import { parseTier, resolveDonateUrl } from "@/lib/donate-links";

export function DonatePage() {
  const { amount } = useParams<{ amount?: string }>();
  const tier = parseTier(amount);
  const href = resolveDonateUrl(amount);
  // StrictMode double-invokes effects in dev. Without this the redirect fires
  // twice and donate_redirect is counted twice.
  const fired = useRef(false);

  useEffect(() => {
    if (href === null) {
      Sentry.captureMessage("P1123: Stripe donate link unset/invalid on /donate", {
        level: "error",
        tags: { source: "donate-page", area: "donations" },
        extra: { amount: amount ?? null },
      });
      return;
    }
    if (fired.current) return;
    fired.current = true;

    analytics.track("donate_redirect", { tier: tier ?? null });
    try {
      // replace(), not assign(): Back from Stripe must return to wherever the donor
      // came from, not bounce them through this route into a redirect loop.
      window.location.replace(href);
    } catch (err) {
      // Sandboxed contexts and some extensions throw here. The manual link below
      // is already on screen, so the donor can still get through.
      Sentry.captureMessage("P1123: Stripe donate redirect threw", {
        level: "error",
        tags: { source: "donate-page", area: "donations" },
        extra: { amount: amount ?? null, error: String(err) },
      });
    }
  }, [href, tier, amount]);

  if (href === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p role="alert" className="max-w-md text-center text-muted-foreground">
          Donations are temporarily unavailable. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p role="status" className="max-w-md text-center text-muted-foreground">
        Taking you to Stripe&hellip;{" "}
        <a href={href} className="underline hover:text-foreground">
          Continue to checkout
        </a>{" "}
        if nothing happens.
      </p>
    </div>
  );
}
