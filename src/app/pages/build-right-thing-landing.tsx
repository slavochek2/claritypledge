/**
 * Build-the-Right-Thing Landing — P1004. Serves "/" (public homepage) for anon visitors.
 *
 * Wedge: H-BuildRightThing — a growing seed–A team keeps building the WRONG things (wrong
 * direction) because they agree on a direction without verifying they meant the same thing
 * by it. NOT slop-as-messy-AI-code (that is the adjacent code-quality lane — do not drift).
 *
 * PARTS BIN: this component starts from `program-page.tsx` (the key-hire landing, now frozen
 * at /hiring) and changes only the wedge-specific surfaces. The spine (assume → why-nobody-
 * verifies → illusion/Venn → how-it-works) is wedge-agnostic and carries over. Shared
 * COMPONENTS (MisunderstandingVenn, HardTruthChat, HowPlatformWorks, CertificateFrame,
 * SectionHeader) import directly. The small presentational helpers (Reveal, RefSup, AuditCTA,
 * stagger consts) are DUPLICATED here rather than extracted — extracting them
 * would edit program-page.tsx, which P1004 freezes ("Do NOT mutate the key-hire ProgramPage").
 * The founder-credibility section is the shared `<FounderCredibility>` component (P1006).
 *
 * COPY marked `FOUNDER DECISION` below is drafted from the spec's guidance and awaits founder
 * review at the UAT gate. Locked copy (hero eyebrow/H1/sub + stat placeholder) is verbatim
 * from the P1004 UI Contract.
 */
import { useState, useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { ShieldCheckIcon, CalendarIcon } from "lucide-react";
import { motion, MotionConfig, type Variants } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";

// ── Source-verified references. P1004 dropped the key-hire-specific citations (Gallup
// 200%-salary and Leadership IQ 46%/attitude — the latter is the blacklisted folklore stat).
// Ref 1 (CB Insights) sources the hero claim + the animated stat block ("no market need" is
// the #1 startup-failure reason). Refs 2,3 = assumed-clarity trio; 4–7 = reasons-nobody-verifies.
// BOTH the `n` AND the array position must move together (see program-page.tsx note).
const REFERENCES = [
  { n: 1, label: "CB Insights — The Top Reasons Startups Fail (no market need: the #1 reason, cited in 35% of post-mortems)", url: "https://www.cbinsights.com/research/startup-failure-reasons-top/" },
  { n: 2, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 3, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 4, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 5, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 6, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 7, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

// Assumed-clarity trio — verbatim from ladischenski/coach sources (refs [2][3] post-renumber).
const ASSUMED_STATS = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 2 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 2 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 3 },
];

// Why almost nobody verifies — the three reasons (refs [4][5][6][7] post-renumber).
const REASONS_NOBODY_CHECKS: { title: string; text: string; ref: number; ref2?: number }[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 4 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 5 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 6, ref2: 7 },
];

// ── Motion (presi port via framer-motion). Duplicated from program-page (see file header).
const STAGGER_CONTAINER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const STAGGER_ITEM: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

/** Fade + rise when scrolled into view, once. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}


/** Citation superscript → the references list. Tap-target padding cancelled by matching
 *  negative margin so the line box never stretches (see program-page.tsx for the full note). */
function RefSup({ n, className = "" }: { n: number | string; className?: string }) {
  return (
    <sup className={`ml-0.5 ${className}`}>
      <a href="#references" className="inline-block px-2 py-5 -mx-2 -my-5 text-blue-500 hover:text-blue-600">
        {n}
      </a>
    </sup>
  );
}

/** Sits under EVERY AuditCTA — carries the 15-minute disclosure so the "audit" CTA never
 *  hides that the click books a call. One constant so copies can't drift. */
const AUDIT_MICROCOPY = "Starts with a 15-min call.";

/** The single primary action on the page (P955): "Book a free alignment audit" → /intro.
 *  P1004 wires the CTA into the P1003 audit funnel by reusing this — /intro is the audit
 *  entry P1003 owns and will reconcile downstream (P1003 not yet built; do not rebuild). */
