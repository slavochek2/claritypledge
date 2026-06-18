/**
 * OffersSection — transparent pricing (P937).
 *
 * One component, two mounts (single source of truth for prices/copy). Both variants
 * show the value bullets (they answer "what do I get?" right at the price); the variants
 * differ only by orientation chrome:
 *   - `variant="compact"` on the landing ("/") — drops the section subhead and the
 *     webinar footnote (the program is already explained above).
 *   - `variant="full"` on `/offers` — standalone page for a cold visitor, so it keeps
 *     the subhead orientation line + the webinar footnote.
 *
 * Tiers, per-pair pricing:
 *   - Platform — Free (the app; reassurance, lighter weight).
 *   - Co-Founder Program — €950/pair (featured; the product). A live countdown to the
 *     cohort enrollment deadline (CohortCountdown) carries urgency.
 *   - Co-Founder Program Premium — €2450/pair (P951). Personal verification of the 9
 *     stories + Clarity Badge + guidance on one high-stakes conversation. /offers only —
 *     it anchors the €950. The compact landing stays two tiers.
 *
 * The founding €500/pair price + video testimonial stay the WEBINAR-EXCLUSIVE close
 * and are deliberately NOT shown here. The risk-free guarantee IS public, scoped to the
 * paid program. Layout adapted from the ladischenski.com pricing grid, rebuilt in cp's
 * design system (semantic tokens, blue actions). See features/p937…
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, ShieldCheckIcon, ArrowRightIcon, ClockIcon, LinkedinIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { getCountdownParts } from "@/app/utils/format-time";
import {
  WEBINAR_REGISTER_URL,
  COHORT_ENROLLMENT_CLOSES_ISO,
} from "@/app/content/webinar";

/**
 * Stripe Payment Links (P951). Public URLs — safe to expose via VITE_ env vars; the
 * secret key never leaves Stripe. The founding discount is a Stripe promotion code (25%
 * off, both tiers) entered at checkout — there is deliberately no app-side discount field.
 *
 * Validation is host-pinned, not scheme-only: a config-derived URL that reaches an
 * <a href> must be an actual Stripe checkout link (`.claude/rules/src.md` — User-
 * Controlled URL Sinks; an ad-hoc `startsWith('http')` check does not qualify). On the
 * full (/pricing) variant a missing/invalid link is a build misconfiguration and the CTA
 * FAILS LOUD (disabled + notice) rather than silently routing to the webinar — a webinar
 * that looks like checkout is a broken checkout that loses the sale invisibly.
 */
const STRIPE_STANDARD_URL = import.meta.env.VITE_STRIPE_STANDARD_URL ?? "";
const STRIPE_PREMIUM_URL = import.meta.env.VITE_STRIPE_PREMIUM_URL ?? "";
const isStripeLink = (u: string) => {
  try {
    return new URL(u).host === "buy.stripe.com";
  } catch {
    return false;
  }
};
const STANDARD_IS_SET = isStripeLink(STRIPE_STANDARD_URL);
const PREMIUM_IS_SET = isStripeLink(STRIPE_PREMIUM_URL);

// Mirrors the program timeline (Week 1–3): live webinar + Clarity Letter exchange,
// cross-pair 1-on-1 sessions with calibration measured, guidance to sign the agreement.
const PROGRAM_BULLETS = [
  "A live webinar where we introduce you to the clarity protocol and answer your questions",
  "Clarity Letters exchanged with your cohort before you meet",
  "1-on-1 live peer sessions — exchange and measure your listening calibration",
  "Guidance to sign your Clarity Partner Agreement",
];

// The five how-it-works moves, expressed as concrete free-platform features
// (will → skill → friction → align → pitfalls).
const PLATFORM_BULLETS = [
  "Showcase your commitment with a public clarity pledge and badge",
  "Separate a claim's meaning from its validity with stories and points",
  "Cut time and emotional friction with async Clarity Letters",
  "Sign and manage your Clarity Partner Agreements",
  "Transcribe live sessions and track verification progress",
];

