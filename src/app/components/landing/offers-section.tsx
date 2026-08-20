/**
 * OffersSection — the Clarity Champions membership offer (P1087, superseding P937/P951's
 * three-card grid).
 *
 * ONE offer, self-serve: €295/month per person, monthly and open-ended, via a Stripe
 * subscription Payment Link. The CTA fails loud (PaidCta) if the link is missing/invalid —
 * never silently routes to the webinar, which would be a checkout that looks like it
 * worked but lost the sale invisibly (P954).
 *
 * Below the offer card, a visibly lighter subordinate band: the free platform (demoted to
 * one line, not removed), Custom Offers (unpriced, call-first via /intro), and a discovery
 * link to /org/cm. One primary action on the page — the membership buy button; everything
 * else here is secondary by design (P955).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { CheckIcon, ShieldCheckIcon, ArrowRightIcon, ClockIcon, LinkedinIcon, UserIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { getCountdownParts } from "@/app/utils/format-time";
import {
  WEBINAR_REGISTER_URL,
  getNextBatchStartISO,
} from "@/app/content/webinar";

/**
 * Stripe subscription Payment Link (P1087/P954). Public URL — a Stripe payment link
 * exposes nothing secret, so it lives as an in-source constant, NOT an env var by default
 * (P954: env-var indirection baked empty strings into the prod bundle and every paid CTA
 * fell to "Checkout temporarily unavailable"). An env var still overrides (test-mode links)
 * when set.
 *
 * NO DEFAULT VALUE YET — the €295/month Stripe subscription link is a prerequisite owed
 * from the Stripe dashboard (spec Risks: "Dashboard action, not agent work"). Until it's
 * set, MEMBERSHIP_IS_SET is correctly false and PaidCta renders its fail-loud state — this
 * is the intended state, not a bug, until the real link is created and hardcoded here.
 *
 * Validation is host-pinned, not scheme-only: a config-derived URL that reaches an
 * <a href> must be an actual Stripe checkout link (`.claude/rules/src.md` — User-
 * Controlled URL Sinks; an ad-hoc `startsWith('http')` check does not qualify). A
 * missing/invalid link is a misconfiguration and the CTA FAILS LOUD (disabled + notice)
 * rather than silently routing to the webinar.
 */
const STRIPE_MEMBERSHIP_URL = import.meta.env.VITE_STRIPE_MEMBERSHIP_URL ?? "";
const isStripeLink = (u: string) => {
  try {
    return new URL(u).host === "buy.stripe.com";
  } catch {
    return false;
  }
};
const MEMBERSHIP_IS_SET = isStripeLink(STRIPE_MEMBERSHIP_URL);

