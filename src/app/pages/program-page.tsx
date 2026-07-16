/**
 * Program Page — reframed at P987 to the key-hire wedge (was P916 co-founder pitch).
 *
 * Route: "/" (public homepage). Audience: a seed–A founder with a live key hire —
 * the documented sharpest trigger of H-FounderWince. The pre-reframe co-founder
 * version now serves the still-live co-founder offer at /founder. See
 * features/p987_cp_front_door_realignment.md.
 *
 * COPY/DESIGN reuse: ladischenski.com (audience copy + About two-column) and /presi
 * (the GSAP deck — value-forward "how it works", gain cards, credibility block, the
 * hard-truth typing beat, animated reveals — ported here via framer-motion).
 * Stats are source-verified (lesson #2): every citation resolves AND the wording matches.
 */
import { useState, useRef, useEffect } from "react";
import { SEO } from "@/app/components/seo";
import {
  ShieldCheckIcon,
  CalendarIcon,
  CheckIcon,
} from "lucide-react";
import { motion, useInView, useReducedMotion, animate, MotionConfig, type Variants } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { AgreementCertificate } from "@/app/components/agreements/agreement-certificate";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { CURRENT_AGREEMENT_VERSION } from "@/app/content/agreement-versions";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";
import { KeyHireCalculator } from "@/app/components/stakes/key-hire-calculator";

// ── Source-verified references (lesson #2: citation resolves AND wording matches).
// Ordered by first encounter scrolling the page: [1] Gallup 200%-of-salary stat (now the
// HERO sub — it moved up when the stakes section's 200% count-up was removed, which is
// why Gallup precedes Leadership IQ), [2] Leadership IQ 46% stat (the stakes section),
// [3][4] Axios/Radical Candor assumed-clarity trio, [5][6][7] the three reasons nobody
// verifies — the social-norm card carries both [7] (the delay itself) and [8] (Kendrick,
// the delayed-other-initiation finding).
//
// BOTH the `n` AND the array position must move together: the list below renders in array
// order but prints `r.n`, so renumbering one without the other silently prints "2." above
// "1." while every <sup> still resolves. Re-check this whenever a cited stat changes place.
const REFERENCES = [
  { n: 1, label: "Gallup — This Fixable Problem Costs U.S. Businesses $1 Trillion (replacement cost: ~200% of salary for leaders and managers)", url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx" },
  { n: 2, label: "Leadership IQ — Why New Hires Fail (Hiring for Attitude study, 5,247 hiring managers / 20,000+ new hires)", url: "https://www.leadershipiq.com/blogs/leadershipiq/35354241-why-new-hires-fail-emotional-intelligence-vs-skills" },
  { n: 3, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 4, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 5, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 6, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 7, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 8, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

// Assumed-clarity trio — verbatim from ladischenski/coach sources (refs [3][4]).
// `value` is the headline number; `denom` stays static (always 10).
const ASSUMED_STATS = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 3 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 3 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 4 },
];

// Why almost nobody verifies — the three reasons (verified refs [5][6][7]).
const REASONS_NOBODY_CHECKS: { title: string; text: string; ref: number; ref2?: number }[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 5 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 6 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 7, ref2: 8 },
];


