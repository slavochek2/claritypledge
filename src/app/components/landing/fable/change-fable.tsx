/**
 * The change-managers page in the fable layout (P1667, P1670), rendered live on /change-managers
 * (change-managers-page.tsx, which adds analytics and SEO) and on the dev-only
 * /tree/landing-fable-change prototype (P1671). Copy, citations and section order are the ones
 * /change-managers had; the hero adds the wordless example (five said yes, one changed).
 *
 * The stat stays in IBM's own words: never reword it toward "understanding" (decisions.md, "the
 * page's thesis smuggled into a stat"). The builders twin is builders-fable.tsx.
 */
import { MotionConfig } from "framer-motion";
import { FlagIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ExchangeCast } from "@/app/content/exchange-casts";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { AGREED_CHANGE, CHANGE_REASONS, CHANGE_REFERENCES } from "./fable-content";
import { RefSup } from "./fable-parts";
import { CloseSection, ExchangeSection, FableHero, NormSection, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "./fable-sections";
import { FableTrackingProvider, type FableTracking } from "./fable-tracking";

/** The change-managers page. `seo`, `cast` and `tracking` are the caller's: /change-managers passes its live ones, /tree none. */
export function ChangeFable({ seo, cast, tracking = {} }: { seo: ReactNode; cast: ExchangeCast; tracking?: FableTracking }) {
  return (
    <FableTrackingProvider value={tracking}>
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        {seo}
        <FableHero
          eyebrow="For change managers"
          EyebrowIcon={FlagIcon}
          title={
            <>
              <span className="block">Everyone agreed.</span>{" "}
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
          <RefSup n={1} label={CHANGE_REFERENCES[0]?.label} tone="dark" />
        </StakesBand>

        <ReasonsSection index="01" reasons={CHANGE_REASONS} references={CHANGE_REFERENCES} />
        <ExchangeSection cast={cast} muted />
        <PromiseSection index="02" title={<>Make it <span className="text-blue-400">normal</span> to ask how well we understand each other</>} />
        <NormSection index="03" />
        <FounderCredibility />
        <CloseSection title="Reveal gaps in understanding before your rollout stalls" />
        <ReferencesSection references={CHANGE_REFERENCES} />
      </div>
    </MotionConfig>
    </FableTrackingProvider>
  );
}
