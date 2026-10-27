/**
 * /change-managers — P1558. Use-case page for people leading a change (AI rollout, digital
 * transformation, reorganisation). Built on the /hospitals structure: the why / Group Terms /
 * team-norm sections, the gap exchange, References and Reveal are shared components. Noindex,
 * listed first in the Use cases menu. /change-leads redirects here.
 *
 * The page's one action, "Book a 15-min discovery call" → /intro, appears in the hero and the
 * closing section; the hero adds the quiet "or Take the Pledge" link, the pledger strip and the
 * scroll cue. The stat is Sull et al. 2018 (MIT SMR).
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon, FlagIcon } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { CHANGE_MANAGERS_OG } from "@/app/content/change-managers-og";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { TEAM_CAST } from "@/app/content/exchange-casts";
import { Reveal } from "@/app/components/landing/reveal";
import { RefSup } from "@/app/components/landing/ref-sup";
import { CountUpPercent } from "@/app/components/landing/count-up-percent";
import { ReferencesList } from "@/app/components/landing/references-list";
import { WhyNobodyVerifiesSection, NEUTRAL_HIERARCHY_TEXT, type ReasonSource } from "@/app/components/landing/why-nobody-verifies";
import { GroupTermsSection } from "@/app/components/landing/group-terms-section";
import { TeamNormSection, NEUTRAL_MAINTAIN_TEXT } from "@/app/components/landing/team-norm-section";
import { SECTION, MUTED } from "@/app/components/landing/landing-motion";

// Only the citations this page uses, numbered in reading order. The hospital-specific
// HA Thailand source is not used: the hierarchy reason carries no citation here.
const REFERENCES = [
  {
    n: 1,
    label: "Sull, Sull & Yoder (2018), No One Knows Your Strategy, Not Even Your Top Leaders, MIT Sloan Management Review (4,012 respondents, 124 companies)",
    url: "https://sloanreview.mit.edu/article/no-one-knows-your-strategy-not-even-your-top-leaders/",
  },
  {
    n: 2,
    label: "Newton (1990), The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)",
    url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf",
  },
  {
    n: 3,
    label: "Camerer, Loewenstein & Weber (1989), The Curse of Knowledge in Economic Settings, Journal of Political Economy",
    url: "https://doi.org/10.1086/261651",
  },
] as const;
const REASON_REF: Partial<Record<ReasonSource, 2 | 3>> = { newton: 2, camerer: 3 };

function cite(src: ReasonSource) {
  const n = REASON_REF[src];
  return n ? <RefSup n={n} label={REFERENCES[n - 1].label} /> : null;
}

function PrimaryCTA({ location }: { location: "hero" | "closing" }) {
  return (
    <Link
      to="/intro"
      onClick={() => analytics.track("change_managers_cta_clicked", { location })}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all text-[15px] min-[360px]:text-base sm:text-lg px-5 sm:px-10 py-4 sm:py-5"
    >
      <CalendarIcon className="w-5 h-5 shrink-0" />
      <span className="whitespace-nowrap">Book a 15-min discovery call</span>
    </Link>
  );
}

export function ChangeManagersPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "change-managers" });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO title={CHANGE_MANAGERS_OG.title} description={CHANGE_MANAGERS_OG.description} url="/change-managers" image={CHANGE_MANAGERS_OG.image} noIndex />

        {/* 1. Hero */}
        <section className="relative px-4 pt-20 pb-8 lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider sm:tracking-[0.18em]">
              <FlagIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              For change managers
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
                <Link to="/sign-pledge" onClick={() => analytics.track("change_managers_pledge_clicked")} className="inline-flex items-center min-h-10 text-blue-500 hover:text-blue-600 underline underline-offset-4">
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
            consequence="3 weeks later · the rollout stalled · nobody said why"
            thoughtTitle="Why didn't Marco ask?"
            thoughtBody={`"Everyone else nodded."`}
          />
        </section>

        {/* 2b. The stakes. Wording stays within the source: managers responsible for executing
            strategy, three of their company's priorities (Sull et al. 2018). */}
        <section id="stakes" className={SECTION}>
          <Reveal className="container mx-auto max-w-3xl text-center">
            <div data-testid="stat-card">
              <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
                <CountUpPercent target={28} />
              </p>
              <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
                of executives and middle managers responsible for executing strategy could list three of their company&rsquo;s strategic priorities.<RefSup n={1} label={REFERENCES[0].label} />
              </p>
            </div>
          </Reveal>
        </section>

        {/* 3. Why almost nobody verifies (shared) */}
        <WhyNobodyVerifiesSection cite={cite} hierarchyText={NEUTRAL_HIERARCHY_TEXT} />

        {/* 4. The exchange (shared, neutral cast) */}
        <section className={`${SECTION} ${MUTED}`}>
          <GapExchangeSection cast={TEAM_CAST} />
        </section>

        {/* 5. Group Terms (shared) */}
        <GroupTermsSection />

        {/* 6. How it becomes a team norm (shared) */}
        <TeamNormSection maintainText={NEUTRAL_MAINTAIN_TEXT} muted />

        {/* 7. Founder credibility (shared) */}
        <FounderCredibility />

        {/* 8. Closing CTA */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
              Reveal gaps in understanding <span className="text-blue-500">before your rollout stalls</span>
            </h2>
            <div className="mt-12 flex justify-center">
              <PrimaryCTA location="closing" />
            </div>
          </Reveal>
        </section>

        {/* 9. References */}
        <ReferencesList references={REFERENCES} />
      </div>
    </MotionConfig>
  );
}

export default ChangeManagersPage;