// Founder credibility points (first-person, mirrors /presi + ladischenski.com About).
const CRED_POINTS = [
  { text: "Studied why partnerships break — wrote about what I learned", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
  { text: "Published a 60-page research paper on trust-building", link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" },
  { text: "Built ClarityPledge — a platform to practice verified understanding", link: "https://claritypledge.com/manifesto" },
];

import { KEY_HIRE_FAQS } from "@/app/content/faqs";

// ── Motion (presi "animate meaning, not chrome" port via framer-motion).
// MotionConfig reducedMotion="user" (set on the page root) auto-drops transform
// animation for reduced-motion users while keeping opacity — content always lands.
const STAGGER_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};
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

/** Count-up for the headline stat (presi countUp port): 0 → target on scroll-in. */
function CountUpPercent({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return <span ref={ref}>{val}%</span>;
}

/**
 * Count-up for the inline €Nk stat (presi moneyUp port): €0k → €Nk on scroll-in.
 * Overlays the animating value on an invisible copy of the final value in the same
 * grid cell, so the surrounding sentence reserves the final width and never reflows
 * mid-count ("zittern"). tabular-nums keeps digit widths stable as they change.
 */
function CountUpMoney({ target, className }: { target: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return (
    <span ref={ref} className={`inline-grid tabular-nums ${className ?? ""}`}>
      <span className="col-start-1 row-start-1 text-left">€{val}k</span>
      <span aria-hidden className="col-start-1 row-start-1 invisible">€{target}k</span>
    </span>
  );
}

/** Citation superscript → the references list. Five near-identical copies existed inline;
 *  hoisted so the tap-target padding below lands on all of them at once.
 *
 *  The <a> takes padding with matching negative margin: the hit area grows (measured
 *  13x4px before — unhittable on a phone) while the line box is unchanged. It does NOT
 *  reach the visual-QA checklist's 40px, and cannot: a 40px-tall superscript would wreck
 *  the paragraph's line height. Deliberate partial. Adjacent sups (ref + ref2) overlap
 *  hit areas by design — both target #references, so whichever wins is the same link. */
function RefSup({ n, className = "" }: { n: number | string; className?: string }) {
  return (
    <sup className={`ml-0.5 ${className}`}>
      {/* Tap target: Tailwind's preflight sets `line-height: 0` on sub/sup by design (to stop
          them stretching the line), so this anchor's CONTENT box is 0px tall and its height is
          padding alone — `py-2` yielded exactly 16px, under the 40px in visual-qa.md. `py-5`
          buys the 40; the matching `-my-5` is what keeps it free: the negative margin cancels
          the padding, so the margin box stays 0px tall and the line box never sees it
          (measured: the stakes paragraph is 74.25px before and after). The two MUST move
          together — raising py without my would re-introduce the exact line-stretch preflight
          exists to prevent.
          Horizontal is deliberately NOT widened: at >=px-5 the ref/ref2 pair (refs 7,8, which
          render adjacent with no separator) overlap enough to swallow each other. */}
      <a
        href="#references"
        className="inline-block px-2 py-5 -mx-2 -my-5 text-blue-500 hover:text-blue-600"
      >
        {n}
      </a>
    </sup>
  );
}

/** Sits under EVERY AuditCTA, not just the hero's. It carries the 15-minute disclosure,
 *  so a visitor converting at the bottom of the page must not be shown the button without
 *  it — that is the same broken-promise the bare /intro page used to create. One constant
 *  so the two copies cannot drift. "Free" lives in the CTA label only; repeating it here
 *  is redundant. */
// The gate is the disclosure, and this line IS the gate: the CTA sells an "audit", and
// the reader must learn before clicking that the click books a 15-minute call, not the
// audit. Everything else was redundant with words already on the page — "audit" carries
// gap-finding, and a "call" is self-evidently live and 1:1, so "a live 1:1 session" and
// "we find the blind spot" only restated the CTA. Keep the gate; do not add value-claims
// back. (The audit's format is explained on the call — a reader risking 15 free minutes
// does not need it first.)
const AUDIT_MICROCOPY = "Starts with a 15-min call.";

/** The single primary action on the page (P955): "Book a free alignment audit"
 *  → /intro (interim booking page). Replaces the prior webinar-registration CTA. */
function AuditCTA({ size = "section" }: { size?: "hero" | "section" }) {
  const sizeClasses =
    size === "hero"
      ? "text-base sm:text-lg lg:text-xl px-6 sm:px-10 lg:px-12 py-4 sm:py-5 lg:py-6"
      : "text-base px-8 py-4";
  const baseClass = `inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${sizeClasses}`;
  const onClick = () => analytics.track("alignment_audit_cta_clicked", { location: size });

  return (
    <Link to="/intro" className={baseClass} onClick={onClick}>
      {/* Calendar, not an arrow, and leading — the same icon in the same position as the
          nav's CTA, which is the same action to the same route. It also carries meaning an
          arrow cannot: an arrow says "this goes somewhere", a calendar says "this opens a
          booking". That matters here because AUDIT_MICROCOPY is now just "Starts with a
          15-min call." — the icon is the second place a reader learns the click books a
          call rather than delivering the audit. */}
      <CalendarIcon className="w-5 h-5 shrink-0" />
      Book a free alignment audit
    </Link>
  );
}

// P937: the ApplyForm (Web3Forms application instrument) and its hero/section CTAs
// were removed when the landing re-aimed from apply-form → free-webinar registration.
// P987 removed the webinar CTA in turn — the funnel now points at the alignment-audit
// CTA (AuditCTA → /intro); pricing is shown via <OffersSection>. Both prior components
// + their config remain in git history if either model is restored.

export function ProgramPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Landing behaviors — this page now serves "/" (the coach landing moved to /coach).
  // Page-view tracking keeps the homepage funnel alive (no landing_page_viewed cliff);
  // ?referrer / ?login auto-redirects keep existing pledge-invite links working.
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
      variant: "program",
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

  // Hero reveal (mirrors the /coach hero beat): the promise line unblurs in, then the
  // cost subhead fades in. Plain CSS transitions like /coach (not framer) — the content
  // always lands at opacity-100 after the timers, so reduced-motion users still read it.
  const [showPromise, setShowPromise] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [showCue, setShowCue] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setShowPromise(true), 425);
    const t2 = setTimeout(() => setShowCost(true), 1400);
    // Scroll cue arrives last — after the headline + cost cascade (matches ladischenski).
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
        <SEO
          title="Keep the Key Hire You Can't Afford to Lose"
          url="/"
          description="A free alignment audit for founders making a key hire: a live 1:1 session that finds the blind spot in how you align with your team. Starts with a 15-min call."
        />

        {/* ── 1+2. Hero — founder-hook lead (the scar leads, cost demoted to subhead).
            Tight bottom padding (matches /coach) so the social-proof block fits the fold. ── */}
        <section className="relative flex flex-col px-4 pt-24 pb-6 lg:min-h-screen lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center space-y-6 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
            <div className="inline-flex self-center items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em]">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Protecting high-stakes relationships
            </div>

            {/* text-4xl (not 5xl) at the base breakpoint keeps the first line "Keep the hire
                you can't" on ONE line at 320px (~273px content width) so the hero stays two
                lines with "afford to lose." as the revealed blue line. "key" is deliberately
                NOT in the visible H1: "Keep the key hire you can't" overflows one line at every
                width (measured 450px vs a 273–328px mobile container), forcing a 3-line hero —
                so "key hire" lives in the SEO <title> for search instead (the visible line
                "the hire you can't afford to lose" already implies a key hire). sm/lg unaffected. */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Keep the hire you can't
              <br />
              <span className={`inline-block transition-all duration-700 text-blue-500 ${showPromise ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
                afford to lose.
              </span>
            </h1>

            {/* The cost, not the mission: a cold visitor gets a number they can feel before
                they get our thesis. The mission line moved to the closing, where a reader
                who has seen the argument can receive it. The 200% count-up that used to
                carry this fact one screen down is gone with it — the fact is claimed once,
                here, and P992 re-earns it below as a personalised figure (hook → payoff). */}
            <p className={`text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto transition-opacity duration-300 ${showCost ? "opacity-100" : "opacity-0"}`}>
              Replacing a key hire costs 2x their annual salary.
              <RefSup n={1} className="text-[0.6em] font-normal" />
            </p>

            <div className="flex flex-col items-center gap-3 pt-6">
              <AuditCTA size="hero" />
              <p className="text-sm text-muted-foreground">{AUDIT_MICROCOPY}</p>
              <p className="text-muted-foreground">
                or{" "}
                {/* inline-flex + min-h-[40px] gives the tap target the 40px the visual-QA
                    checklist requires (it measured 20px). Stays a text link, not a button —
                    P955's single-full-width-primary rule depends on it staying subordinate. */}
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
          {/* Bottom-anchored cue — direct flex child so justify-center centers the hook
              while this pins to the fold's bottom. Arrives last (showCue ~1750ms). */}
          <ScrollIndicator
            label="Why it matters"
            targetId="stakes"
            className={`pt-2 lg:pt-0 transition-opacity duration-700 ${showCue ? "opacity-100" : "opacity-0"}`}
          />
        </section>

        {/* ── 2. The stakes — Leadership IQ 46%/89% (ref 2), count-up on scroll-in.
            Source's own words only ("attitude, not skill"); the bridge to alignment
            lives in surrounding prose, never in the stat itself (decisions.md — "the
            page's thesis smuggled into a stat"). ── */}
        <section id="stakes" className="px-4 py-20 lg:py-28 border-t border-border scroll-mt-16">
          <Reveal className="container mx-auto max-w-3xl text-center">
            <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
              <CountUpPercent target={46} />
            </p>
            <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
              {/* Period, not an em-dash: founder-voice public copy (global no-dash rule), and
                  the second clause carries its own verb ("fail") so it stands as a sentence.
                  `whitespace-nowrap` on the ratio: at 375px it otherwise breaks as "…months. 9 /
                  out of 10…", orphaning the 9 (measured across 320/375/1440 — every wording
                  splits at some width, so the fix is the span, not the words). */}
              of new hires fail within 18 months. <span className="whitespace-nowrap">9 out of 10</span> of them fail because of attitude, not a lack of technical skills.
              <RefSup n={2} className="text-[0.6em] font-normal" />
            </p>
            {/* The bridge from the stat to the thesis, and the only place it may live: the stat
                itself must stay in Leadership IQ's own words ("attitude, not skill"). Editing the
                stat to say "understanding" is the logged "thesis smuggled into a stat" incident
                (decisions.md) — this line is how alignment enters instead. It names the gap as
                one of UNDERSTANDING and stops there; "in your team" is redundant under a stat
                about your new hire, and three words between "gaps" and "compound" kill the beat. */}
            <p className="mt-6 text-sm text-muted-foreground italic">Small understanding gaps compound.</p>
            {/* The 200% count-up beat lived here and now leads the hero instead — stating it
                twice, one screen apart, with the scroll cue pointing at the restatement, made
                the section read as an echo. "Small understanding gaps compound." is deliberately left as the
                section's last word: it closes 46% on its own (small gaps → big failures) and
                is the hand-off P992's calculator lands under, where the multiple becomes a
                figure in the reader's own salary rather than a claim repeated. Do not re-add a
                200% block here — the hero owns that fact now. */}
          </Reveal>
        </section>

        {/* ── 2c. The key-hire calculator — its own section, immediately after the
            stakes bridge line. KeyHireCalculator renders its own <section> wrapper. ── */}
        <KeyHireCalculator />

        {/* ── 2b. What your new hire didn't send you — "The Seam" chat beat (presi
            beat). GENERIC/ANONYMIZED key-hire scenario — NOT a real person. The
            viewer here is the FOUNDER; "Katie" (the new hire) is the one who
            withholds the honest reply. /coach was never a consumer of this
            component (it has its own local copy — verified this session) so
            there is no cross-page constraint. variant="they-withheld" renders
            the unsent honest message as a full-bleed strip that breaks the chat
            wallpaper ("The Seam") rather than a typing indicator that fades to
            nothing — the tell must stay legible at rest, not vanish. ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HardTruthChat
            variant="they-withheld"
            heading="What your new hire didn't send you."
            contact="Katie"
            subtitle="your new Head of Sales"
            received="We're not going after enterprise. Long story — trust me on this one 😄"
            honest={`"I don't get why though. Without the long story I'll just guess — and every decision I make from here is built on my guess."`}
            sent="Got it, I trust you on this 👍"
            consequence="6 months later · half the roadmap built on a guess · the long story took four minutes to explain"
            thoughtTitle="Why didn't Katie send it?"
            thoughtBody={`"You asked me to trust you. Asking again would sound like I don't."`}
          />
        </section>

        {/* ── 4. The assumption — everyone assumes they understand (refs 1,2) ── */}
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

        {/* ── 5. Why almost nobody verifies — 3 cards (refs 4,5,6) ── */}
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

        {/* ── 6. The split made visual — MisunderstandingVenn (v2, fog vs verified) ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border">
          <Reveal className="container mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">The root cause</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              The illusion of <span className="text-blue-500">shared understanding</span>
            </h2>
            <MisunderstandingVenn />
          </Reveal>
        </section>

        {/* ── 7a. How the platform works — presi's five-moves method (shared with /coach). ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HowPlatformWorks />
        </section>

        {/* ── 7b. Protect the hire — moved up (per founder): the agreement (the
            "role model" artifact) follows the method, before the week-by-week schedule.
            Heading reframed key-hire at P987 (was "partnership" — leftover co-founder
            framing flagged in code review). overflow-hidden clips the rotated TEMPLATE
            watermark, which is wider than a narrow mobile viewport and would otherwise
            add ~9px of horizontal scroll. ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border overflow-hidden">
          <Reveal className="container mx-auto max-w-3xl">
            <SectionHeader
              title={<>Protect the relationship before your interests <span className="text-blue-500">quietly diverge</span></>}
            />
            {/* TEMPLATE stamp — same overlay as /coach + /partner-template: without it the
                Einstein/Teresa certificate reads as a real signed agreement. */}
            <div className="relative">
              <AgreementCertificate
                variant="pending"
                agreementVersion={CURRENT_AGREEMENT_VERSION}
                creatorName="Albert Einstein"
                partnerName="Mother Teresa"
              />
              <TemplateStamp animate />
            </div>
          </Reveal>
        </section>

        {/* ── 8. Founder credibility — two-column (photo + big-number), ported from
            ladischenski.com About / presi. First-person, mirrors the hero voice. ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border">
          <Reveal className="container mx-auto max-w-5xl">
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 lg:gap-14 items-center">
              {/* Photo — left-aligned to match the left-aligned text block at every width */}
              <div>
                <img
                  src="/founder-photo.jpg"
                  alt="Vyacheslav Ladischenski, the method's creator"
                  className="h-44 w-44 sm:h-56 sm:w-56 lg:h-60 lg:w-60 rounded-2xl object-cover shadow-md ring-1 ring-border"
                />
              </div>
              {/* Text */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
                  Built by someone who paid for the lesson
                </p>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight mb-6">
                  I've raised <CountUpMoney target={398} className="text-blue-500 align-baseline" />, built B2B SaaS for six years, and had to close it all down.
                </h2>
                <ul className="space-y-3">
                  {CRED_POINTS.map((item) => (
                    <li key={item.text} className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                        <CheckIcon className="h-4 w-4 text-blue-500" />
                      </span>
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-blue-600 underline underline-offset-2 decoration-blue-300">
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Pricing cards intentionally NOT on the landing (P951): the landing's one job is
            the alignment-audit CTA (P987). Pricing lives on /pricing — a direct-link
            surface, not promoted in nav — so cold visitors aren't sent to price-shop
            before the audit frames value. */}

        {/* ── 10. Closing CTA — emotional hook, then the single alignment-audit CTA.
            The page's last action, separated from the pricing above. Faint grid
            backdrop = same treatment as the hero / coach close. ── */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-5xl text-center">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              Your new hire nods.
              <br className="hidden sm:block" />
              <span className="text-blue-500"> And maybe holds back.</span>
            </h2>
            <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-3xl mx-auto">
              Make misalignment easy to reveal and safe to bridge.
            </p>
            <div className="flex flex-col items-center gap-3">
              <AuditCTA size="hero" />
              <p className="text-sm text-muted-foreground">{AUDIT_MICROCOPY}</p>
            </div>
          </Reveal>
        </section>

        {/* ── 11. FAQ ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <div className="container mx-auto max-w-3xl">
            <Accordion type="single" collapsible>
              {KEY_HIRE_FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border">
                  <AccordionTrigger className="text-base font-medium text-left hover:no-underline py-5">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base text-muted-foreground leading-relaxed pb-5">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── 12. References ── */}
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

export default ProgramPage;