// Premium tier (P951): the program PLUS personal verification of the 9 stories
// (issued Clarity Badge) and guidance on one real high-stakes conversation. The lead
// value is "kill the illusion of understanding" — first on the protocol, then on what
// matters most. Shown only on /offers (full variant), where it anchors the €950.
const PREMIUM_BULLETS = [
  "Everything in the Co-Founder Program",
  "I personally verify you and your co-founder both understand the clarity protocol deeply — not just feel you do — and fill every gap I find",
  "Issued Clarity Badge — verified proof you share the framework",
  "Personal guidance applying the protocol to one real highest-stakes conversation",
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

/**
 * Paid-tier action. When `broken` (full variant + no valid Stripe link), it FAILS LOUD —
 * a disabled control + webinar fallback link — instead of silently routing a confident
 * "Reserve your seat" button to the webinar. Used by both paid cards, so it lives once
 * here. (P951 adversarial review: silent fallback hid missing-env-var misroutes.)
 */
function PaidCta({
  broken,
  href,
  label,
  className,
  onClick,
}: {
  broken: boolean;
  href: string;
  label: string;
  className: string;
  onClick: () => void;
}) {
  if (broken) {
    return (
      <div className="text-center">
        <span
          aria-disabled="true"
          className={`${className} pointer-events-none opacity-50`}
        >
          Checkout temporarily unavailable
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          Join the{" "}
          <Link to={WEBINAR_REGISTER_URL} className="underline hover:text-foreground">
            webinar
          </Link>{" "}
          to enroll.
        </p>
      </div>
    );
  }
  return (
    <CtaLink href={href} className={className} onClick={onClick}>
      {label}
      <ArrowRightIcon className="h-4 w-4 shrink-0" />
    </CtaLink>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Live countdown to the founding cohort's enrollment deadline (COHORT_ENROLLMENT_CLOSES_ISO).
 * Ticks once per second; degrades to a static "closed" line once the deadline passes (never
 * shows negative numbers). Urgency is carried by the ticking digits and a blue assurance band
 * — the design system reserves amber/orange/red, so no red "hurry" color is used.
 */
function CohortCountdown() {
  const target = useMemo(() => new Date(COHORT_ENROLLMENT_CLOSES_ISO).getTime(), []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;

  const { expired, days, hours, minutes, seconds } = getCountdownParts(target, now);

  if (expired) {
    return (
      <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
        Enrollment for this cohort has closed &mdash; the next cohort opens on the webinar.
      </p>
    );
  }

  const units = [
    { value: days, label: "days" },
    { value: hours, label: "hrs" },
    { value: minutes, label: "min" },
    { value: seconds, label: "sec" },
  ];

  return (
    <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Enrollment closes in
      </div>
      <div
        className="mt-2 flex items-stretch justify-center gap-1.5"
        role="timer"
        aria-label={`Enrollment closes in ${days} days, ${hours} hours, ${minutes} minutes`}
      >
        {units.map((u) => (
          <div
            key={u.label}
            className="flex min-w-[3.25rem] flex-col items-center rounded-lg bg-card px-2 py-1.5 shadow-sm"
          >
            <span className="text-xl font-bold tabular-nums text-foreground">{pad(u.value)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {u.label}
            </span>
          </div>
        ))}
      </div>
    </div>
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

  // Standard program CTA. On /pricing (full) it goes straight to Stripe checkout — the
  // page's job is buying. On the landing (compact) it stays webinar registration — the
  // landing's job is to drive the live intro. The webinar fallback is INTENTIONAL only on
  // compact; on full, a missing/invalid Stripe link is a misconfiguration → standardBroken
  // makes the CTA fail loud (see PaidCta) instead of silently routing to the webinar.
  const standardToStripe = full && STANDARD_IS_SET;
  const standardBroken = full && !STANDARD_IS_SET;
  const programHref = standardToStripe ? STRIPE_STANDARD_URL : WEBINAR_REGISTER_URL;
  // Short label so the CTA stays one line in the side-by-side card grid at ~768px.
  const programCtaLabel = standardToStripe ? "Reserve your seat" : "Reserve one of 5 spots";
  const programDestination = standardToStripe ? "stripe" : "webinar";

  // Premium CTA (full variant only) — straight to its Stripe link; fails loud if unset.
  const premiumToStripe = full && PREMIUM_IS_SET;
  const premiumBroken = full && !PREMIUM_IS_SET;
  const premiumHref = premiumToStripe ? STRIPE_PREMIUM_URL : WEBINAR_REGISTER_URL;

  // h-full + items-stretch (grid): both cards take the taller card's height on desktop.
  const cardBase =
    "flex h-full flex-col rounded-2xl border bg-card p-8 shadow-sm";
  // Both paid tiers share one identical blue action (founder: standard + premium
  // CTAs look the same). Free Platform keeps the lighter outline button.
  const paidCta =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30";

  return (
    <>
      {/* Social proof as its OWN section — separated from pricing by a full-width rule so it
          reads as a testimonial rather than the top of the price block. No section eyebrow:
          the "Founder" label is already in the attribution below, so a "From a founder" eyebrow
          would just repeat it. The separator is a BORDER, not a background fill, because
          OffersSection mounts on two different page backgrounds (white /offers + the muted band
          on the program page) — a fill that separates on one would blend on the other. */}
      <section className="border-b border-border px-4 pb-14 lg:pb-16">
        <figure className="container mx-auto max-w-2xl text-center">
          <blockquote className="text-balance text-xl font-medium leading-relaxed tracking-tight text-foreground sm:text-2xl">
            <span className="text-blue-500">&ldquo;</span>Real substance, not surface-level coaching. He opened up new perspectives around communication I hadn&rsquo;t fully seen before.<span className="text-blue-500">&rdquo;</span>
          </blockquote>
          <figcaption className="mt-6 flex items-center justify-center gap-3 text-sm">
            <img
              src="/jan-barbaric.png"
              alt="Jan Barbarič"
              width={44}
              height={44}
              loading="lazy"
              className="h-11 w-11 rounded-full object-cover"
            />
            <span className="text-left">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                Jan Barbarič
                <a
                  href="https://www.linkedin.com/in/janbarbari%C4%8D/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-blue-600 transition-opacity hover:opacity-70"
                  aria-label="Jan Barbarič on LinkedIn (opens in a new tab)"
                >
                  <LinkedinIcon className="h-4 w-4 shrink-0" />
                </a>
              </span>
              <span className="block text-muted-foreground">Co-Founder, Website Gorillas</span>
            </span>
          </figcaption>
        </figure>
      </section>

      <section className={`px-4 pt-14 lg:pt-16 ${className}`}>
        <div className="container mx-auto max-w-4xl">
          <div className="text-center">
            {/* A single "Pricing" label, styled as an eyebrow to match the testimonial's
                "From a founder" label. The price cards below carry the visual weight — that's
                where the eye should land. (Dropped the marketing h2 "Simple, transparent
                pricing": the Free/€950 cards + guarantee band prove transparency better than a
                headline claiming it.) */}
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Pricing
            </h2>
          </div>

        {/* items-stretch + h-full on the cards: founder wants the boxes the same height
            on desktop. The lighter Platform card stretches to match; its CTA stays
            bottom-aligned via mt-auto. /offers shows three tiers, the landing two. */}
        <div
          className={`mt-10 grid grid-cols-1 ${full ? "md:grid-cols-3" : "md:grid-cols-2"} gap-5 sm:gap-6 items-stretch`}
        >
          {/* Platform — free, reassurance (lighter weight) */}
          <div className={`${cardBase} border-border`}>
            <h3 className="text-lg font-bold">Free Platform</h3>
            <p className="mt-4 text-4xl font-bold tracking-tight text-foreground">Free</p>
            <ul className="mt-6 space-y-3">
              {PLATFORM_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link
                to="/signup"
                className="inline-flex h-12 w-full items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                onClick={() => analytics.track("offers_cta_clicked", { tier: "platform", variant })}
              >
                Create a free account
              </Link>
            </div>
          </div>

          {/* Co-Founder Program — featured, the product */}
          <div className={`${cardBase} relative border-2 border-blue-500 shadow-md`}>
            <span className="absolute -top-3 right-6 rounded-full bg-blue-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              Recommended
            </span>
            <h3 className="text-lg font-bold">Standard Program</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">€950</span>
              <span className="text-lg font-semibold text-muted-foreground">/ pair</span>
            </p>
            <ul className="mt-6 space-y-3">
              {PROGRAM_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <PaidCta
                broken={standardBroken}
                href={programHref}
                label={programCtaLabel}
                className={paidCta}
                onClick={() =>
                  analytics.track("offers_cta_clicked", {
                    tier: "program",
                    variant,
                    destination: programDestination,
                  })
                }
              />
            </div>
          </div>

          {/* Co-Founder Program Premium — /pricing only. Anchors the €950 and carries the
              deep "verified understanding" value. The 25% founding promo applies to both
              tiers, so the €950/€2450 ratio (and the anchor) holds at any promo state. */}
          {full && (
            <div className={`${cardBase} border-border`}>
              <h3 className="text-lg font-bold">Premium Program</h3>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight text-foreground">€2450</span>
                <span className="text-lg font-semibold text-muted-foreground">/ pair</span>
              </p>
              <ul className="mt-6 space-y-3">
                {PREMIUM_BULLETS.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <PaidCta
                  broken={premiumBroken}
                  href={premiumHref}
                  label="Reserve your seat"
                  className={paidCta}
                  onClick={() =>
                    analytics.track("offers_cta_clicked", {
                      tier: "premium",
                      variant,
                      destination: premiumToStripe ? "stripe" : "webinar",
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Shared assurance band — the enrollment countdown and the refund guarantee apply
            to BOTH paid programs, so they live once here instead of duplicated per card.
            Full variant only (the landing has no pricing). */}
        {full && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <CohortCountdown />
            <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-3 text-center">
              <ShieldCheckIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                Both programs are risk-free: full refund if it&rsquo;s not for you.
              </p>
            </div>
            <p className="max-w-md text-center text-xs text-muted-foreground/80">
              Prices exclude VAT. VAT is calculated at checkout based on your location;
              EU businesses can enter a VAT ID for reverse charge.
            </p>
          </div>
        )}
      </div>
      </section>
    </>
  );
}

export default OffersSection;