// What's included — settled verbatim in the spec ("confirmed, ship as written").
const MEMBERSHIP_BULLETS = [
  "Weekly live practice sessions with your batch (3–10 people)",
  "The nine situations every working relationship eventually hits, learned by running them",
  "Partial Clarity Badges on the situations you cover",
  "Practice partners on tap, so you always have someone to run a real exchange with",
  "Help taking the practice to people in your own organization",
  "Help opening your Clarity Organization and running your first events",
  "The standing practice community after month three, for as long as you stay",
  "Cancel any month. Full refund of month one if the first two sessions aren't for you",
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
    // Muted/gray, not a dimmed version of the active blue CTA — a lighter blue still
    // reads as "a working button" in a screenshot (visual QA finding on P1087). The
    // design system's own disabled/neutral pattern (bg-muted + text-muted-foreground +
    // border-border, no shadow) is unmistakably inactive at a glance.
    return (
      <div className="text-center">
        <span
          aria-disabled="true"
          className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-muted px-6 text-sm font-semibold text-muted-foreground"
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
 * Live countdown to the next Clarity Champions batch start — recomputed via
 * getNextBatchStartISO on every mount/interval tick, so it is ALWAYS a future instant
 * (P1087; the prior single hardcoded COHORT_ENROLLMENT_CLOSES_ISO rendered a permanent
 * "expired" state once its one fixed deadline passed). Ticks once per second. Urgency is
 * carried by the ticking digits and a blue assurance band — the design system reserves
 * amber/orange/red, so no red "hurry" color is used.
 */
function BatchCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const target = useMemo(() => new Date(getNextBatchStartISO(new Date(now))).getTime(), [now]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(target)) return null;

  const { days, hours, minutes, seconds } = getCountdownParts(target, now);

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
        Next batch starts in
      </div>
      <div
        className="mt-2 flex items-stretch justify-center gap-1.5"
        role="timer"
        aria-label={`Next batch starts in ${days} days, ${hours} hours, ${minutes} minutes`}
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

export function OffersSection({ className = "" }: { className?: string }) {
  const membershipHref = STRIPE_MEMBERSHIP_URL;
  const membershipBroken = !MEMBERSHIP_IS_SET;

  // Monitoring (P951/P1087): a broken membership CTA on the live /program page is a
  // missing/invalid VITE_STRIPE_MEMBERSHIP_URL — a silent revenue outage. Alert on mount
  // so it surfaces on the first prod page load, not after a lost sale. Sentry is
  // prod-only (no-op in dev).
  useEffect(() => {
    if (membershipBroken) {
      Sentry.captureMessage("P1087: Stripe membership payment link unset/invalid on /program", {
        level: "error",
        tags: { source: "offers-section", area: "pricing-checkout" },
      });
    }
  }, [membershipBroken]);

  const cardBase = "flex flex-col rounded-2xl border bg-card p-8 shadow-sm";
  const paidCta =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30";

  return (
    <>
      {/* Social proof as its OWN section — separated from pricing by a full-width rule so it
          reads as a testimonial rather than the top of the price block. */}
      <section className="border-b border-border px-4 pb-14 lg:pb-16">
        <Testimonials />
      </section>

      <section className={`px-4 pt-14 lg:pt-16 ${className}`}>
        <div className="container mx-auto max-w-4xl">
          {/* P971/P1087: the next-batch-start countdown sits ABOVE the price so the
              upcoming batch frames the offer before the visitor reads the number. */}
          <div className="mb-10 flex justify-center">
            <BatchCountdown />
          </div>
          <div className="text-center">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Pricing
            </h2>
          </div>

          {/* ONE offer — Clarity Champions. No grid, no competing cards (P1087: the prior
              three-card grid had one real product pretending to be three). */}
          <div className={`${cardBase} mx-auto mt-10 max-w-xl border-2 border-blue-500 shadow-lg shadow-blue-500/25`}>
            <h3 className="text-lg font-bold">Clarity Champions</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">€295<sup className="text-lg font-medium text-muted-foreground">*</sup></span>
              <span className="text-lg font-semibold text-muted-foreground">/ month</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">monthly, open-ended</p>

            <ul className="mt-6 space-y-3">
              {MEMBERSHIP_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <PaidCta
                broken={membershipBroken}
                href={membershipHref}
                label="Start at €295/month"
                className={paidCta}
                onClick={() =>
                  analytics.track("offers_cta_clicked", { tier: "membership", destination: membershipBroken ? "broken" : "stripe" })
                }
              />
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-3 text-center">
              <ShieldCheckIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                Try the first two sessions. If it&rsquo;s not for you, full refund on month one.
              </p>
            </div>

            {/* Badging add-on — one line, personalized-delivery framing (not "get badged"),
                naming the live ladischenski.com €1,450 price. FCO retainer deliberately NOT
                named here — it would anchor against €295/month in the wrong direction. */}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Want it done with you personally, not in a batch? The{" "}
              <a
                href="https://ladischenski.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Partnership Clarity Package
              </a>
              : four 1:1 sessions for two people, €1,450, on ladischenski.com.
            </p>

            <p className="mt-3 text-center text-xs text-muted-foreground/80">
              * Price excludes VAT. VAT is calculated at checkout based on your location;
              EU businesses can enter a VAT ID for reverse charge.
            </p>
          </div>

          {/* ── Subordinate band, visibly lighter: free platform (demoted, not removed),
              Custom Offers (unpriced, call-first), and a discovery link to the org page.
              Neither competes with the membership CTA above — no full-width primary
              buttons here (P955). ── */}
          <div className="mx-auto mt-12 max-w-xl space-y-8 text-center">
            <Link
              to="/signup"
              className="inline-block text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground"
              onClick={() => analytics.track("offers_cta_clicked", { tier: "platform" })}
            >
              The platform itself is free, always. The membership is for people who want a
              room, not just the tool.
            </Link>

            <div className="rounded-xl border border-border bg-muted/20 p-6 text-left">
              <h3 className="text-sm font-bold text-foreground">Custom Offers</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                For organizations: workshops, training, coaching, or custom setup. Joining
                solo? The membership above is the easier way in.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                A 90-minute introductory workshop for your team, training, coaching, tooling
                customisation, consulting, or help onboarding the colleagues you bring in
                during month two.
              </p>
              <div className="mt-4">
                <CtaLink
                  href="/intro"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  onClick={() => analytics.track("offers_cta_clicked", { tier: "custom", destination: "intro" })}
                >
                  Book 15 minutes
                </CtaLink>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Already a member?{" "}
              <Link to="/org/cm" className="underline hover:text-foreground">
                See what a practice community looks like
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

export default OffersSection;
