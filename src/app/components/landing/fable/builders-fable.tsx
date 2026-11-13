/**
 * The builders page in the fable layout (P1665, P1667, P1670), rendered live on /builders
 * (build-right-thing-landing.tsx, which adds analytics, the invite redirects and SEO) and on the
 * dev-only /tree/landing-fable prototype (P1671).
 *
 * Against the older /builders layout: the hero carries the wordless example (one sentence, five
 * different builds); "How the platform works" is replaced by the gap exchange and the team-norm
 * path, because that section claimed an agent feature that is not built. Text-argument sections
 * are left-aligned and numbered; dark bands carry the stake and the promise.
 */
import { motion, MotionConfig } from "framer-motion";
import { ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ExchangeCast } from "@/app/content/exchange-casts";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { AGREED_BUILDERS, ASSUMED_STATS, REASONS_NOBODY_CHECKS, REFERENCES, SHELL } from "./fable-content";
import { STAGGER, VIEWPORT_ONCE } from "./fable-motion";
import { DotStat, Indented, RefSup, Reveal, SectionHeading } from "./fable-parts";
import { CloseSection, ExchangeSection, FableHero, NormSection, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "./fable-sections";
import { FableTrackingProvider, type FableTracking } from "./fable-tracking";

function Assumption() {
  return (
    <section className="border-t border-border px-4 py-16 lg:py-28">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index="01" title={<>Everybody <span className="text-blue-600">assumes</span> they understand</>} />
        </Reveal>
        <Indented>
          <motion.ul variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="border-b border-foreground/15">
            {ASSUMED_STATS.map((s) => (
              <DotStat key={s.label} value={s.value} denom={s.denom}>
                {s.label}
                <RefSup n={s.ref} label={REFERENCES[s.ref - 1]?.label} />
              </DotStat>
            ))}
          </motion.ul>
        </Indented>
      </div>
    </section>
  );
}

function RootCause() {
  return (
    <section className="border-t border-border px-4 py-16 lg:py-28">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index="03" kicker="The root cause" title={<>The illusion of <span className="text-blue-600">shared understanding</span></>} />
        </Reveal>
        <Reveal className="mx-auto max-w-4xl text-center">
          <MisunderstandingVenn />
        </Reveal>
      </div>
    </section>
  );
}

/** The builders page. `seo`, `cast` and `tracking` are the caller's: /builders passes its live ones, /tree none. */
export function BuildersFable({ seo, cast, tracking = {} }: { seo: ReactNode; cast: ExchangeCast; tracking?: FableTracking }) {
  return (
    <FableTrackingProvider value={tracking}>
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        {seo}
        {/* Hero copy is LOCKED (the P1004 UI Contract): eyebrow, headline and sub-line verbatim. */}
        <FableHero
          eyebrow="Prevent rework before work begins"
          EyebrowIcon={ShieldCheckIcon}
          title={
            <>
              <span className="block text-foreground/70">Your team agreed on the strategy.</span>{" "}
              <span className="block">Each of your AIs ships 10x faster.</span>{" "}
              <span className="block text-blue-600">In opposing directions.</span>
            </>
          }
          sub="Get your team off the treadmill."
          example={AGREED_BUILDERS}
          nextId="stakes"
          nextLabel="Why it matters"
        />

        <StakesBand
          id="stakes"
          big={<><span className="text-blue-400">1</span> in 3</>}
          visual={
            <div className="flex gap-3" aria-hidden>
              <span className="h-14 flex-1 rounded-sm bg-blue-400" />
              <span className="h-14 flex-1 rounded-sm border border-white/25" />
              <span className="h-14 flex-1 rounded-sm border border-white/25" />
            </div>
          }
        >
          failed startups built something the market never wanted.
          <RefSup n={1} label={REFERENCES[0]?.label} tone="dark" />
        </StakesBand>

        <section className="border-t border-border bg-muted/40 px-4 py-16 lg:py-28">
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

        <Assumption />
        <ReasonsSection index="02" reasons={REASONS_NOBODY_CHECKS} references={REFERENCES} muted />
        <RootCause />
        <ExchangeSection cast={cast} muted />
        <PromiseSection
          index="04"
          // inline-block: the quoted phrase moves to the next line as one unit and is never split after "I".
          title={<>Make it normal to admit <span className="inline-block text-blue-400">&ldquo;I don&rsquo;t understand&rdquo;</span></>}
          sub="Reveal gaps easily. Bridge them safely."
        />
        <NormSection index="05" />
        <FounderCredibility />
        <CloseSection lead="Stop fighting the wrong disagreement." title="Start revealing hidden misunderstandings." />
        <ReferencesSection references={REFERENCES} />
      </div>
    </MotionConfig>
    </FableTrackingProvider>
  );
}
