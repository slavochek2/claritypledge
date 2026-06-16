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
 * Two tiers, per-pair pricing:
 *   - Platform — Free (the app; reassurance, lighter weight).
 *   - Co-Founder Program — €950/pair (featured; the product). A live countdown to the
 *     cohort enrollment deadline (CohortCountdown) carries urgency.
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
  WEBINAR_URL_IS_PLACEHOLDER,
  COHORT_ENROLLMENT_CLOSES_ISO,
} from "@/app/content/webinar";

/**
 * [FOUNDER DECISION: Stripe Payment Link URL]. Empty until the founder provisions it.
 * While empty, the program CTA routes to webinar registration (the live path to join)
 * so no fake/broken checkout link ships.
 */
const STRIPE_PAYMENT_URL = "";
const STRIPE_IS_SET = /^https?:\/\//.test(STRIPE_PAYMENT_URL);

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

  // Program CTA: real Stripe link when set, else the webinar (the live path to buy).
  const programHref = STRIPE_IS_SET ? STRIPE_PAYMENT_URL : WEBINAR_REGISTER_URL;
  // Short label so the CTA stays one line in the side-by-side card grid at ~768px.
  const programCtaLabel = STRIPE_IS_SET ? "Join the program" : "Reserve your seat";

  // h-full + items-stretch (grid): both cards take the taller card's height on desktop.
  const cardBase =
    "flex h-full flex-col rounded-2xl border bg-card p-8 shadow-sm";

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
            {/* Orientation line — only on the standalone /offers page, where the visitor
                may not have read the program above. Redundant on the landing (compact). */}
            {full && (
              <p className="mt-3 text-muted-foreground">
                The app is free. The coached program is priced per pair &mdash; you enroll together.
              </p>
            )}
          </div>

        {/* items-stretch + h-full on the cards: founder wants the two boxes the same
            height on desktop. The lighter Platform card stretches to match the program
            card; its CTA stays bottom-aligned via mt-auto. */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-stretch">
          {/* Platform — free, reassurance (lighter weight) */}
          <div className={`${cardBase} border-border`}>
            <h3 className="text-lg font-bold">Platform</h3>
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
              For co-founder pairs
            </span>
            <h3 className="text-lg font-bold">Co-Founder Program</h3>
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
            <CohortCountdown />
            <div className="mt-4 flex items-center justify-center gap-2 text-center">
              <ShieldCheckIcon className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Risk-free: full refund if it&rsquo;s not for you.
              </p>
            </div>
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

        {WEBINAR_URL_IS_PLACEHOLDER && full && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            The founding-cohort price is shared live on the free webinar.
          </p>
        )}
      </div>
      </section>
    </>
  );
}

export default OffersSection;
