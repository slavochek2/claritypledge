/**
 * OffersSection — the Clarity Pledge offer ladder (P1087, rebuilt at UAT).
 *
 * THREE cards side by side, one selected: the self-serve Clarity Champions membership
 * (€295/month, highlighted), the Partnership Clarity Package (€1,450, delivered personally
 * on ladischenski.com), and unpriced Custom Offers (call-first via /intro). The three-card
 * shape with consistent CTA buttons is the pattern this page carried before P1087 collapsed
 * it to a single card plus a footnote — restored at founder UAT.
 *
 * The refund guarantee and the VAT note live in a shared band BELOW the grid, not inside
 * the membership card — the same placement the pre-P1087 page used, and the reason it
 * reads as a page-level assurance rather than one card's fine print.
 *
 * The membership CTA fails loud (PaidCta) if the Stripe link is missing/invalid — never
 * silently routes elsewhere, which would be a checkout that looks like it worked but lost
 * the sale invisibly (P954).
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { CheckIcon, ShieldCheckIcon, ArrowRightIcon, LinkedinIcon, UserIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";

/**
 * Stripe subscription Payment Link (P1087/P954). Public URL — a Stripe payment link
 * exposes nothing secret, so it lives as an in-source constant, NOT an env var by default
 * (P954: env-var indirection baked empty strings into the prod bundle and every paid CTA
 * fell to "Checkout temporarily unavailable"). An env var still overrides (test-mode links)
 * when set.
 *
 * This is the LIVE link for price_1U6UwuFXhjM6Ief0bOfULOPg — €295/month recurring EUR,
 * tax_behavior=exclusive, with Stripe automatic tax + VAT-ID collection enabled, redirecting
 * to /signup on completion. Created against the live account at founder request during UAT.
 *
 * Validation is host-pinned, not scheme-only: a config-derived URL that reaches an
 * <a href> must be an actual Stripe checkout link (`.claude/rules/src.md` — User-
 * Controlled URL Sinks; an ad-hoc `startsWith('http')` check does not qualify). A
 * missing/invalid link is a misconfiguration and the CTA FAILS LOUD (disabled notice)
 * rather than silently routing somewhere else.
 */
const STRIPE_MEMBERSHIP_URL =
  import.meta.env.VITE_STRIPE_MEMBERSHIP_URL ?? "https://buy.stripe.com/fZu8wPchH88D9ZFaGo1Jm09";
const isStripeLink = (u: string) => {
  try {
    const parsed = new URL(u);
    // Host-pinned AND protocol-pinned — host alone lets a non-special scheme
    // (`javascript://buy.stripe.com/...`, `data://buy.stripe.com`) parse an authority
    // and pass the host check (code review finding, P1087). `.claude/rules/src.md`
    // requires both checks together.
    return parsed.host === "buy.stripe.com" && parsed.protocol === "https:";
  } catch {
    return false;
  }
};
const MEMBERSHIP_IS_SET = isStripeLink(STRIPE_MEMBERSHIP_URL);

/**
 * What the membership includes. Trimmed at founder UAT to remove every line another part
 * of the page already carries: the month arc above states "practise weekly", "take it to
 * your organization", and "open your Clarity Organization", so those three bullets went;
 * "(3–10 people)" duplicated the batch-size chip under the title; and "Cancel any month"
 * restated the "/ month" on the price line directly above it.
 */
const MEMBERSHIP_BULLETS = [
  "Weekly live practice sessions with your batch",
  "The nine situations every working relationship hits",
  "Partial Clarity Badges on the situations you cover",
  "Practice partners on tap",
  "The standing practice community after month three",
];

const PARTNERSHIP_BULLETS = [
  "Four 1:1 sessions, run personally rather than in a batch",
  "For two people who work together",
  "Booked and delivered on ladischenski.com",
];

const CUSTOM_BULLETS = [
  "Training, coaching, and consulting, shaped around your situation",
  "For a team, a department, or one person",
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
 * Paid-tier action. When `broken` (no valid Stripe link), it FAILS LOUD — a visibly
 * inactive control — instead of silently routing a confident "Start at €295/month" button
 * somewhere else. (P951 adversarial review: silent fallback hid missing-env-var misroutes.)
 *
 * The "Join the next Clarity Experiment to enroll" fallback line that used to sit under
 * this state was cut at founder UAT. The disabled control alone states the fact; the line
 * was an unrelated CTA wearing an error message's clothes.
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
      <span
        aria-disabled="true"
        className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-muted px-6 text-sm font-semibold text-muted-foreground"
      >
        Checkout temporarily unavailable
      </span>
    );
  }
  return (
    <CtaLink href={href} className={className} onClick={onClick}>
      {label}
      <ArrowRightIcon className="h-4 w-4 shrink-0" />
    </CtaLink>
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

function CardBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((b) => (
        <li key={b} className="flex items-start gap-2.5 text-sm">
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span className="text-muted-foreground">{b}</span>
        </li>
      ))}
    </ul>
  );
}

