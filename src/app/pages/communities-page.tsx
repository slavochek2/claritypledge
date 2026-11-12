/**
 * /communities — use-case page for community organizers, the link to send when someone asks
 * "what guidelines should our community have, and why?". Small by design, one message per section:
 * hero (for whom, why) → why members stay quiet → why nobody verifies → reveal a gap, then bridge it →
 * the Group Terms → "learn how it works" (/prepare). Built from the /change-managers pieces.
 * /group-terms redirects here (landing-redirects.ts). Unlisted, share-by-link, like /hospitals.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { UsersIcon } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { analytics } from "@/lib/mixpanel";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { COMMUNITY_CAST } from "@/app/content/exchange-casts";
import { Reveal } from "@/app/components/landing/reveal";
import { GroupTermsSection } from "@/app/components/landing/group-terms-section";
import { SECTION } from "@/app/components/landing/landing-motion";
import { RefSup } from "@/app/components/landing/ref-sup";
import { ReferencesList } from "@/app/components/landing/references-list";
import { WhyNobodyVerifiesSection, type ReasonSource } from "@/app/components/landing/why-nobody-verifies";

const REFERENCES = [
  {
    n: 1,
    label: "Newton (1990), The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)",
    url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf",
  },
  {
    n: 2,
    label: "Camerer, Loewenstein & Weber (1989), The Curse of Knowledge in Economic Settings, Journal of Political Economy",
    url: "https://doi.org/10.1086/261651",
  },
] as const;
const REASON_REF: Partial<Record<ReasonSource, 1 | 2>> = { newton: 1, camerer: 2 };
const cite = (src: ReasonSource) => {
  const n = REASON_REF[src];
  return n ? <RefSup n={n} label={REFERENCES[n - 1].label} /> : null;
};
const COMMUNITY_HIERARCHY_TEXT = "In a group, asking \"did you understand me?\" can feel awkward, or like a challenge.";

const BUTTON = "inline-flex items-center justify-center rounded-md bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all text-base sm:text-lg px-8 sm:px-10 py-4 sm:py-5";
const GRID = "absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20";

export function CommunitiesPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "communities" });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO
          title="Clarity Group Terms for communities"
          description="Make it normal to ask how well your members understand each other. Shared guidelines for any community."
          url="/communities"
        />

        {/* 1. Hero: for whom. One action: learn how it works (/prepare), as the closing does. The why follows in Maya's
            story; "agreeing is not always possible, understanding is" introduces the terms (founder 2026-11-12). */}
        <section className="relative px-4 pt-20 pb-8 lg:pt-28 lg:pb-10">
          <div className={GRID} />
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider sm:tracking-[0.18em]">
              <UsersIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              For community organizers
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Make it normal to ask how well your members <span className="text-blue-500">understand each other</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
              Many members stay quiet because they expect to be misunderstood.
            </p>
            <div className="mt-10 flex justify-center">
              <Link to="/prepare" onClick={() => analytics.track("communities_cta_clicked", { location: "hero" })} className={BUTTON}>
                Learn how it works
              </Link>
            </div>
            <PledgerAvatarStack className="pt-6" />
          </div>
          <ScrollIndicator label="What a member didn't say" targetId="why" className="pt-6" />
        </section>

        {/* 2. Why: people stay quiet because they expect to be misunderstood. */}
        <section id="why" className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
          <HardTruthChat
            variant="they-withheld"
            heading="What a member didn't say at the last meetup."
            contact="Maya"
            subtitle="in your community"
            received="Next month we're changing the meetup format. Any thoughts?"
            honest={`"I don't think it works for newcomers. If I say it, they'll hear me complaining."`}
            sent="Sounds good 👍"
            consequence="2 months later · newcomers stopped coming · nobody said why"
            thoughtTitle="Why didn't Maya say it?"
            thoughtBody={`"I expected to be misunderstood."`}
          />
        </section>

        {/* 3. Why almost nobody verifies (shared). */}
        <WhyNobodyVerifiesSection cite={cite} hierarchyTitle="It feels awkward" hierarchyText={COMMUNITY_HIERARCHY_TEXT} />

        {/* 4. How: reveal a gap in understanding, then bridge it. */}
        <section className={SECTION}>
          <GapExchangeSection cast={COMMUNITY_CAST} />
        </section>

        {/* 5. The terms themselves (shared, byte-identical to /groups/:slug/join). */}
        <GroupTermsSection
          id="terms"
          title={<span className="inline-block text-balance">The terms your members <span className="text-blue-500">agree to</span></span>}
          subtitle="We have different values, interests and opinions, so agreeing is not always possible. Understanding is. You explain back what you heard, and the other person tells you, from 0 to 10, how close you got."
          stamp={false}
        />

        {/* 6. Close: the ask (try them, with one concrete first step), then learn how it works or read the argument. */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className={GRID} />
          <Reveal className="container mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
              Try them at your next <span className="text-blue-500">important meeting</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground text-balance">
              Take the short introduction yourself, then share it with your members.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Link to="/prepare" onClick={() => analytics.track("communities_cta_clicked", { location: "closing" })} className={BUTTON}>
                Learn how it works
              </Link>
              <p className="text-muted-foreground">
                or{" "}
                <Link to="/manifesto" onClick={() => analytics.track("communities_manifesto_clicked")} className="inline-flex items-center min-h-10 text-blue-500 hover:text-blue-600 underline underline-offset-4">
                  read the manifesto
                </Link>
              </p>
            </div>
          </Reveal>
        </section>
        <ReferencesList references={REFERENCES} />
      </div>
    </MotionConfig>
  );
}

export default CommunitiesPage;
