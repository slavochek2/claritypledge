/**
 * /communities — use-case page for community organizers, the link to send when someone asks
 * "what guidelines should our community have, and why?". Small by design, one message per section:
 * hero (for whom, why) → why members stay quiet → why nobody verifies → reveal a gap, then bridge it →
 * the Group Terms → "learn how it works" (/prepare). /group-terms redirects here
 * (landing-redirects.ts). Unlisted, share-by-link, like /hospitals.
 *
 * Since P1674 it renders the fable layout of /builders and /change-managers, with the hero drawing
 * (AGREED_COMMUNITIES: the announcement from the member chat below, five meetups; the words are
 * screen-reader only). Owns: `landing_page_viewed` (variant "communities") on load;
 * `communities_cta_clicked` ("hero" | "closing") on the two "Learn how it works" buttons;
 * `communities_manifesto_clicked`; the exchange's view event via COMMUNITY_CAST. No pledge link, and
 * no TEMPLATE stamp on the terms (2026-11-12 [product]).
 */
import { useEffect } from "react";
import { UsersIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { COMMUNITY_CAST } from "@/app/content/exchange-casts";
import { AGREED_COMMUNITIES, CHANGE_REASONS, type Reason, type Reference } from "@/app/components/landing/fable/fable-content";
import { FableButton, OrLink } from "@/app/components/landing/fable/fable-parts";
import { CloseSection, ExchangeSection, FableHero, PromiseSection, ReasonsSection, ReferencesSection } from "@/app/components/landing/fable/fable-sections";
import { ChatSection, FablePage } from "@/app/components/landing/fable/fable-use-case";

const REFERENCES: Reference[] = [
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
];

/**
 * The shared why-nobody-verifies reasons (CHANGE_REASONS, checked against the shared section's copy);
 * a community has no hierarchy to speak of, so the first is awkwardness, uncited.
 */
const REASONS: Reason[] = CHANGE_REASONS.map((r, i) =>
  i === 0 ? { title: "It feels awkward", text: "In a group, asking \"did you understand me?\" can feel awkward, or like a challenge.", refs: [] } : { ...r, refs: [i] },
);

/** "Learn how it works" → /prepare, the page's one action, tracked by where it sits. */
function LearnHow({ location, tone }: { location: "hero" | "closing"; tone?: "inverse" }) {
  return (
    <FableButton to="/prepare" onClick={() => analytics.track("communities_cta_clicked", { location })} tone={tone}>
      Learn how it works
    </FableButton>
  );
}

function MemberChat() {
  return (
    <ChatSection id="why">
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
    </ChatSection>
  );
}

function CommunitiesClose() {
  return (
    <CloseSection
      title="Try them at your next important meeting"
      sub="Take the short introduction yourself, then share it with your members."
      actions={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <LearnHow location="closing" tone="inverse" />
          <OrLink to="/manifesto" onClick={() => analytics.track("communities_manifesto_clicked")} tone="inverse">
            read the manifesto
          </OrLink>
        </div>
      }
    />
  );
}

export function CommunitiesPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "communities" });
  }, []);

  return (
    <FablePage
      seo={
        <SEO
          title="Clarity Group Terms for communities"
          description="Make it normal to ask how well your members understand each other. Shared guidelines for any community."
          url="/communities"
        />
      }
    >
      <FableHero
        eyebrow="For community organizers"
        EyebrowIcon={UsersIcon}
        title={
          <span className="block">
            Make it normal to ask how well your members <span className="text-blue-600">understand each other</span>
          </span>
        }
        sub="Many members stay quiet because they expect to be misunderstood."
        example={AGREED_COMMUNITIES}
        actions={<LearnHow location="hero" />}
        nextId="why"
        nextLabel="What a member didn't say"
      />
      <MemberChat />
      <ReasonsSection index="01" reasons={REASONS} references={REFERENCES} />
      <ExchangeSection cast={COMMUNITY_CAST} muted />
      <PromiseSection
        id="terms"
        index="02"
        title={<span className="inline-block text-balance">The terms your members <span className="text-blue-400">agree to</span></span>}
        sub="We have different values, interests and opinions, so agreeing is not always possible. Understanding is. You explain back what you heard, and the other person tells you, from 0 to 10, how close you got."
        stamp={false}
      />
      <CommunitiesClose />
      <ReferencesSection references={REFERENCES} />
    </FablePage>
  );
}

export default CommunitiesPage;
