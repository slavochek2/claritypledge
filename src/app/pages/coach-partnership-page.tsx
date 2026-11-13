/**
 * /coach — the coach-facing landing (P856, P915). Positioning: good advice rejected as disagreement
 * when it was misunderstood; churn is the named consequence, not a promised outcome. Names are canon:
 * Clarity Letter, Clarity Session, Clarity Partner Agreement.
 *
 * Since P1674 it renders the fable layout of /builders and /change-managers, with the hero
 * drawing, drawn with two people (a coach and a client). Copy
 * and section order are unchanged. The page keeps its own chat and Venn (coach-partnership-chat.tsx,
 * coach-partnership-venn.tsx), restyled in place. "How the platform works" became the gap exchange
 * (it claimed an agent feature that is not built, decisions.md 2026-10-28), keeping its #how anchor.
 *
 * Owns: `landing_page_viewed` (referrer from the query, no variant) once on load;
 * `coach_exchange_viewed` via COACH_CAST; the invite redirects; SEO. The discovery-call buttons and
 * the pledge links stay untracked, as before. The hero's scroll cue is the untargeted arrow.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { BriefcaseIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { useInviteRedirects } from "@/app/hooks/useInviteRedirects";
import { SectionHeader } from "@/app/components/landing/section-header";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { AGREED_COACH, COACH_CAST, type Reason, type Reference } from "@/app/components/landing/fable/fable-content";
import { AuditCTA, OrLink } from "@/app/components/landing/fable/fable-parts";
import { CloseSection, ExchangeSection, FableHero, PromiseSection, ReasonsSection, ReferencesSection } from "@/app/components/landing/fable/fable-sections";
import { AssumedSection, ChatSection, FablePage, FaqSection, IllusionSection, PartnerAgreementSpecimen, type AssumedStat } from "@/app/components/landing/fable/fable-use-case";
import { CoachHardTruthChat } from "./coach-partnership-chat";
import { CoachMisunderstandingVenn } from "./coach-partnership-venn";

// Every entry verified to resolve. Wording audited against sources: "don't agree their leaders are
// clear" is what Axios HQ actually reports (not "don't understand").
const REFERENCES: Reference[] = [
  { n: 1, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 2, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 3, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 4, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 5, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 6, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

const STATS: AssumedStat[] = [
  { value: 8, denom: 10, label: "leaders believe they're clear", ref: 1 },
  { value: 5, denom: 10, label: "employees don't agree their leaders are clear", ref: 1 },
  { value: 6, denom: 10, label: "employees are afraid to speak up at work", ref: 2 },
];

const REASONS: Reason[] = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", refs: [3] },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", refs: [4] },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", refs: [5] },
];

// Real coach objections at the cold-visitor stage, only ones we can answer honestly today.
const FAQS = [
  { q: "Will it compete with my coaching, or replace me?", a: "No. It needs a practitioner to run it; the relationship and the revenue stay yours. It sharpens the work you already sell." },
  { q: "Do I have to get certified or trained first?", a: "No certification exists yet. You'd learn it directly with the founder on the call, since you'd be among the first to run it." },
  { q: "What does it cost, and who pays — me or the client?", a: "A practitioner split, set on the call. You keep the client revenue." },
  { q: "Will my client actually go along with explaining themselves back?", a: "Framed as understanding rather than testing, it's designed to invite participation, not resistance. You install it in the calm, never mid-conflict, so it doesn't feel like a challenge." },
  { q: "Won't paraphrasing make me look less expert, or eat my session time?", a: "The opposite — surfacing where a misunderstanding hid as a disagreement is what clients can't do alone. It's a short check inside a real conversation, not a separate exercise." },
  { q: "Does this clash with the method I already use (NVC, Gottman, DISC, my own)?", a: "It sits underneath them. Those tools measure traits or teach skills; this verifies that two people actually understood each other, and tells a misunderstanding from a real disagreement." },
  { q: "Is this proven? What if it falls flat with a client mid-engagement?", a: "Not yet — you'd be among the first and help shape it. You stay in the room running it, so if a piece doesn't land you adapt it like any other tool in your practice." },
];

function CoachHero() {
  return (
    <FableHero
      eyebrow="Reducing customer churn for coaches & therapists"
      EyebrowIcon={BriefcaseIcon}
      title="Stop losing customers."
      sub={
        <>
          <span className="block">Honesty is risky when the stakes are high.</span>
          <span className="block text-blue-600">Make the hard truth safe to share.</span>
        </>
      }
      example={AGREED_COACH}
    />
  );
}

function RefundChat() {
  // Generic refund scenario (anonymized). The WhatsApp colours are scoped to the mockup.
  return (
    <ChatSection>
      <div className="container mx-auto max-w-xl">
        <SectionHeader title={<>When the hard truth is <span className="text-blue-500">difficult to say</span></>} />
        <CoachHardTruthChat />
      </div>
    </ChatSection>
  );
}

function CoachClose() {
  return (
    <CloseSection
      id="book"
      lead="Your customer nods. "
      title="But doesn't understand."
      sub="Stop it before they churn."
      actions={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <AuditCTA location="closing" tone="inverse" />
          <OrLink to="/sign-pledge" tone="inverse">
            Take the Pledge
          </OrLink>
        </div>
      }
    />
  );
}

export function CoachPartnershipPage() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useInviteRedirects();

  return (
    <FablePage
      seo={
        <SEO
          title="Clarity Pledge for Coaches"
          url="/coach"
          description="Your client didn't disagree with your advice. They misunderstood it. Give them a way to tell a misunderstanding from a real disagreement."
        />
      }
    >
      <CoachHero />
      <RefundChat />
      <AssumedSection index="01" stats={STATS} references={REFERENCES} />
      <IllusionSection index="02">
        <CoachMisunderstandingVenn />
      </IllusionSection>
      <ReasonsSection index="03" reasons={REASONS} references={REFERENCES} muted />
      <ExchangeSection id="how" cast={COACH_CAST} />
      <PromiseSection id="agreement" index="04" title="Role model a partnership that survives disagreement." specimen={<PartnerAgreementSpecimen />} />
      <FounderCredibility />
      <CoachClose />
      <FaqSection faqs={FAQS} />
      <ReferencesSection references={REFERENCES} />
    </FablePage>
  );
}

export default CoachPartnershipPage;
