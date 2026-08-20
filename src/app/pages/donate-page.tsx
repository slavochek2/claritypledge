/**
 * @file donate-page.tsx
 * @description P1123: /donate and /donate/:amount — support Clarity Pledge with a
 * one-time donation. The amount is a preset the donor can edit at Stripe.
 *
 * FAILS LOUD (disabled + notice + Sentry) rather than rendering a link that goes
 * nowhere. A donate button that looks live but is not is an invisible lost gift —
 * same reasoning as the paid-CTA guard in offers-section.tsx (P951).
 */
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { parseTier, resolveDonateUrl } from "@/lib/donate-links";

const CTA_LABEL = "Support the work";

export function DonatePage() {
  const { amount } = useParams<{ amount?: string }>();
  const tier = parseTier(amount);
  const href = resolveDonateUrl(amount);
  const broken = href === null;

  useEffect(() => {
    if (broken) {
      // A dead donate CTA on a live page is a silent loss. Surface it on the first
      // prod page load, not after a donor gives up. Sentry is prod-only (no-op in dev).
      Sentry.captureMessage("P1123: Stripe donate link unset/invalid on /donate", {
        level: "error",
        tags: { source: "donate-page", area: "donations" },
        extra: { amount: amount ?? null },
      });
    }
  }, [broken, amount]);

  useEffect(() => {
    analytics.track("donate_page_viewed", { tier: tier ?? null });
  }, [tier]);

  const ctaClass =
    "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-blue-500 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30";

  return (
    <div className="min-h-screen px-4 py-20">
      <SEO
        title="Support Clarity Pledge"
        description="Clarity Pledge is open source and free to use. Donations cover hosting and fund the research behind it."
        url="/donate"
      />
      <div className="container mx-auto max-w-xl">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <h1 className="mb-4 text-3xl font-bold sm:text-4xl">Support Clarity Pledge</h1>

          <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
            Clarity Pledge is open source and free to use. Donations cover hosting and fund
            the research behind it.
          </p>

          {broken ? (
            <>
              <button type="button" disabled className={`${ctaClass} w-full opacity-50`}>
                {CTA_LABEL}
              </button>
              <p role="alert" className="mt-4 text-sm text-destructive">
                Donations are temporarily unavailable. Please try again later.
              </p>
            </>
          ) : (
            <>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ctaClass} w-full`}
                onClick={() => analytics.track("donate_cta_clicked", { tier: tier ?? null })}
              >
                {CTA_LABEL}
              </a>
              <p className="mt-4 text-sm text-muted-foreground">
                {tier ? `Opens Stripe with $${tier} filled in — ` : "Opens Stripe — "}
                you choose the amount. One-time, secure checkout.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
