/**
 * Program Page — P916 (founder/buyer-facing, accelerator-distributed)
 *
 * Route: /program (public). Audience: a co-founder PAIR arriving WARM via an
 * accelerator/angel forward — distinct from the coach landing at "/" (P915/P856,
 * which recruits coaches). Sells the co-delivered paid PROGRAM, not the coach
 * partnership. See features/p916_program_delivery_page.md.
 *
 * Phase 1 = static value story (hook + gains + timeline + Apply form). No
 * P918 interactive instrument, no schema, no payment flow — the Apply form IS
 * the WTP/illegibility test. Apply capture = mailto to ops@ (no backend, per spec
 * Non-Goals; swap in a hosted-form URL later for a dashboard).
 *
 * COPY/DESIGN reuse: ladischenski.com (co-founder-audience copy + About two-column)
 * and /presi (the GSAP deck — value-forward "how it works", gain cards, credibility
 * block, the hard-truth typing beat, animated reveals — ported here via framer-motion).
 * Stats are source-verified (lesson #2): every citation resolves AND the wording matches.
 */
import { useState, useRef, useEffect } from "react";
import { SEO } from "@/app/components/seo";
import {
  ShieldCheckIcon,
  ArrowRightIcon,
  CheckIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
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
import { PledgerAvatarStack, ScrollIndicator } from "@/app/components/landing/social-proof";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { OffersSection } from "@/app/components/landing/offers-section";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";
import { formatLocalDateTime } from "@/app/utils/format-time";
import {
  WEBINAR_REGISTER_URL,
  WEBINAR_CTA_LABEL,
  WEBINAR_NEXT_ISO,
} from "@/app/content/webinar";

// ── Source-verified references (lesson #2: citation resolves AND wording matches).
// [1][2] Axios/Radical Candor — assumed-clarity trio. [3] Wasserman 65% co-founder
// conflict. [4][5][6] the three reasons nobody verifies. [7] Kendrick (listed, uncited)
// (verified in coach-partnership-page / research subagent).
const REFERENCES = [
  { n: 1, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 2, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 3, label: "Noam Wasserman, Harvard Business School — 65% of startups fail from co-founder conflict (via Entrepreneur.com)", url: "https://www.entrepreneur.com/leadership/harvard-business-school-professor-says-65-of-startups-fail/370367" },
  { n: 4, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 5, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 6, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 7, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

// Assumed-clarity trio — verbatim from ladischenski/coach sources (refs [1][2]).
// `value` is the headline number; `denom` stays static (always 10).
const ASSUMED_STATS = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 1 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 1 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 2 },
];

// Why almost nobody verifies — the three reasons (verified refs [5][6][7]).
const REASONS_NOBODY_CHECKS = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 4 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 5 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 6 },
];


// PROGRAM_TIMELINE — what actually happens, week by week (the concrete schedule).
// The five-moves "how it works" model now lives in the shared HowPlatformWorks component.
const PROGRAM_TIMELINE = [
  { when: "Week 1", what: "File your first Clarity Letter and join a live video webinar where we answer all your questions. Then write a response to the letter you receive, and exchange them before you meet — so you start from a written, shared baseline instead of assumptions." },
  { when: "Week 2", what: "Meet 5 other participants 1-on-1 and run Clarity sessions live. You leave with your listening calibration measured — you know whether you're over- or under-confident about how well you actually understand each other." },
  { when: "Week 3", what: "A discussion and final live Q&A, with guidance on your own Clarity Partner Agreement — so you leave with an agreement you'll actually use." },
];

