/**
 * OffersSection — transparent pricing (P937).
 *
 * One component, two mounts (single source of truth for prices/copy):
 *   - `variant="compact"` on the landing ("/") — the program is already explained
 *     above, so this is prices + guarantee + CTA only (no bullet lists).
 *   - `variant="full"` on `/offers` — standalone page for a cold visitor, so it
 *     keeps the condensed program bullets.
 *
 * Two tiers, per-pair pricing:
 *   - Platform — Free forever (the app; reassurance, lighter weight).
 *   - Co-Founder Program (group) — €1,000/pair (featured; the product).
 *
 * The founding €500/pair price + video testimonial stay the WEBINAR-EXCLUSIVE close
 * and are deliberately NOT shown here. The risk-free guarantee IS public (universal
 * policy, not a founding sweetener). Layout adapted from the ladischenski.com pricing
 * grid, rebuilt in cp's design system (semantic tokens, blue actions). See
 * features/p937…
 */
import { Link } from "react-router-dom";
import { CheckIcon, ShieldCheckIcon, ArrowRightIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import {
  WEBINAR_REGISTER_URL,
  WEBINAR_URL_IS_PLACEHOLDER,
} from "@/app/content/webinar";

/**
 * [FOUNDER DECISION: Stripe Payment Link URL]. Empty until the founder provisions it.
 * While empty, the program CTA routes to webinar registration (the live path to join)
 * so no fake/broken checkout link ships.
 */
const STRIPE_PAYMENT_URL = "";
const STRIPE_IS_SET = /^https?:\/\//.test(STRIPE_PAYMENT_URL);

// Condensed from the landing PROGRAM_TIMELINE (no new copy authored).
const PROGRAM_BULLETS = [
  "A short recorded lesson, on your schedule",
  "A live group Q&A with the founder",
  "Facilitated practice with your cohort",
  "Your signed Clarity Partner Agreement",
];

const PLATFORM_BULLETS = [
  "The full app — practice clarity any time",
  "Free and open source. No account needed to start",
  "Yours to keep — during the program and after",
];

/** Renders an internal `<Link>` for in-app paths and an external `<a>` otherwise. */
function CtaLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}

export function OffersSection({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const full = variant === "full";

  // Program CTA: real Stripe link when set, else the webinar (the live path to buy).
  const programHref = STRIPE_IS_SET ? STRIPE_PAYMENT_URL : WEBINAR_REGISTER_URL;
  // Short label so the CTA stays one line in the side-by-side card grid at ~768px.
  const programCtaLabel = STRIPE_IS_SET ? "Join the program" : "Reserve your seat";

  const cardBase =
    "flex h-full flex-col rounded-2xl border bg-card p-8 shadow-sm";

  return (
    <section className={`px-4 ${className}`}>
      <div className="container mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Simple, <span className="text-blue-500">transparent</span> pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            The app is free. The coached program is priced per pair — you enroll together.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-stretch">
          {/* Platform — free, reassurance (lighter weight) */}
          <div className={`${cardBase} border-border`}>
            <h3 className="text-lg font-bold">Platform</h3>
            <p className="mt-1 text-sm text-muted-foreground">The app</p>
            <p className="mt-4 text-4xl font-bold tracking-tight text-foreground">
              Free<span className="text-lg font-semibold text-muted-foreground"> forever</span>
            </p>
            {full && (
              <ul className="mt-6 space-y-3">
                {PLATFORM_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto pt-8">
              <Link
                to="/sign-pledge"
                className="inline-flex h-12 w-full items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                onClick={() => analytics.track("offers_cta_clicked", { tier: "platform", variant })}
              >
                Start free
              </Link>
            </div>
          </div>

          {/* Co-Founder Program — featured, the product */}
          <div className={`${cardBase} relative border-2 border-blue-500 shadow-md`}>
            <span className="absolute -top-3 right-6 rounded-full bg-blue-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              For co-founder pairs
            </span>
            <h3 className="text-lg font-bold">Co-Founder Program <span className="font-normal text-muted-foreground">(group)</span></h3>
            <p className="mt-1 text-sm text-muted-foreground">Coached, cohort-based</p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">€1,000</span>
              <span className="text-lg font-semibold text-muted-foreground">/ pair</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Covers both co-founders — you enroll as a pair</p>
            {full && (
              <ul className="mt-6 space-y-3">
                {PROGRAM_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto pt-8">
              <CtaLink
                href={programHref}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30"
                onClick={() =>
                  analytics.track("offers_cta_clicked", {
                    tier: "program",
                    variant,
                    destination: STRIPE_IS_SET ? "stripe" : "webinar",
                  })
                }
              >
                {programCtaLabel}
                <ArrowRightIcon className="h-4 w-4 shrink-0" />
              </CtaLink>
            </div>
          </div>
        </div>

        {/* Public risk-free guarantee — universal policy, not a founding sweetener.
            Neutral/blue treatment (green is reserved for success states, per src.md). */}
        <div className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 px-6 py-4 text-center">
          <ShieldCheckIcon className="h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            Risk-free: a full refund if you&rsquo;re not satisfied.
          </p>
        </div>

        {WEBINAR_URL_IS_PLACEHOLDER && full && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            The founding-cohort price is shared live on the free webinar.
          </p>
        )}
      </div>
    </section>
  );
}

export default OffersSection;