function AuditCTA({ size = "section" }: { size?: "hero" | "section" }) {
  const sizeClasses =
    size === "hero"
      ? "text-base sm:text-lg lg:text-xl px-6 sm:px-10 lg:px-12 py-4 sm:py-5 lg:py-6"
      : "text-base px-8 py-4";
  const baseClass = `inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${sizeClasses}`;
  const onClick = () => analytics.track("alignment_audit_cta_clicked", { location: size });
  return (
    <Link to="/intro" className={baseClass} onClick={onClick}>
      <CalendarIcon className="w-5 h-5 shrink-0" />
      Book a free alignment audit
    </Link>
  );
}

export function BuildRightThingLanding() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Landing behaviors — this page now serves "/" (key-hire moved to /hiring). Page-view
  // tracking keeps the homepage funnel alive; ?referrer / ?login redirects keep existing
  // pledge-invite links working (carried over from program-page).
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
      variant: "build-right-thing",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (searchParams.get("referrer")) {
      navigate("/sign-pledge");
    } else if (searchParams.get("login")) {
      navigate("/login");
    }
  }, [searchParams, navigate]);

  // Hero reveal (mirrors program-page / coach hero beat): the payoff line unblurs in, then
  // the context subline fades in, then the scroll cue. Plain CSS timers so content always
  // lands at opacity-100 for reduced-motion users.
  const [showPromise, setShowPromise] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [showCue, setShowCue] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setShowPromise(true), 425);
    const t2 = setTimeout(() => setShowCost(true), 1400);
    const t3 = setTimeout(() => setShowCue(true), 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        {/* FOUNDER DECISION — SEO title/description (drafted; awaiting review). url stays "/". */}
        <SEO
          title="Build the Right Thing"
          url="/"
          description="Your team agreed on the strategy. Each of your AIs ships 10x faster. In opposing directions. Get your team off the treadmill. Prevent rework before work begins."
        />

        {/* ── 1. Hero — LOCKED copy (P1004 UI Contract). Eyebrow, H1, sub-line verbatim. ── */}
        <section className="relative flex flex-col px-4 pt-24 pb-6 lg:min-h-screen lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-5xl text-center space-y-6 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
            <div className="inline-flex self-center items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em]">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Prevent rework before work begins
            </div>

            {/* H1: "Your team agreed on the strategy. / Each of your AIs ships 10x faster. / In
                opposing directions." Reframed from the "agreed on the spec / wrong, again" version
                to name the actual failure mode: coordination/misalignment at scale, not output
                quality. Re-verify no overflow at 320/375px after this swap. */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Your team agreed on the strategy.
              <br />
              Each of your AIs ships 10x faster.
              <br />
              <span className={`inline-block text-balance transition-all duration-700 text-blue-500 ${showPromise ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
                In opposing directions.
              </span>
            </h1>

            {/* The promise — an outcome, deliberately NOT the mechanism. Prior copy named the
                cause ("hidden misunderstandings cause costly rework"); buyer research found that
                framing unsellable and "rework" unattested in buyer speech. The market-failure stat
                + ref 1 live solely in the "1 in 3" stakes section below (no hero echo). (P1007) */}
            <p className={`text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto transition-opacity duration-300 ${showCost ? "opacity-100" : "opacity-0"}`}>
              Get your team off the treadmill.
            </p>

            <div className="flex flex-col items-center gap-3 pt-6">
              <AuditCTA size="hero" />
              <p className="text-sm text-muted-foreground">{AUDIT_MICROCOPY}</p>
              <p className="text-muted-foreground">
                or{" "}
                <Link
                  to="/sign-pledge"
                  className="inline-flex items-center min-h-[40px] text-blue-500 hover:text-blue-600 underline underline-offset-4"
                >
                  Take the Pledge
                </Link>
              </p>
            </div>

            <PledgerAvatarStack className="pt-2" />
          </div>
          <ScrollIndicator
            label="Why it matters"
            targetId="stakes"
            className={`pt-2 lg:pt-0 transition-opacity duration-700 ${showCue ? "opacity-100" : "opacity-0"}`}
          />
        </section>

        {/* ── 1b. The stakes — CB Insights stat (ref 1: "no market need" is the #1
            startup-failure reason, ~35% of post-mortems, rendered as "1 in 3"). Sources the
            hero's "nobody wants it" claim one screen below the claim (the /hiring
            hero-claim→stat pattern). ── */}
        <section id="stakes" className="px-4 py-20 lg:py-28 border-t border-border scroll-mt-16">
          <Reveal className="container mx-auto max-w-3xl text-center">
            <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
              1 in 3
            </p>
            <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
              failed startups built something the market never wanted.
              <RefSup n={1} className="text-[0.6em] font-normal" />
            </p>
          </Reveal>
        </section>

        {/* ── 2b. The Seam — HardTruthChat reused, NEW content (P1004: rewrite the dialogue so
            a TEAMMATE held a doubt about the DIRECTION, didn't send it, and built on the guess).
            variant="they-withheld" renders the unsent honest message as a full-bleed strip.
            GENERIC/ANONYMIZED — not a real person. The viewer is the founder/decider.
            FOUNDER DECISION — dialogue drafted from spec guidance; awaiting UAT review. ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HardTruthChat
            variant="they-withheld"
            heading={<>What your team member <span className="text-blue-500">didn't say</span>.</>}
            contact="Maya"
            subtitle="your teammate"
            received="Let's commit to this direction. Trust me, it's the right call 😄"
            honest={`"I don't actually understand why this is the right call. But asking again would make me look like I don't get it. So I'll run with it and hope I guessed right."`}
            sent="Sounds good, on it 👍"
            consequence="3 months later · half the roadmap built on a guess"
            thoughtTitle="Why didn't Maya say it?"
            thoughtBody={`"You sounded sure. Pushing back would've looked like I wasn't on board."`}
          />
        </section>

        {/* ── 4. The assumption — everyone assumes they understand. REUSED as-is (wedge-agnostic,
            refs 1,2 post-renumber). Heading is on-thesis. ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader title={<>Everybody <span className="text-blue-500">assumes</span> they understand</>} />
            </Reveal>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              whileInView="show"
              viewport={VIEWPORT_ONCE}
            >
              {ASSUMED_STATS.map((s) => (
                <motion.div key={s.label} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 sm:p-8 text-center shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1">
                  <div className="text-4xl sm:text-5xl font-bold text-blue-500 tracking-tight tabular-nums">
                    {s.value} / {s.denom}
                  </div>
                  <p className="text-sm text-muted-foreground mt-3 leading-snug">
                    {s.label}
                    <RefSup n={s.ref} />
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── 5. Why almost nobody verifies — 3 cards. REUSED as-is (refs 3–6 post-renumber). ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader title={<>Why almost nobody <span className="text-blue-500">verifies</span> understanding</>} />
            </Reveal>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              whileInView="show"
              viewport={VIEWPORT_ONCE}
            >
              {REASONS_NOBODY_CHECKS.map((r) => (
                <motion.div key={r.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-2">{r.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {r.text}
                    <RefSup n={r.ref} />
                    {r.ref2 && <RefSup n={r.ref2} />}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── 6. The split made visual — MisunderstandingVenn. REUSED as-is (core construct). ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border">
          <Reveal className="container mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">The root cause</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              The illusion of <span className="text-blue-500">shared understanding</span>
            </h2>
            <MisunderstandingVenn />
          </Reveal>
        </section>

        {/* ── 7a. How the platform works — presi's five-moves method. REUSED as-is. ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HowPlatformWorks />
        </section>

        {/* ── 7b. The artifact — Clarity Organization Terms (COA), not the bilateral
            Clarity Partner Agreement. This page's offer scope is the ORG (decisions.md
            2026-07-30 [product]); the buyer entering here is ONE person, who can take a
            single-party oath today without first recruiting a counterparty. The bilateral
            certificate stays on /coach, /founder and /hiring — those pages address pairs.
            Body is the shared VERIFIED_UNDERSTANDING_OATH via COA_VERSIONS, byte-identical
            to /org/:slug/join — never fork the oath copy for marketing.
            The join page's "Accept terms & join" button is deliberately NOT rendered here:
            a live action on a marketing page is a dead control (P955 gate).
            overflow-hidden clips the rotated TEMPLATE watermark on narrow viewports.
            Heading names the SOCIAL COST, which nothing else on this page states outright.
            First person ("I don't understand"), never second: the document's own section is
            MY PROMISE — I disclose MY gap. "You don't understand" is an accusation and inverts
            the artifact. It also closes the loop from the Maya section above ("asking again
            would make me look like I don't get it").
            Deliberately does NOT reuse "reveal": the closing CTA sub-line already reads "Make
            understanding gaps easy to reveal and safe to bridge" — an earlier draft of this
            heading ("Make revealing gaps the norm") echoed it two sections early.
            Also not "Start catching hidden misunderstandings" — that is the closing CTA H2
            verbatim; spending it here spends it before the ask. And not "...before work begins",
            which is the hero eyebrow verbatim. "in your org" dropped: scope is stated twice
            immediately below (certificate title + "A commitment to every member").
            Two lines at desktop is intended — the closing CTA H2 is two lines by design.
            FOUNDER-APPROVED wording. ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border overflow-hidden">
          <Reveal className="container mx-auto max-w-3xl">
            <SectionHeader
              // inline-block + text-balance locally rather than on the shared SectionHeader:
              // the raw wrap split the quoted phrase across lines ("I don't / understand"),
              // and SectionHeader has no className prop — it is also used by /coach and /hiring,
              // which should not inherit a balance change made for this one heading.
              title={<span className="inline-block text-balance">Make it normal to admit <span className="text-blue-500">&ldquo;I don&rsquo;t understand&rdquo;</span></span>}
              // Moved up from the closing CTA, which stated the same idea a third time (H2 ->
              // this line -> button). "Make" is deliberately dropped from the front: the heading
              // above already opens with "Make it normal to...", and two stacked "Make" lines is
              // the same echo this heading was just rewritten to avoid.
              // NOT the COA intro ("...not legally binding...") — that line is pre-acceptance
              // framing for /org/:slug/join, where the reader is about to accept. Nobody accepts
              // anything here; the TEMPLATE watermark and the absent Accept button already mark
              // this as a specimen.
              subtitle="Reveal gaps easily. Bridge them safely."
            />
            <div className="relative">
              <CertificateFrame
                ariaLabel="Clarity Organization Terms"
                title={COA_VERSIONS[CURRENT_COA_VERSION].title}
                kicker="A commitment to every member"
                epigraph="We all crave being understood. Let's commit to listen."
              >
                <CertificateOathBody
                  sections={[
                    COA_VERSIONS[CURRENT_COA_VERSION].yourRight,
                    COA_VERSIONS[CURRENT_COA_VERSION].myPromise,
                    COA_VERSIONS[CURRENT_COA_VERSION].exception,
                  ]}
                />
              </CertificateFrame>
              <TemplateStamp animate />
            </div>
          </Reveal>
        </section>

        {/* ── 8. Founder credibility — full self-contained section (P1006), identical on /,
            /coach, /founder. Replaces the old photo+text inline block; the component owns its
            own chrome + talk clip. ── */}
        <FounderCredibility />

        {/* ── 10. Closing CTA — emotional hook, then the single alignment-audit CTA. REUSED
            mechanism, copy pointed at the build-right-thing wedge (P1007). ── */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-5xl text-center">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              {/* "Fighting the wrong disagreement", not "building wrong features" — field
                  observation: teams say "we're building the wrong thing" OR "THEY are", nobody
                  can adjudicate, so the argument parks and returns. What dissolves is the
                  disagreement that was never real (a30). Deliberately NOT "who's right": the
                  claim is calibration, not accuracy (lean-canvas §active-market-focus). */}
              Stop fighting the wrong disagreement.
              <br className="hidden sm:block" />
              {/* "revealing", not "catching" — catch = I detect YOUR gap (asymmetric, policing);
                  reveal = the gap gets surfaced by the person holding it. Same principle as the
                  section 7b heading, and it makes "reveal" the page's consistent verb. */}
              <span className="text-blue-500"> Start revealing hidden misunderstandings.</span>
            </h2>
            {/* The "understanding gaps ... reveal ... bridge" line moved UP to section 7b, where
                it introduces the artifact. Here it was the third statement of one idea (H2 ->
                line -> button), stacking a fourth text block in front of the CTA. The Stop/Start
                H2 keeps the close; this restated it in mechanism terms. */}
            <div className="mt-12 flex flex-col items-center gap-3">
              <AuditCTA size="hero" />
              <p className="text-sm text-muted-foreground">{AUDIT_MICROCOPY}</p>
            </div>
          </Reveal>
        </section>

        {/* ── 11. References ── */}
        <section id="references" className="px-4 py-10 border-t border-border scroll-mt-16">
          <div className="container mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">References</p>
            <ol className="text-xs text-muted-foreground space-y-1.5">
              {REFERENCES.map((r) => (
                <li key={r.n} className="flex gap-1.5">
                  <span className="shrink-0">{r.n}.</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2">
                    {r.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}

export default BuildRightThingLanding;
