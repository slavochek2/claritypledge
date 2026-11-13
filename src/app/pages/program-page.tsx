/**
 * /hiring — the key-hire landing (P987; re-homed from "/" by P1004). Since P1674 it renders the
 * fable layout of /builders and /change-managers, without the hero drawing: its story is two people
 * (a founder and Katie, the new hire), so the hero is text only, across the full width.
 *
 * Copy is unchanged; P1674 lifts P1004's freeze for style only. Stats are source-verified (lesson
 * #2): every citation resolves AND the wording matches. The stat stays in Leadership IQ's own words
 * ("attitude, not skill"); "Small understanding gaps compound." is the only bridge to the thesis
 * (decisions.md, "the page's thesis smuggled into a stat"). "How the platform works" became the gap
 * exchange (it claimed an agent feature that is not built, decisions.md 2026-10-28).
 *
 * Owns what only the live page does: `landing_page_viewed` (variant "program", referrer from the
 * query) once on load; `alignment_audit_cta_clicked` with location "hero" from BOTH discovery-call
 * buttons (the value the old layout sent, the button size); `hiring_exchange_viewed` via
 * HIRING_CAST; the invite redirects; SEO. The pledge link stays untracked.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { useInviteRedirects } from "@/app/hooks/useInviteRedirects";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { KeyHireCalculator } from "@/app/components/stakes/key-hire-calculator";
import { KEY_HIRE_FAQS } from "@/app/content/faqs";
import { HIRING_CAST, type Reason, type Reference } from "@/app/components/landing/fable/fable-content";
import { CountUp, PercentBar, RefSup } from "@/app/components/landing/fable/fable-parts";
import { CloseSection, ExchangeSection, FableHero, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "@/app/components/landing/fable/fable-sections";
import { AssumedSection, ChatSection, FablePage, FaqSection, IllusionSection, PartnerAgreementSpecimen, type AssumedStat } from "@/app/components/landing/fable/fable-use-case";
import type { FableTracking } from "@/app/components/landing/fable/fable-tracking";

// Ordered by first encounter scrolling the page. BOTH the `n` AND the array position must move
// together: the list prints `r.n` in array order.
const REFERENCES: Reference[] = [
  { n: 1, label: "Gallup — This Fixable Problem Costs U.S. Businesses $1 Trillion (replacement cost: ~200% of salary for leaders and managers)", url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx" },
  { n: 2, label: "Leadership IQ — Why New Hires Fail (Hiring for Attitude study, 5,247 hiring managers / 20,000+ new hires)", url: "https://www.leadershipiq.com/blogs/leadershipiq/35354241-why-new-hires-fail-emotional-intelligence-vs-skills" },
  { n: 3, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 4, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 5, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 6, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 7, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 8, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

const ASSUMED_STATS: AssumedStat[] = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 3 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 3 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 4 },
];

const REASONS: Reason[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", refs: [5] },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", refs: [6] },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", refs: [7, 8] },
];

const label = (n: number) => REFERENCES[n - 1]?.label;

const TRACKING: FableTracking = {
  cta: () => analytics.track("alignment_audit_cta_clicked", { location: "hero" }),
};

function HiringHero() {
  return (
    <FableHero
      eyebrow="Protecting high-stakes relationships"
      EyebrowIcon={ShieldCheckIcon}
      title={
        <>
          <span className="block">Keep the hire you can&apos;t</span>{" "}
          <span className="block text-blue-600">afford to lose.</span>
        </>
      }
      sub={
        <>
          Replacing a key hire costs 2x their annual salary.
          <RefSup n={1} label={label(1)} />
        </>
      }
      nextId="stakes"
      nextLabel="Why it matters"
    />
  );
}

function HiringStakes() {
  return (
    <StakesBand
      id="stakes"
      big={<><span className="text-blue-400"><CountUp target={46} /></span>%</>}
      visual={<PercentBar percent={46} />}
      after={<p className="text-lg italic text-white/70">Small understanding gaps compound.</p>}
    >
      of new hires fail within 18 months. <span className="whitespace-nowrap">9 out of 10</span> of them fail because of attitude, not a lack of technical skills.
      <RefSup n={2} label={label(2)} tone="dark" />
    </StakesBand>
  );
}

function KatieChat() {
  // GENERIC/ANONYMIZED key-hire scenario, not a real person.
  return (
    <ChatSection>
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
    </ChatSection>
  );
}

export function ProgramPage() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
      variant: "program",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useInviteRedirects();

  return (
    <FablePage
      tracking={TRACKING}
      seo={
        <SEO
          title="Keep the Key Hire You Can't Afford to Lose"
          url="/hiring"
          description="A free alignment audit for founders making a key hire: a live 1:1 session that finds the blind spot in how you align with your team. Starts with a 15-min call."
        />
      }
    >
      <HiringHero />
      <HiringStakes />
      <KatieChat />
      <KeyHireCalculator />
      <AssumedSection index="01" stats={ASSUMED_STATS} references={REFERENCES} />
      <ReasonsSection index="02" reasons={REASONS} references={REFERENCES} muted />
      <IllusionSection index="03" kicker="The root cause">
        <MisunderstandingVenn />
      </IllusionSection>
      <ExchangeSection cast={HIRING_CAST} muted />
      <PromiseSection
        index="04"
        title={<>Protect the relationship before your interests <span className="text-blue-400">quietly diverge</span></>}
        specimen={<PartnerAgreementSpecimen />}
      />
      <FounderCredibility />
      <CloseSection lead="Your new hire nods. " title="And maybe holds back." sub="Make hidden misunderstandings easy to reveal and safe to bridge." />
      <FaqSection faqs={KEY_HIRE_FAQS} />
      <ReferencesSection references={REFERENCES} />
    </FablePage>
  );
}

export default ProgramPage;
