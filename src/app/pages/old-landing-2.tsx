/**
 * /founder — the co-founder program landing (P987: the pre-reframe homepage, kept because the
 * co-founder offer is still live; linked from nav as "For co-founders"). Keep `url="/founder"` on
 * the SEO block: this file inherited `url="/"` from its origin at `/`, which would canonicalize this
 * page away. See features/p987_cp_front_door_realignment.md.
 *
 * Since P1674 it renders the fable layout of /builders and /change-managers, without the hero
 * drawing: its story is two co-founders, so the hero is text only, across the full width. Copy is
 * unchanged; "How the platform works" became the gap exchange (it claimed an agent feature that is
 * not built, decisions.md 2026-10-28).
 *
 * Owns what only the live page does: `landing_page_viewed` (variant "old-landing-2", referrer) once
 * on load; the event-aware actions (old-landing-2-webinar.tsx), which send `webinar_cta_clicked`;
 * `founder_exchange_viewed` via FOUNDER_CAST; the invite redirects; SEO. The pledge link stays
 * untracked.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { useInviteRedirects } from "@/app/hooks/useInviteRedirects";
import { useNextWebinar } from "@/app/hooks/useNextWebinar";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { Testimonials } from "@/app/components/landing/offers-section";
import { PROGRAM_FAQS } from "@/app/content/faqs";
import type { EventWithHost } from "@/app/types";
import { FOUNDER_CAST, type Reason, type Reference } from "@/app/components/landing/fable/fable-content";
import { CountUp, OrLink, PercentBar, RefSup } from "@/app/components/landing/fable/fable-parts";
import { CloseSection, ExchangeSection, FableHero, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "@/app/components/landing/fable/fable-sections";
import { AssumedSection, ChatSection, FablePage, FaqSection, IllusionSection, PartnerAgreementSpecimen, PlainSection, type AssumedStat } from "@/app/components/landing/fable/fable-use-case";
import { WebinarCTA, WebinarDateLine } from "./old-landing-2-webinar";

// [1][2] Axios/Radical Candor — assumed-clarity trio. [3] Wasserman 65% co-founder conflict.
// [4][5][6] the three reasons nobody verifies. [7] Kendrick (listed, uncited).
const REFERENCES: Reference[] = [
  { n: 1, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 2, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 3, label: "Noam Wasserman, Harvard Business School — 65% of startups fail from co-founder conflict (via Entrepreneur.com)", url: "https://www.entrepreneur.com/leadership/harvard-business-school-professor-says-65-of-startups-fail/370367" },
  { n: 4, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 5, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 6, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 7, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

const ASSUMED_STATS: AssumedStat[] = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 1 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 1 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 2 },
];

const REASONS: Reason[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", refs: [4] },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", refs: [5] },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", refs: [6] },
];

const WASSERMAN = REFERENCES[2]?.label;

function FounderHero({ nextEvent }: { nextEvent: EventWithHost | null }) {
  return (
    <FableHero
      eyebrow="Protecting co-founder relationships"
      EyebrowIcon={ShieldCheckIcon}
      title={
        <>
          <span className="block">I&apos;ve lost co-founders.</span>{" "}
          <span className="block text-blue-600">I help you keep yours.</span>
        </>
      }
      sub={
        <>
          A co-founder split costs <span className="whitespace-nowrap">€100k–€1M+</span> and years.
          <RefSup n={3} label={WASSERMAN} />
        </>
      }
      actions={
        <>
          <div className="flex flex-col items-start gap-2">
            <WebinarCTA hasEvent={nextEvent !== null} />
            <WebinarDateLine event={nextEvent} />
          </div>
          <OrLink to="/sign-pledge">Take the Pledge</OrLink>
        </>
      }
      nextId="stakes"
      nextLabel="Why it matters"
    />
  );
}

function EquityChat() {
  // GENERIC/ANONYMIZED equity scenario, not a real person. Default variant: the typed-then-deleted beat.
  return (
    <ChatSection>
      <HardTruthChat
        contact="Your Co-Founder"
        received="Let's just lock 50/50 and sort who does what as we go 🙂"
        honest={`"Honestly I assumed 60/40. I'm full-time, you're not yet. Can we nail this down now, not later?"`}
        sent="Sounds good 👍 we'll figure it out."
        consequence="18 months later · €1.2M raised · €50k and 9 months lost in litigation over equity"
        thoughtTitle="Why did you delete this message?"
        thoughtBody={`"If I push on the numbers now, he'll think I don't trust him."`}
      />
    </ChatSection>
  );
}

function FounderClose({ nextEvent }: { nextEvent: EventWithHost | null }) {
  return (
    <CloseSection
      lead="Your co-founder nods. "
      title="And maybe holds back."
      sub="Stop before you split."
      actions={
        <div className="flex flex-col items-start gap-3">
          <WebinarCTA hasEvent={nextEvent !== null} tone="inverse" />
          <WebinarDateLine event={nextEvent} tone="inverse" />
        </div>
      }
    />
  );
}

export function OldLanding2Page() {
  const [searchParams] = useSearchParams();
  // P969: shared with the nav CTA via useNextWebinar, so the hero and the header always agree.
  const { nextEvent } = useNextWebinar();
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
      variant: "old-landing-2",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useInviteRedirects();

  return (
    <FablePage
      seo={
        <SEO
          title="Clarity Program for Co-Founders"
          url="/founder"
          description="I've lost co-founders. I help you keep yours. A coached program where co-founder pairs verify they actually understand each other — before they commit."
        />
      }
    >
      <FounderHero nextEvent={nextEvent} />
      <StakesBand id="stakes" big={<><span className="text-blue-400"><CountUp target={65} /></span>%</>} visual={<PercentBar percent={65} />}>
        of high-potential startups fail from co-founder conflict
        <RefSup n={3} label={WASSERMAN} tone="dark" />
      </StakesBand>
      <EquityChat />
      <AssumedSection index="01" stats={ASSUMED_STATS} references={REFERENCES} />
      <ReasonsSection index="02" reasons={REASONS} references={REFERENCES} muted />
      <IllusionSection index="03" kicker="The root cause">
        <MisunderstandingVenn />
      </IllusionSection>
      <ExchangeSection cast={FOUNDER_CAST} muted />
      <PromiseSection
        index="04"
        title={<>Protect your partnership so it <span className="text-blue-400">survives strong disagreements</span></>}
        specimen={<PartnerAgreementSpecimen />}
      />
      <FounderCredibility />
      <PlainSection>
        <Testimonials />
      </PlainSection>
      <FounderClose nextEvent={nextEvent} />
      <FaqSection faqs={PROGRAM_FAQS} />
      <ReferencesSection references={REFERENCES} />
    </FablePage>
  );
}

export default OldLanding2Page;