export function OffersSection({ className = "" }: { className?: string }) {
  const membershipHref = STRIPE_MEMBERSHIP_URL;
  const membershipBroken = !MEMBERSHIP_IS_SET;

  // Monitoring (P951/P1087): a broken membership CTA on the live /program page is a
  // missing/invalid Stripe link — a silent revenue outage. Alert on mount so it surfaces
  // on the first prod page load, not after a lost sale. Sentry is prod-only (no-op in dev).
  useEffect(() => {
    if (membershipBroken) {
      Sentry.captureMessage("P1087: Stripe membership payment link unset/invalid on /program", {
        level: "error",
        tags: { source: "offers-section", area: "pricing-checkout" },
      });
    }
  }, [membershipBroken]);

  const cardBase = "flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-7";
  // One primary action on the page — the membership buy button (P955). The other two cards
  // carry the SAME button geometry in a secondary treatment, so the three CTAs line up
  // without competing.
  const primaryCta =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30";
  const secondaryCta =
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

  return (
    <section className={`px-4 ${className}`}>
      <div className="container mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Pricing
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-5 md:grid-cols-3 sm:gap-6">
          {/* ── Selected offer: the self-serve membership ── */}
          <div className={`${cardBase} border-2 border-blue-500 shadow-lg shadow-blue-500/25`}>
            <h3 className="text-lg font-bold">Clarity Champions</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">
                €295<sup className="text-lg font-medium text-muted-foreground">*</sup>
              </span>
              <span className="text-base font-semibold text-muted-foreground">/ month</span>
            </p>
            <CardBullets items={MEMBERSHIP_BULLETS} />
            <div className="mt-auto pt-8">
              <PaidCta
                broken={membershipBroken}
                href={membershipHref}
                label="Start at €295/month"
                className={primaryCta}
                onClick={() =>
                  analytics.track("offers_cta_clicked", {
                    tier: "membership",
                    destination: membershipBroken ? "broken" : "stripe",
                  })
                }
              />
            </div>
          </div>

          {/* ── Partnership Clarity Package — personally delivered, on ladischenski.com ── */}
          <div className={cardBase}>
            <h3 className="text-lg font-bold">Partnership Clarity Package</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground">€1,450</span>
              <span className="text-base font-semibold text-muted-foreground">one-off</span>
            </p>
            <CardBullets items={PARTNERSHIP_BULLETS} />
            <div className="mt-auto pt-8">
              <CtaLink
                href="https://ladischenski.com"
                className={secondaryCta}
                onClick={() =>
                  analytics.track("offers_cta_clicked", { tier: "partnership", destination: "ladischenski" })
                }
              >
                See the package
                <ArrowRightIcon className="h-4 w-4 shrink-0" />
              </CtaLink>
            </div>
          </div>

          {/* ── Custom Offers — unpriced, call-first ── */}
          <div className={cardBase}>
            <h3 className="text-lg font-bold">Custom Offers</h3>
            {/* Same 4xl slot as the two real prices so the three price rows share a
                baseline — but muted, because a word that carries no number should not be
                the heaviest thing in the pricing grid. */}
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-muted-foreground">Custom</span>
            </p>
            <CardBullets items={CUSTOM_BULLETS} />
            <div className="mt-auto pt-8">
              <CtaLink
                href="/intro"
                className={secondaryCta}
                onClick={() =>
                  analytics.track("offers_cta_clicked", { tier: "custom", destination: "intro" })
                }
              >
                Book 15 minutes
                <ArrowRightIcon className="h-4 w-4 shrink-0" />
              </CtaLink>
            </div>
          </div>
        </div>

        {/* ── Shared assurance band, BELOW the grid (pre-P1087 placement, restored at UAT).
            Scoped explicitly to the membership: the €1,450 package checks out on
            ladischenski.com and Custom Offers are quoted, so neither carries this refund. ── */}
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-3 text-center">
            <ShieldCheckIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">
              Clarity Champions is risk-free: try the first two sessions, and if it&rsquo;s not
              for you, full refund on month one.
            </p>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground/80">
            * Price excludes VAT. VAT is calculated at checkout based on your location;
            EU businesses can enter a VAT ID for reverse charge.
          </p>
        </div>
      </div>
    </section>
  );
}

export default OffersSection;
