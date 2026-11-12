/**
 * /tree/landing-fable-change — the /change-managers page in the landing-fable look (P1667).
 * Design exploration only: the copy, citations and section order are the ones on
 * /change-managers (src/app/pages/change-managers-page.tsx); only the layout changes, plus the
 * labelled hero example (five said yes, one changed). Analytics is left out here and must be
 * carried over if this design replaces the page.
 *
 * The stat stays in IBM's own words: never reword it toward "understanding" (see the comment on
 * the production page). The builders twin is LandingFable.tsx.
 */
import { MotionConfig } from "framer-motion";
import { FlagIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { CHANGE_MANAGERS_OG } from "@/app/content/change-managers-og";
import { AGREED_CHANGE, CHANGE_REASONS, CHANGE_REFERENCES } from "./fable-content";
import { RefSup } from "./fable-parts";
import { CloseSection, ExchangeSection, FableHero, NormSection, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "./fable-sections";

export function LandingFableChange() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO title={CHANGE_MANAGERS_OG.title} description={CHANGE_MANAGERS_OG.description} url="/tree/landing-fable-change" noIndex />
        <FableHero
          eyebrow="For change managers"
          EyebrowIcon={FlagIcon}
          title={
            <>
              <span className="block">Everyone agreed.</span>
              <span className="block text-blue-600">Then nothing changed.</span>
            </>
          }
          sub="AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things."
          example={AGREED_CHANGE}
          nextId="what-nobody-said"
          nextLabel="What nobody said"
        />

        <section id="what-nobody-said" className="scroll-mt-16 border-t border-border bg-muted/40 px-4 py-16 lg:py-28">
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

        <StakesBand
          id="stakes"
          big={<><span className="text-blue-400">59</span>%</>}
          visual={
            <div className="h-14 overflow-hidden rounded-sm border border-white/25" aria-hidden>
              <div className="h-full w-[59%] bg-blue-400" />
            </div>
          }
        >
          of change projects missed at least one objective or failed entirely. The top obstacle was changing mindsets and attitudes, not technology.
          <RefSup n={1} tone="dark" />
        </StakesBand>

        <ReasonsSection index="01" reasons={CHANGE_REASONS} />
        <ExchangeSection muted />
        <PromiseSection index="02" title={<>Make it <span className="text-blue-400">normal</span> to ask how well we understand each other</>} />
        <NormSection index="03" />
        <FounderCredibility />
        <CloseSection title="Reveal gaps in understanding before your rollout stalls" />
        <ReferencesSection references={CHANGE_REFERENCES} />
      </div>
    </MotionConfig>
  );
}
