/**
 * Program Page — P916 (founder/buyer-facing, accelerator-distributed)
 *
 * Route: /program (public). Audience: a co-founder PAIR arriving WARM via an
 * accelerator/angel forward — distinct from the coach landing at "/" (P915/P856,
 * which recruits coaches). Sells the co-delivered paid PROGRAM, not the coach
 * partnership. See features/p916_program_delivery_page.md.
 *
 * Phase 1 = static value story (hook + gains×pains value map + Apply form). No
 * P918 interactive instrument, no schema, no payment flow — the Apply form IS
 * the WTP/illegibility test (can a warm founder name a concrete cost in their
 * own words → the ≥3/10 gate metric). Apply capture = mailto to ops@ (no backend,
 * per spec Non-Goals; swap in a hosted-form URL later for a dashboard).
 *
 * COPY reuse: ladischenski.com (co-founder-audience copy) + cp coach landing
 * COMPONENTS (MisunderstandingVenn, SectionHeader — shared landing modules).
 * Stats are source-verified (lesson #2): every citation resolves AND the page
 * wording matches the source. The value map is a LABELED HYPOTHESIS ("illustrative,
 * not measured") — the vocabulary is the author's until a buyer's words replace it.
 *
 * FOUNDER DECISIONS (program name, price, exact CTA copy, final tagline) are
 * rendered as visible <FounderDecision> placeholders — never silently filled.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import {
  ShieldCheckIcon,
  ArrowRightIcon,
  CheckIcon,
  HeartIcon,
  BrainIcon,
  TargetIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";

const OPS_EMAIL = "ops@claritypledge.com";

// ── Source-verified references (lesson #2: citation resolves AND wording matches).
// [1][2] Axios/Radical Candor — assumed-clarity trio. [3] Wasserman 65% co-founder
// conflict. [4] Gilovich 49→26 comprehension gap. [5][6][7][8] the three reasons
// nobody verifies (verified in coach-partnership-page / research subagent).
const REFERENCES = [
  { n: 1, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 2, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 3, label: "Noam Wasserman, Harvard Business School — 65% of startups fail from co-founder conflict (via Entrepreneur.com)", url: "https://www.entrepreneur.com/leadership/harvard-business-school-professor-says-65-of-startups-fail/370367" },
  { n: 4, label: "Gilovich, Savitsky & Medvec (1998) — The Illusion of Transparency, Journal of Personality and Social Psychology", url: "https://psycnet.apa.org/record/1998-01347-006" },
  { n: 5, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 6, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 7, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 8, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

// Assumed-clarity trio — verbatim from ladischenski/coach sources (refs [1][2]).
const ASSUMED_STATS = [
  { num: "8 / 10", label: "leaders believe they're clear", ref: 1 },
  { num: "5 / 10", label: "employees don't agree their leaders are clear", ref: 1 },
  { num: "6 / 10", label: "employees are afraid to speak up at work", ref: 2 },
];

// Why almost nobody verifies — the three reasons (verified refs [5][6][7]).
const REASONS_NOBODY_CHECKS = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 5 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 6 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 7 },
];

// ── Value map (lean-canvas §UVP, 2026-06-09 founder articulation). 8 gains sorted
// affective → cognitive → validity; 7 pains labeled ILLUSTRATIVE, not measured.
// Ships as a labeled hypothesis — revise the copy from Phase-1 apply-field answers.
const GAIN_LAYERS = [
  {
    layer: "Affective",
    icon: HeartIcon,
    gains: [
      "The safety to be radically honest — because you both know the other knows it too.",
    ],
  },
  {
    layer: "Cognitive",
    icon: BrainIcon,
    gains: [
      "Repair capability in the relationship when it strains — a shared way back.",
      "Trust that the other actually comprehends you, not just nods.",
      "A way to measure and prove how well you each listen — for yourself and to each other.",
      "A transferable skill for every high-stakes relationship that comes after.",
      "Lower friction to follow through, because intent was verified before the commitment.",
    ],
  },
  {
    layer: "Validity",
    icon: TargetIcon,
    gains: [
      "Better coordination and higher-quality decisions.",
      "Understanding you can audit at org scale as you grow.",
    ],
  },
];

const AVOIDED_PAINS = [
  "Flat decisions a bad call can cost €10k+",
  "Daily dissatisfaction and sleepless nights",
  "A broken relationship — a €1M split, even bankruptcy",
  "Trusting advisors who don't actually understand you — weeks or months lost",
  "Team misalignment that surfaces later as rework",
  "Hiding information for fear of honesty — so you decide on less",
  "Never telling a misunderstanding from a real values-difference — a missed sale, partner, or raise",
];

// FAQ — co-founder-stage objections, adapted to the program voice from
// ladischenski.com (kept honest to what the program can answer today).
const FAQS = [
  { q: "Do we need to be in conflict first?", a: "No. The best time is before the first real fight — when you can still choose clarity over self-protection." },
  { q: "What if only one of us wants this?", a: "You can start with one. Often the clearer partner creates enough pull that the other joins — or you learn something important about the partnership itself." },
  { q: "How is this different from therapy?", a: "Therapy explores feelings. The program teaches you a protocol. By the end, you can surface contradictions and close gaps yourselves — that's the point." },
  { q: "What happens after the program?", a: "You keep the process. The Partner Agreement isn't a one-time document — it's a practice. When a new decision comes up, you already know how to check whether you actually agree." },
  { q: "What if it surfaces something we can't fix?", a: "Then you find out now, with two sessions invested, instead of two years and a cap table. Most gaps are bridgeable. The ones that aren't — you needed to know." },
];

/**
 * Visible FOUNDER DECISION placeholder — renders an unmistakable, on-brand
 * (blue, dashed) marker so an un-resolved decision is never silently filled.
 */
