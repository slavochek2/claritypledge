/**
 * /change-leads — P1558. Use-case page for people leading a change (AI rollout, digital
 * transformation, reorganisation). Mirrors /hospitals (P1506): same landing layout, Reveal
 * motion, one primary action and analytics mechanism. Noindex, listed in the Use cases menu.
 *
 * The page's one action, "Book a 15-min discovery call" → /intro, appears in the hero and the
 * closing section; the hero adds the quiet "or Take the Pledge" link, the pledger strip and the
 * scroll cue. No statistics, so no References section. Steps that are not shipped carry a
 * "Being built" badge; the rest carry "Built today".
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon, EyeOffIcon, FlagIcon, MessagesSquareIcon, ShuffleIcon } from "lucide-react";
import { motion, MotionConfig, type Variants } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";

const TITLE = "Everyone agreed. Then nothing changed.";
const DESCRIPTION =
  "Clarity Pledge helps a team find out whether yes in the meeting meant the same thing to everyone, before the change quietly stalls.";

const CAUSES: { icon: typeof EyeOffIcon; title: string; text: string }[] = [
  { icon: ShuffleIcon, title: "Different yeses", text: 'One person heard "try it when you like." Another heard "use it for every report." Both said yes.' },
  { icon: MessagesSquareIcon, title: "Nobody checks", text: 'Asking "what did you understand?" feels awkward, more so across seniority. So nobody asks.' },
  { icon: EyeOffIcon, title: "Silence looks like agreement", text: "Doubts don't get raised in the meeting. They show up later, when people simply don't do it." },
];

type Status = "Built today" | "Being built";
const STEPS: { title: string; status: Status; text: string }[] = [
  { title: "Agree on how you talk.", status: "Built today", text: "The team opts into the Clarity Meeting Principle and the Clarity Group terms. Each person says yes for themselves." },
  { title: "Turn the meeting into points.", status: "Being built", text: "After a meeting, each person's agent helps turn what was said into points, stories and letters." },
  { title: "Answer each other.", status: "Built today", text: "People answer each other's points and letters in Clarity Chat. Gaps surface in writing, not in the hallway." },
  { title: "Disagree openly, even with the rules.", status: "Built today", text: "If someone disagrees with the principle itself, that goes through the same check. Nothing is forced." },
];

const RECORD = [
  "You see your own record: what you said yes to, and what you answered.",
  "The team sees who answered. There is no list of who didn't, and no ranking.",
  "Nobody is enrolled by their manager. People opt in themselves.",
];

const COSTS = [
  { title: "AI rollouts", text: "Licences bought, launch announced. Three months on, a few early adopters use it." },
  { title: "Digital transformation", text: "The new process is signed off. The old spreadsheet is still the one people trust." },
  { title: "Reorganisations", text: "New roles are agreed. Everyone still means something different by them." },
];

const STAGGER_CONTAINER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const STAGGER_ITEM: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
const SECTION = "px-4 py-20 lg:py-28 border-t border-border";

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

/** Small, quiet status badge. "Being built" is outlined so it reads as not-yet. */
function StatusBadge({ status }: { status: Status }) {
  const built = status === "Built today";
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${
        built ? "bg-blue-500/10 border-blue-500/20 text-blue-700" : "bg-transparent border-border text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function PrimaryCTA({ location }: { location: "hero" | "closing" }) {
  return (
    <Link
      to="/intro"
      onClick={() => analytics.track("change_leads_cta_clicked", { location })}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all text-[15px] min-[360px]:text-base sm:text-lg px-5 sm:px-10 py-4 sm:py-5"
    >
      <CalendarIcon className="w-5 h-5 shrink-0" />
      <span className="whitespace-nowrap">Book a 15-min discovery call</span>
    </Link>
  );
}

export function ChangeLeadsPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "change-leads" });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO title={TITLE} description={DESCRIPTION} url="/change-leads" noIndex />

        {/* 1. Hero */}
        <section className="relative px-4 pt-20 pb-8 lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider sm:tracking-[0.18em]">
              <FlagIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              For change, transformation and AI rollout leads
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Everyone agreed. <span className="text-blue-500">Then nothing changed.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
              Clarity Pledge helps a team find out whether &ldquo;yes&rdquo; in the meeting meant the same thing to everyone, before the change quietly stalls.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <PrimaryCTA location="hero" />
              <p className="text-muted-foreground">
                or{" "}
                <Link to="/sign-pledge" onClick={() => analytics.track("change_leads_pledge_clicked")} className="inline-flex items-center min-h-10 text-blue-500 hover:text-blue-600 underline underline-offset-4">
                  Take the Pledge
                </Link>
              </p>
            </div>
            <PledgerAvatarStack className="pt-2" />
          </div>
          <ScrollIndicator label="Why it stalls" targetId="why-it-stalls" className="pt-6" />
        </section>

        {/* 2. Why it stalls */}
        <section id="why-it-stalls" className={`${SECTION} bg-muted/30 scroll-mt-16`}>
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader
                title={<span className="inline-block text-balance">Yes is not the same as <span className="text-blue-500">understood</span></span>}
                subtitle="Everyone agreed to use the new AI assistant. Three weeks later, two people do."
              />
            </Reveal>
            <motion.ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {CAUSES.map((c) => (
                <motion.li key={c.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <c.icon className="w-8 h-8 text-blue-600 mb-3" aria-hidden="true" />
                  <h3 className="text-lg font-bold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* 3. How a yes becomes a follow-through */}
        <section className={SECTION}>
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader title={<span className="inline-block text-balance">How a yes becomes a <span className="text-blue-500">follow-through</span></span>} />
            </Reveal>
            <motion.ol className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {STEPS.map((s, i) => (
                <motion.li key={s.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-5 shadow-sm flex gap-4 text-left">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <h3 className="font-bold">{s.title}</h3>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
            <p className="mt-6 text-sm text-muted-foreground text-center">
              Steps marked &ldquo;Being built&rdquo; are not available yet. Today, teams write points and letters themselves.
            </p>
          </div>
        </section>

        {/* 4. Follow-through you can praise */}
        <section className={`${SECTION} bg-muted/30`}>
          <div className="container mx-auto max-w-3xl">
            <Reveal>
              <SectionHeader title={<span className="inline-block text-balance">Follow-through you can <span className="text-blue-500">praise</span></span>} />
              <div className="flex justify-center -mt-8 mb-8">
                <StatusBadge status="Being built" />
              </div>
            </Reveal>
            <motion.ul className="space-y-3" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {RECORD.map((t) => (
                <motion.li key={t} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm text-left">
                  {t}
                </motion.li>
              ))}
            </motion.ul>
            <p className="mt-8 text-lg font-semibold text-center text-balance">
              Change spreads when people see others following through, not when they&rsquo;re watched.
            </p>
          </div>
        </section>

        {/* 5. Where a stalled yes costs the most */}
        <section className={SECTION}>
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader title={<span className="inline-block text-balance">Where a stalled yes costs the <span className="text-blue-500">most</span></span>} />
            </Reveal>
            <motion.ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {COSTS.map((c) => (
                <motion.li key={c.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </section>

        {/* 6. Closing CTA */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
              Find out what your team&rsquo;s <span className="text-blue-500">yes</span> meant
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground">
              Fifteen minutes on the change you&rsquo;re leading and where it&rsquo;s stuck.
            </p>
            <div className="mt-10 flex justify-center">
              <PrimaryCTA location="closing" />
            </div>
          </Reveal>
        </section>
      </div>
    </MotionConfig>
  );
}

export default ChangeLeadsPage;
