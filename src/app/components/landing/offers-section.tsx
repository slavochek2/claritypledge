/**
 * OffersSection — transparent pricing (P937/P951).
 *
 * `variant="full"` powers /pricing (P951 cut pricing from the landing — the landing's job
 * is the webinar, so OffersSection no longer mounts there). The `compact` variant is kept
 * for a possible future inline mount but has no current caller. Full variant routes both
 * paid CTAs straight to Stripe Payment Links (PaidCta); a missing/invalid link fails loud.
 *
 * Tiers, per-pair pricing:
 *   - Free Platform — €0 (the app; reassurance, lighter weight).
 *   - Standard Program — €950/pair (featured "Recommended"; the product). A live countdown
 *     to the cohort enrollment deadline (CohortCountdown) carries urgency.
 *   - Premium Program — €2450/pair (P951). Personal verification of the 9 stories + Clarity
 *     Badge + guidance on one high-stakes conversation. It anchors the €950 middle tier.
 *
 * The 25% founding discount (both tiers, Stripe promo code) is the WEBINAR-EXCLUSIVE close
 * and is deliberately NOT named here. The discount is contingent on the pair recording a
 * video testimonial — announced verbally at the webinar (not Stripe-enforced; recorded in
 * docs/cofounder-program-facilitator-guide.md). The risk-free guarantee IS public (shared
 * assurance band). Layout adapted from the ladischenski.com pricing grid, rebuilt in cp's
 * design system (semantic tokens, blue actions). See features/p937 + p951.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { CheckIcon, ShieldCheckIcon, ArrowRightIcon, ClockIcon, LinkedinIcon, GithubIcon, UserIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { getCountdownParts } from "@/app/utils/format-time";
import {
  WEBINAR_REGISTER_URL,
  COHORT_ENROLLMENT_CLOSES_ISO,
} from "@/app/content/webinar";

/**
 * Stripe Payment Links (P951/P954). These are PUBLIC URLs — a Stripe payment link exposes
 * nothing secret (the secret key never leaves Stripe), so they live as in-source constants,
 * NOT env vars. P954: the env-var indirection caused a silent prod checkout outage — the
 * links were set in local `.env.local` (gitignored) but never in Vercel's build env, so the
 * deployed bundle baked empty strings and every paid CTA fell to "Checkout temporarily
 * unavailable". Hardcoding removes that "works local, broken prod" failure mode for values
 * that are public by nature. An env var still overrides (test-mode links) when set.
 *
 * The founding discount is a Stripe promotion code (25% off, both tiers) entered at
 * checkout — there is deliberately no app-side discount field.
 *
 * Validation is host-pinned, not scheme-only: a config-derived URL that reaches an
 * <a href> must be an actual Stripe checkout link (`.claude/rules/src.md` — User-
 * Controlled URL Sinks; an ad-hoc `startsWith('http')` check does not qualify). On the
 * full (/pricing) variant a missing/invalid link is a misconfiguration and the CTA
 * FAILS LOUD (disabled + notice) rather than silently routing to the webinar — a webinar
 * that looks like checkout is a broken checkout that loses the sale invisibly.
 */
const STRIPE_STANDARD_URL =
  import.meta.env.VITE_STRIPE_STANDARD_URL ?? "https://buy.stripe.com/aFa28rgxXex14FlaGo1Jm01";
const STRIPE_PREMIUM_URL =
  import.meta.env.VITE_STRIPE_PREMIUM_URL ?? "https://buy.stripe.com/aFafZh2H7ex1go3g0I1Jm00";
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
// "Open-source Platform included" renders as an inheritance label above this list, not
// as a checkmark — scope statements use the label pattern, not the feature checklist.
const PROGRAM_BULLETS = [
  "Live Clarity Experiments — learn the protocol through real interactions, Q&A, and live demos",
  "Async Clarity Letters exchange with your partner",
  "1-on-1 live sessions with your partner — your listening calibration is quantified",
  "Personal guidance on your Clarity Partner Agreement terms",
];

// The five how-it-works moves, expressed as concrete free-platform features
// (will → skill → friction → align → pitfalls). Pledge/badge closes the list as the
// outcome — not the hook — since the how-it-works arc earns it.
const PLATFORM_BULLETS = [
  "Separate a claim's meaning from its validity with stories and points",
  "Cut time and emotional friction with async Clarity Letters",
  "Sign and manage your Clarity Partner Agreements",
  "Transcribe live sessions and track verification progress",
  "Showcase your commitment with a public clarity pledge and badge",
];