// Founder credibility points (first-person, mirrors /presi + ladischenski.com About).
const CRED_POINTS = [
  { text: "Studied why partnerships break — wrote about what I learned", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
  { text: "Published a 60-page research paper on trust-building", link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" },
  { text: "Built ClarityPledge — a platform to practice verified understanding", link: "https://claritypledge.com/manifesto" },
];

// FAQ — co-founder-stage objections, adapted to the program voice from
// ladischenski.com (kept honest to what the program can answer today).
const FAQS = [
  { q: "Do we need to be in conflict first?", a: "No. The best time is before the first real fight — when you can still choose clarity over self-protection." },
  { q: "Can one of us do this alone?", a: "No — the founding cohort is for pairs. Both co-founders take part and you enroll together; the whole method is about verifying that the two of you actually understand each other, which only works with both in the room." },
  { q: "How is this different from therapy?", a: "Therapy explores feelings. The program teaches you a protocol. By the end, you can surface contradictions and close gaps yourselves — that's the point." },
  { q: "What happens after the program?", a: "You keep the process. The Partner Agreement isn't a one-time document — it's a practice. When a new decision comes up, you already know how to check whether you actually agree." },
  { q: "What if it surfaces something we can't fix?", a: "Then you find out now, with two sessions invested, instead of two years and a cap table. Most gaps are bridgeable. The ones that aren't — you needed to know." },
];

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

/**
 * Webinar CTA button (P937) — registers for the free recurring webinar. Internal
 * placeholder URL (/events) renders a router <Link>; a real external link renders an
 * <a>. One label + destination, sourced from content/webinar.ts.
 */
function WebinarCTA({ size = "section" }: { size?: "hero" | "section" }) {
  const sizeClasses =
    size === "hero"
      ? "text-base sm:text-lg lg:text-xl px-6 sm:px-10 lg:px-12 py-4 sm:py-5 lg:py-6"
      : "text-base px-8 py-4";
  const className = `inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${sizeClasses}`;
  const onClick = () => analytics.track("webinar_cta_clicked", { location: size });
  const content = (
    <>
      {WEBINAR_CTA_LABEL}
      <ArrowRightIcon className="w-5 h-5 shrink-0" />
    </>
  );
  return WEBINAR_REGISTER_URL.startsWith("/") ? (
    <Link to={WEBINAR_REGISTER_URL} className={className} onClick={onClick}>
      {content}
    </Link>
  ) : (
    <a href={WEBINAR_REGISTER_URL} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {content}
    </a>
  );
}

/** Next-session line — renders the webinar time in a fixed reference zone (Berlin), with
 *  its DST-correct offset, so everyone reads one canonical time. timeZone 'Europe/Berlin'
 *  + timeZoneName auto-shows GMT+2 (summer) / GMT+1 (winter) as the date advances. */
function WebinarDateLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      Free live webinar · Next session{" "}
      <span className="font-medium text-foreground">
        {formatLocalDateTime(WEBINAR_NEXT_ISO, { timeZone: "Europe/Berlin", timeZoneName: "short" })}
      </span>{" "}
      <span className="whitespace-nowrap">Berlin time</span>
    </p>
  );
}

