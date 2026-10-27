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
import { CalendarIcon, FileTextIcon, FlagIcon, LifeBuoyIcon, MessagesSquareIcon } from "lucide-react";
import { motion, MotionConfig, type Variants } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { CHANGE_LEADS_OG } from "@/app/content/change-leads-og";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";


type Status = "Built today" | "Being built";
const GETS: { icon: typeof FileTextIcon; title: string; text: string; status: Status }[] = [
  { icon: MessagesSquareIcon, title: "Check back before you agree", text: "In Clarity Chat, people explain back what they heard before they say yes or no.", status: "Built today" },
  { icon: FileTextIcon, title: "Every important meeting, written down", text: "Transcripts of important meetings land in the team's channel, so the context is always there.", status: "Being built" },
  { icon: LifeBuoyIcon, title: "Help when the team gets stuck", text: "The founder joins when a conversation stalls.", status: "Built today" },
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
        built ? "bg-blue-500/10 border-blue-500/20 text-blue-700" : "bg-transparent border-dashed border-foreground/40 text-foreground/75"
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
        <SEO title={CHANGE_LEADS_OG.title} description={CHANGE_LEADS_OG.description} url="/change-leads" image={CHANGE_LEADS_OG.image} noIndex />

        {/* 1. Hero */}
        <section className="relative px-4 pt-20 pb-8 lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider sm:tracking-[0.18em]">
              <FlagIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              For change leads
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Everyone agreed. <span className="block text-blue-500">Then nothing changed.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
              AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things.
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
          <ScrollIndicator label="What nobody said" targetId="what-nobody-said" className="pt-6" />
        </section>

        {/* 2. HardTruthChat, wrapped as on /hiring */}
        <section id="what-nobody-said" className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
          <HardTruthChat
            variant="they-withheld"
            heading="What your team didn't say in the rollout meeting."
            contact="Marco"
            subtitle="on your team"
            received="From Monday we all use the AI assistant for weekly reports. Any questions?"
            honest={`"I don't see how it fits my reports. If I ask now, it sounds like I'm resisting."`}
            sent="Sounds good 👍"
            consequence="3 weeks later · 2 of 12 people use it · nobody said why"
            thoughtTitle="Why didn't Marco ask?"
            thoughtBody={`"Everyone else nodded."`}
          />
        </section>

        {/* 3. MisunderstandingVenn */}
        <section className="px-4 py-20 lg:py-28 border-t border-border">
          <Reveal className="container mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">The root cause</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
              The illusion of <span className="text-blue-500">shared understanding</span>
            </h2>
            <MisunderstandingVenn />
          </Reveal>
        </section>

        {/* 4. How the platform works */}
        <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
          <HowPlatformWorks />
        </section>

        {/* 5. What your team gets */}
        <section className={SECTION}>
          <div className="container mx-auto max-w-4xl">
            <Reveal>
              <SectionHeader title={<span className="inline-block text-balance">What your team <span className="text-blue-500">gets</span></span>} />
            </Reveal>
            <motion.ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {GETS.map((g) => (
                <motion.li key={g.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <g.icon className="w-8 h-8 text-blue-600 mb-3" aria-hidden="true" />
                  <h3 className="text-lg font-bold mb-2">{g.title}</h3>
                  <div className="mb-2"><StatusBadge status={g.status} /></div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{g.text}</p>
                </motion.li>
              ))}
            </motion.ul>
            <p className="mt-6 text-sm text-foreground/75 text-center text-balance">
              Steps marked &ldquo;Being built&rdquo; are not available yet.
            </p>
          </div>
        </section>

        {/* 6. Founder credibility, shared */}
        <FounderCredibility />

        {/* 7. Closing CTA */}
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