// Premium tier (P951): the program PLUS personal verification of the 9 stories
// (issued Clarity Badge) and guidance on one real high-stakes conversation. The lead
// value is "kill the illusion of understanding" — first on the protocol, then on what
// matters most. Shown only on /offers (full variant), where it anchors the €950.
// "Everything in the Standard Program included" renders as an inheritance label above
// this list — same label pattern as Standard's "Open-source Platform included".
const PREMIUM_BULLETS = [
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
            next Clarity Experiment
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

const TESTIMONIALS: {
  quote: string;
  name: string;
  photoUrl?: string;
  linkedinUrl: string;
  role: string;
}[] = [
  {
    quote:
      "Slava’s workshop is an exceptional tool for any founding team focused on long-term alignment. Even for co-founders with a shared vision, mastering the nuances of high-level communication is key to scaling. Slava introduced us to a practical, structured framework where we parsed real business scenarios, actively reflecting and scoring our understanding of each other’s points. It was an incredibly effective calibration exercise that sharpened our daily communication. It’s a masterclass in turning safe alignment into a strategic advantage.",
    name: "Nitzan Mantel",
    linkedinUrl: "https://www.linkedin.com/in/nitzan-mantel-564a381bb/",
    role: "CCO at Stealth Startup",
  },
  {
    quote:
      "Real substance, not surface-level coaching. He opened up new perspectives around communication I hadn’t fully seen before.",
    name: "Jan Barbarič",
    photoUrl: "/jan-barbaric.png",
    linkedinUrl: "https://www.linkedin.com/in/janbarbari%C4%8D/",
    role: "Co-Founder, Website Gorillas",
  },
];

export function Testimonials() {
  return (
    <div className="container mx-auto grid max-w-5xl grid-cols-1 items-start gap-6 sm:grid-cols-2">
      {TESTIMONIALS.map((t) => (
        <figure
          key={t.name}
          className="flex flex-col rounded-2xl border bg-card p-6 text-left shadow-sm sm:p-8"
        >
          <blockquote className="text-pretty text-base font-medium leading-relaxed text-foreground sm:text-lg">
            <span className="text-blue-500">&ldquo;</span>
            {t.quote}
            <span className="text-blue-500">&rdquo;</span>
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3 text-sm">
            {t.photoUrl ? (
              <img
                src={t.photoUrl}
                alt={t.name}
                width={44}
                height={44}
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <UserIcon className="h-6 w-6" />
              </span>
            )}
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                {t.name}
                <a
                  href={t.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex text-blue-600 transition-opacity hover:opacity-70"
                  aria-label={`${t.name} on LinkedIn (opens in a new tab)`}
                >
                  <LinkedinIcon className="h-4 w-4 shrink-0" />
                </a>
              </span>
              <span className="block text-muted-foreground">{t.role}</span>
            </span>
          </figcaption>
        </figure>
      ))}
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
  const programCtaLabel = standardToStripe ? "Reserve your seat" : "Reserve one of 3 spots";
  const programDestination = standardToStripe ? "stripe" : "webinar";

  // Premium CTA (full variant only) — straight to its Stripe link; fails loud if unset.
  const premiumToStripe = full && PREMIUM_IS_SET;
  const premiumBroken = full && !PREMIUM_IS_SET;
  const premiumHref = premiumToStripe ? STRIPE_PREMIUM_URL : WEBINAR_REGISTER_URL;

  // Monitoring (P951 review): a broken paid CTA on the live /pricing page is a missing/
  // invalid VITE_STRIPE_* var — a silent revenue outage. Alert on mount so it surfaces on
  // the first prod page load, not after a lost sale. Sentry is prod-only (no-op in dev).
  useEffect(() => {
    if (standardBroken || premiumBroken) {
      Sentry.captureMessage("P951: Stripe payment link unset/invalid on /pricing", {
        level: "error",
        tags: { source: "offers-section", area: "pricing-checkout" },
        extra: { standardBroken, premiumBroken },
      });
    }
  }, [standardBroken, premiumBroken]);

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
        <Testimonials />
      </section>

      <section className={`px-4 pt-14 lg:pt-16 ${className}`}>
        <div className="container mx-auto max-w-4xl">
          {/* P971: enrollment-deadline countdown sits ABOVE the pricing so the deadline
              creates urgency before the visitor weighs the price. Full variant only — the
              landing (compact) has no pricing cards, so it must not show the countdown. */}
          {full && (
            <div className="mb-10 flex justify-center">
              <CohortCountdown />
            </div>
          )}
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
            <h3 className="text-lg font-bold">Platform</h3>
            <p className="mt-4 text-4xl font-bold tracking-tight text-foreground">Free</p>
            <div className="mt-6">
              <a
                href="https://github.com/slavochek2/claritypledge"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-500/15"
              >
                <GithubIcon className="h-3.5 w-3.5 shrink-0" />
                Open source
              </a>
            </div>
            <ul className="mt-4 space-y-3">
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
          <div className={`${cardBase} relative border-2 border-blue-500 shadow-lg shadow-blue-500/25`}>
            <span className="absolute -top-3 right-6 rounded-full bg-blue-500 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              Recommended
            </span>
            <h3 className="text-lg font-bold">Standard Program</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">€950<sup className="text-lg font-medium text-muted-foreground">*</sup></span>
              <span className="text-lg font-semibold text-muted-foreground">/ pair</span>
            </p>
            <div className="mt-6">
              <span className="inline-flex items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700">
                Free Platform included
              </span>
            </div>
            <ul className="mt-4 space-y-3">
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
                <span className="text-4xl font-bold tracking-tight text-foreground">€2450<sup className="text-lg font-medium text-muted-foreground">*</sup></span>
                <span className="text-lg font-semibold text-muted-foreground">/ pair</span>
              </p>
              <div className="mt-6">
                <span className="inline-flex items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  Standard Program included
                </span>
              </div>
              <ul className="mt-4 space-y-3">
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

        {/* Shared assurance band — the refund guarantee + VAT note apply to BOTH paid
            programs, so they live once here instead of duplicated per card. The enrollment
            countdown moved ABOVE the cards (P971) so the deadline frames the price.
            Full variant only (the landing has no pricing). */}
        {full && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="max-w-md text-center text-xs text-muted-foreground/80">
              * Prices exclude VAT. VAT is calculated at checkout based on your location;
              EU businesses can enter a VAT ID for reverse charge.
            </p>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-3 text-center">
              <ShieldCheckIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                Both programs are risk-free: full refund if it&rsquo;s not for you.
              </p>
            </div>
          </div>
        )}
      </div>
      </section>
    </>
  );
}

export default OffersSection;