// P937: the ApplyForm (Web3Forms application instrument) and its hero/section CTAs
// were removed when the landing re-aimed from apply-form → free-webinar registration.
// The funnel now points at the webinar; pricing is shown via <OffersSection>. The
// component + its Web3Forms key remain in git history if the apply model is restored.

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
          title="Clarity Program for Co-Founders"
          url="/"
          description="I've lost co-founders. I help you keep yours. A coached program where co-founder pairs verify they actually understand each other — before they commit."
        />

        {/* ── 1+2. Hero — founder-hook lead (the scar leads, cost demoted to subhead).
            Tight bottom padding (matches /coach) so the social-proof block fits the fold. ── */}
        <section className="relative flex flex-col px-4 pt-24 pb-6 lg:min-h-screen lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center space-y-6 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
            <div className="inline-flex self-center items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em]">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Protecting co-founder relationships
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              I've lost co-founders.
              <br />
              <span className={`inline-block transition-all duration-700 text-blue-500 ${showPromise ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
                I help you keep yours.
              </span>
            </h1>

            <p className={`text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto transition-opacity duration-300 ${showCost ? "opacity-100" : "opacity-0"}`}>
              A co-founder split costs <span className="whitespace-nowrap">€100k–€1M+</span> and years.
              <sup className="ml-0.5 text-[0.6em] font-normal"><a href="#references" className="text-blue-500 hover:text-blue-600">3</a></sup>
            </p>

            <div className="flex flex-col items-center gap-3 pt-6">
              <WebinarCTA size="hero" />
              <WebinarDateLine />
              <p className="text-muted-foreground">
                or{" "}
                <Link to="/sign-pledge" className="text-blue-500 hover:text-blue-600 underline underline-offset-4">Take the Pledge</Link>
              </p>
            </div>

            {/* Social proof + scroll cue (same blocks as the /coach hero). "Free & open
                source" trust line removed: this page sells the paid program, so a free
                signal here misleads buyers and undercuts the paid positioning (decisions
                2026-06-10 falsifier). The FOSS fact still lives in the software-scoped
                line lower on the page. */}
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

        {/* ── 2. The stakes — 65% co-founder conflict (ref 3), count-up on scroll-in ── */}
        <section id="stakes" className="px-4 py-20 lg:py-28 border-t border-border scroll-mt-16">
          <Reveal className="container mx-auto max-w-3xl text-center">
            <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
              <CountUpPercent target={65} />
            </p>
            <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
              of high-potential startups fail from co-founder conflict
              <sup className="ml-0.5 text-[0.6em] font-normal"><a href="#references" className="text-blue-500 hover:text-blue-600">3</a></sup>
            </p>
          </Reveal>
        </section>

        {/* ── 2b. The hard truth nobody says — typed-then-deleted chat (presi beat).
            GENERIC/ANONYMIZED equity scenario — NOT a real person. ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HardTruthChat
            contact="Your Co-Founder"
            received="Let's just lock 50/50 and sort who does what as we go 🙂"
            honest={`"Honestly I assumed 60/40. I'm full-time, you're not yet. Can we nail this down now, not later?"`}
            sent="Sounds good 👍 we'll figure it out."
            consequence="18 months later · €1.2M raised · €50k and 9 months lost in litigation over equity"
            thoughtTitle="Why did you delete this message?"
            thoughtBody={`"If I push on the numbers now, he'll think I don't trust him."`}
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
                    <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{s.ref}</a></sup>
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
                    <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{r.ref}</a></sup>
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

        {/* ── 7b. Protect your partnership — moved up (per founder): the agreement (the
            "role model" artifact) follows the method, before the week-by-week schedule.
            overflow-hidden clips the rotated TEMPLATE watermark, which is wider than a
            narrow mobile viewport and would otherwise add ~9px of horizontal scroll. ── */}
        <section className="px-4 py-20 lg:py-28 border-t border-border overflow-hidden">
          <Reveal className="container mx-auto max-w-3xl">
            <SectionHeader
              title={<>Protect your partnership so it <span className="text-blue-500">survives strong disagreements</span></>}
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
              <TemplateStamp />
            </div>
          </Reveal>
        </section>

        {/* ── 7c. What the program is about — week-by-week schedule (vertical). ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <div className="container mx-auto max-w-5xl">
            <Reveal className="text-center">
              <SectionHeader title={<>What the <span className="text-blue-500">program</span> is about</>} />
              <div className="-mt-10 mb-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 shrink-0 text-blue-500" /> 3 weeks, live
                </span>
                <span className="inline-flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 shrink-0 text-blue-500" /> ~5–6 hours, per person
                </span>
                <span className="inline-flex items-center gap-2">
                  <UsersIcon className="h-4 w-4 shrink-0 text-blue-500" /> a cohort of 5 pairs
                </span>
              </div>
            </Reveal>
            <motion.ol
              className="mx-auto max-w-2xl space-y-4"
              variants={STAGGER_CONTAINER}
              initial="hidden"
              whileInView="show"
              viewport={VIEWPORT_ONCE}
            >
              {PROGRAM_TIMELINE.map((t, i) => (
                <motion.li key={t.when} className="flex gap-4 sm:gap-5" variants={STAGGER_ITEM}>
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    {i < PROGRAM_TIMELINE.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 rounded-xl border border-border bg-card p-5 shadow-sm text-left">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-500">{t.when}</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{t.what}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
          </div>
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

        {/* ── 9. Pricing (P937) — transparent pricing shown BEFORE the closing value beat,
            so the page's final CTA stands alone (not stacked on the price cards). The
            <OffersSection variant="compact"> reuses the /offers component. Muted band keeps
            the section rhythm alternating against the white credibility section above. ── */}
        <section id="offers" className="py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
          <OffersSection variant="compact" />
        </section>

        {/* ── 10. Closing CTA — emotional hook (mirrors /coach's "book" close, adapted to
            the co-founder audience), then the single webinar CTA. The page's last action,
            separated from the pricing above. Faint grid backdrop = same treatment as the
            hero / coach close. ── */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-5xl text-center">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              Your business partner nods.
              <br className="hidden sm:block" />
              <span className="text-blue-500"> But doesn&rsquo;t understand.</span>
            </h2>
            <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-3xl mx-auto">
              Stop before you split.
            </p>
            <div className="flex flex-col items-center gap-3">
              <WebinarCTA size="hero" />
              <WebinarDateLine />
            </div>
          </Reveal>
        </section>

        {/* ── 11. FAQ ── */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <div className="container mx-auto max-w-3xl">
            <Accordion type="single" collapsible>
              {FAQS.map((faq, i) => (
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
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              {REFERENCES.map((r) => (
                <li key={r.n}>
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