function FounderDecision({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-blue-400 bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-700 align-middle">
      FOUNDER DECISION: {children}
    </span>
  );
}

/** Apply CTA button — scrolls to the application form. */
function ApplyCTA({ size = "section" }: { size?: "hero" | "section" }) {
  const sizeClasses = size === "hero" ? "text-xl px-12 py-6" : "text-base px-8 py-4";
  return (
    <a
      href="#apply"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${sizeClasses}`}
    >
      Apply
      <ArrowRightIcon className="w-5 h-5" />
    </a>
  );
}

/**
 * Apply form (the Phase-1 test instrument). Captures who recognizes the
 * split-pain on a warm forward, including the open cost-naming field whose
 * answers ARE the H-WTP-Pain / illegibility gate metric. No backend (spec
 * Non-Goals): submission opens a pre-filled email to ops@.
 */
function ApplyForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const cofounder = String(data.get("cofounder") || "").trim();
    const email = String(data.get("email") || "").trim();
    const cost = String(data.get("cost") || "").trim();

    const subject = "Clarity Program — founding-cohort application";
    const body = [
      `Name: ${name}`,
      `Co-founder: ${cofounder || "—"}`,
      `Contact email: ${email}`,
      "",
      "What is the misunderstanding costing you / your co-founder right now?",
      cost,
    ].join("\n");

    // No backend (Phase 1): open a pre-filled email to ops@.
    // safeLinkHref exception (.claude/rules/src.md): that guard passes only http/https
    // and would reject this mailto. Safe to skip here — the scheme and recipient are
    // hard-coded constants, and every user-typed value goes through encodeURIComponent
    // into the BODY only (newlines, ':', '?', '&' all percent-encoded, so no header or
    // recipient injection is possible).
    window.location.href = `mailto:${OPS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // mailto is fire-and-forget with no success signal — the confirmation copy is honest
    // about "we tried to open your mail app" and always shows the direct-email fallback.
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
          <CheckIcon className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Almost there — send your application</h3>
        <p className="mt-2 text-muted-foreground">
          We tried to open your email app with everything filled in — just press send. If nothing
          opened, email{" "}
          <a href={`mailto:${OPS_EMAIL}`} className="text-blue-500 hover:text-blue-600 underline underline-offset-2">
            {OPS_EMAIL}
          </a>{" "}
          directly with the same details.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-5 text-sm text-blue-500 hover:text-blue-600 underline underline-offset-4"
        >
          Edit the application
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="apply-name" className="mb-1.5 block text-sm font-medium text-foreground">
            Your name
          </label>
          <input
            id="apply-name"
            name="name"
            type="text"
            required
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="apply-cofounder" className="mb-1.5 block text-sm font-medium text-foreground">
            Co-founder's name <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="apply-cofounder"
            name="cofounder"
            type="text"
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label htmlFor="apply-email" className="mb-1.5 block text-sm font-medium text-foreground">
          Contact email
        </label>
        <input
          id="apply-email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="apply-cost" className="mb-1.5 block text-sm font-medium text-foreground">
          What is the misunderstanding costing you / your co-founder right now?
        </label>
        <textarea
          id="apply-cost"
          name="cost"
          required
          rows={4}
          placeholder="In your own words — what does it cost when you and your co-founder think you agree, and don't?"
          className="w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-blue-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-500/30"
      >
        Apply
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Exact CTA wording is a <FounderDecision>exact CTA copy</FounderDecision>
      </p>
    </form>
  );
}

export function ProgramPage() {
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Clarity Program for Co-Founders"
        url="/program"
        description="A co-founder split costs €100k–€1M+ and years. They don't split over conflict — both believe they understand each other, and neither checks. Verify before you commit."
      />

      {/* ── 1+2. Hero — the split, cost first (frozen 2026-06-04 founder cut) ── */}
      <section className="relative px-4 pt-24 pb-16 lg:pt-28 lg:pb-20">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em]">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            Protecting high-stakes partnerships
          </div>

          <div className="text-sm font-medium text-muted-foreground">
            <FounderDecision>program name</FounderDecision>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
            A co-founder split costs <span className="whitespace-nowrap">€100k–€1M+</span> and years.
            <br />
            <span className="text-blue-500">They don't split over conflict — both believe they understand each other, and neither checks.</span>
          </h1>

          <p className="text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto">
            Verify you understand each other — before you commit.
          </p>

          <div className="flex flex-col items-center gap-3 pt-6">
            <ApplyCTA size="hero" />
            <p className="text-xs text-muted-foreground">
              CTA wording: <FounderDecision>exact CTA copy</FounderDecision>
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Why it persists (quantified) ── */}
      {/* The stakes — 65% co-founder conflict (ref 3) */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl text-center">
          <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">65%</p>
          <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
            of high-potential startups fail from co-founder conflict
            <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">3</a></sup>
          </p>
        </div>
      </section>

      {/* The assumption — everyone assumes they understand (refs 1,2) */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader title={<>Everybody <span className="text-blue-500">assumes</span> they understand</>} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {ASSUMED_STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-6 sm:p-8 text-center shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1">
                <div className="text-4xl sm:text-5xl font-bold text-blue-500 tracking-tight">{s.num}</div>
                <p className="text-sm text-muted-foreground mt-3 leading-snug">
                  {s.label}
                  <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{s.ref}</a></sup>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The gap + why nobody verifies — Gilovich 49→26 (ref 4) + 3 cards (refs 5,6,7) */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader title={<>Why almost nobody <span className="text-blue-500">verifies</span> understanding</>} />
          <p className="text-center text-lg lg:text-xl text-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            Speakers think their listeners grasp their meaning <span className="font-bold text-blue-500">49%</span> of the time.
            The actual rate is <span className="font-bold text-blue-500">26%</span>.
            <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">4</a></sup>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left">
            {REASONS_NOBODY_CHECKS.map((r) => (
              <div key={r.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {r.text}
                  <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{r.ref}</a></sup>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Value map (gains × pains) — NEW. Labeled hypothesis. ── */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-5xl">
          <SectionHeader
            title={<>What a verified partnership is <span className="text-blue-500">worth</span></>}
          />
          <p className="-mt-10 mb-12 text-center text-sm text-muted-foreground">
            A value inventory, not a promise. Avoided-cost figures are{" "}
            <span className="font-semibold text-foreground">illustrative, not measured</span> — our words until yours replace them.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Gains — sorted affective → cognitive → validity */}
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
              <h3 className="text-xl font-bold mb-6">What you gain</h3>
              <div className="space-y-7">
                {GAIN_LAYERS.map((group) => (
                  <div key={group.layer}>
                    <div className="flex items-center gap-2 mb-3">
                      <group.icon className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.layer}</span>
                    </div>
                    <ul className="space-y-2.5">
                      {group.gains.map((g) => (
                        <li key={g} className="flex items-start gap-2.5 text-sm leading-relaxed">
                          <CheckIcon className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Pains — avoided cost, illustrative */}
            <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8 shadow-sm">
              <h3 className="text-xl font-bold mb-2">What you avoid</h3>
              <p className="text-xs text-muted-foreground mb-6 italic">Avoided cost — illustrative, not measured.</p>
              <ul className="space-y-3">
                {AVOIDED_PAINS.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. The split made visual — MisunderstandingVenn (v2, fog vs verified) ── */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            The illusion of <span className="text-blue-500">shared understanding</span>
          </h2>
          <MisunderstandingVenn />
        </div>
      </section>

      {/* ── 6. Program structure — ≤2 sentences, co-delivered (generic placeholder) ── */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-3xl text-center">
          <SectionHeader title={<>How the <span className="text-blue-500">program</span> works</>} />
          <p className="text-lg lg:text-xl text-foreground leading-relaxed max-w-2xl mx-auto">
            Two working sessions, co-delivered with a credentialed coach: you learn to surface the
            contradictions in your own beliefs that you can't see alone, and turn your Clarity Partner
            Agreement into a calibration exercise — you prove you understood each other before you sign.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            The co-delivering coach's name and credential are shown once a coach commits.
          </p>
        </div>
      </section>

      {/* ── 7. Founder credibility — the method creator's credential ── */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl">
          <SectionHeader title={<>Built by someone who <span className="text-blue-500">paid for the lesson</span></>} />
          <p className="text-lg text-foreground leading-relaxed mb-8 text-center max-w-2xl mx-auto">
            The method's creator raised €398k, built B2B SaaS for six years across 14 co-founder
            partnerships, and had to close it all down — then spent years studying why smart people with
            great ideas fail together, and published the research.
          </p>
          <ul className="space-y-3 max-w-xl mx-auto">
            {[
              { text: "Studied why partnerships break — and wrote about what it takes", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
              { text: "Published a 60-page research paper on trust-building", link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" },
              { text: "Built ClarityPledge — a platform to practice verified understanding", link: "https://claritypledge.com/manifesto" },
            ].map((item) => (
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
      </section>

      {/* ── 8. Price + risk-free ── */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-2xl text-center">
          <SectionHeader title={<>A founding-cohort <span className="text-blue-500">rate</span></>} />
          <div className="rounded-2xl border border-border bg-card p-8 sm:p-10 shadow-sm">
            <div className="text-4xl font-bold text-foreground mb-2">
              <FounderDecision>pricing</FounderDecision>
            </div>
            <p className="text-muted-foreground mb-6">per founding pair</p>
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <CheckIcon className="h-4 w-4 text-blue-500 shrink-0" />
              <p className="text-sm font-semibold text-foreground">
                Risk-free: a full refund if you're not satisfied after the first session.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Apply CTA — the test ── */}
      <section id="apply" className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
        <div className="container mx-auto max-w-xl">
          <SectionHeader
            title={<>Apply to the <span className="text-blue-500">founding cohort</span></>}
          />
          <p className="-mt-10 mb-10 text-center text-muted-foreground">
            A few founding pairs, chosen by fit. Tell us, in your own words, what the gap is costing you —
            that's the part we read first.
          </p>
          <ApplyForm />
        </div>
      </section>

      {/* ── 10. FAQ ── */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
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

      {/* ── Tagline (Phase 2, to test) — do not hard-pick; FOUNDER DECISION ── */}
      <section className="px-4 py-12 border-t border-border">
        <div className="container mx-auto max-w-2xl text-center">
          <p className="text-sm text-muted-foreground">
            Final tagline (Phase 2, to test): <FounderDecision>final tagline</FounderDecision>
          </p>
        </div>
      </section>

      {/* ── 11. References ── */}
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
          {/* Cross-link to the coach landing (distinct audience, distinct page) */}
          <p className="mt-8 text-sm text-muted-foreground">
            Are you a coach who wants to co-deliver this?{" "}
            <Link to="/" className="text-blue-500 hover:text-blue-600 underline underline-offset-2">
              See the partner page →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default ProgramPage;
