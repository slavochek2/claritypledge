/**
 * Coach Partnership Page — P856 (coach-facing selection-tool model)
 *
 * Prototype: /tree/coach (dev-gated). ClarityPledge design system, repurposing
 * real landing patterns + the real AgreementCertificate (as on /partner-template).
 *
 * Positioning (reviewed vs lean-canvas): the which-gap USP applied to the coach's
 * pain — good advice rejected as disagreement when it was misunderstood. Churn is
 * the named CONSEQUENCE, not a promised outcome. Names are canon: Clarity Letter,
 * Clarity Session, Clarity Partner Agreement. A minimal two-circle SVG illustrates the illusion.
 *
 * COPY: DRAFT, founder to approve. Primary CTA = "Try a Clarity Letter" → /letter/ck.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { MailIcon, FileTextIcon, BriefcaseIcon, AwardIcon, UserIcon, BrainIcon, BanIcon } from "lucide-react";
import type { SevenPointCounts } from "@/app/components/shared/PositionButton";
import { StoryCardWithLinks } from "@/app/components/social/story-card-with-links";
import { PointCardWithLinks, type StoryAuthor } from "@/app/components/social/point-card-with-links";
import type { Story as DemoStory, Point as DemoPoint } from "@/app/components/shared/prototype-types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgreementCertificate } from "@/app/components/agreements/agreement-certificate";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { CURRENT_AGREEMENT_VERSION } from "@/app/content/agreement-versions";
import { PledgerAvatarStack, TrustSignals, ScrollIndicator } from "@/app/components/landing/social-proof";

// Why the gap persists — talk-deck "Three reasons nobody checks" slide.
// Refs verified by research subagent (Newton 1990 dissertation PDF; Camerer et
// al. 1989 DOI; Schegloff et al. 1977 + Kendrick 2015 for the social norm —
// conversation analysis: other-initiated repair is structurally dispreferred,
// i.e. checking someone else's meaning is a socially marked, delayed move).
const REASONS_NOBODY_CHECKS = [
  { title: "Illusion of transparency", text: "We think our meaning is far more obvious than it is. Tap a song's rhythm: tappers expect 50% of listeners to name it; 2.5% do.", ref: 3 },
  { title: "Curse of knowledge", text: "Once you know something, you can't un-know it — which makes it hard to feel what the other person is missing.", ref: 4 },
  { title: "The social norm", text: "Conversation is built to let people fix their own meaning — stepping in to check what someone understood is a marked move. So we delay it, soften it, or skip it.", ref: 5 },
];

// Stat 3: Radical Candor "Trust Gap" report (N=600 US; URL + figures verified
// live before citing) — founder swapped in for the earlier Milliken et al.
// interview stat. History: the original "4/10 don't voice disagreements" cited
// a paper that doesn't exist. Wording audited against sources (fact-check
// subagent): "don't agree their leaders are clear" is what Axios HQ actually
// reports (not "don't understand").
const STATS = [
  { num: "8 / 10", label: "leaders believe they're clear", ref: 1 },
  { num: "5 / 10", label: "employees don't agree their leaders are clear", ref: 1 },
  { num: "6 / 10", label: "employees are afraid to speak up at work", ref: 2 },
];

// Clickable references (ladischenski-style) — every entry verified to resolve.
const REFERENCES = [
  { n: 1, label: "Axios HQ — Internal Communications Statistics", url: "https://www.axioshq.com/insights/internal-communications-statistics" },
  { n: 2, label: "Radical Candor — The Trust Gap: State of the Workplace Insights (2026)", url: "https://www.radicalcandor.com/trust-gap" },
  { n: 3, label: "Newton (1990) — The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)", url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf" },
  { n: 4, label: "Camerer, Loewenstein & Weber (1989) — The Curse of Knowledge in Economic Settings, Journal of Political Economy", url: "https://doi.org/10.1086/261651" },
  { n: 5, label: "Schegloff, Jefferson & Sacks (1977) — The Preference for Self-Correction in the Organization of Repair in Conversation, Language", url: "https://doi.org/10.2307/413107" },
  { n: 6, label: "Kendrick (2015) — The Intersection of Turn-Taking and Repair: The Timing of Other-Initiations of Repair, Frontiers in Psychology", url: "https://doi.org/10.3389/fpsyg.2015.00250" },
];

// Journey order mirrors the documented practical path (lean-canvas "Badge + Pledge"):
// learn the method (letter + live verification = badging starts) → commit (agreement)
// → apply to own content (practice builds the 9-point Calibration Badge = reputation).
// Titles lead with the OUTCOME; product terminology stays in the descriptions.
const JOURNEY = [
  {
    icon: AwardIcon,
    step: "1",
    title: "Increase the will to listen actively",
    description: "Give a Clarity Badge to your customer once they understand why gaps in understanding are normal — and how to bridge them.",
  },
  {
    icon: FileTextIcon,
    step: "2",
    title: "Commit to reveal understanding gaps",
    description: (
      <>Sign the <a href="#agreement" className="text-blue-500 hover:text-blue-600 underline underline-offset-2">Clarity Partner Agreement</a> — you both commit, in writing, to surfacing misunderstandings instead of hiding them.</>
    ),
  },
  {
    icon: MailIcon,
    step: "3",
    title: "Save time to bridge misunderstandings",
    description: "Exchange Clarity Letters to reveal understanding gaps — then bridge them reliably in a Clarity Live Session.",
  },
];

// FAQ — real coach objections at the cold-visitor stage, only ones we can answer
// honestly today (subagent objection analysis; data/confidentiality Q pending founder decision).
const FAQS = [
  { q: "Will it compete with my coaching, or replace me?", a: "No. It needs a practitioner to run it; the relationship and the revenue stay yours. It sharpens the work you already sell." },
  { q: "Do I have to get certified or trained first?", a: "No certification exists yet. You'd learn it directly with the founder on the call, since you'd be among the first to run it." },
  { q: "What does it cost, and who pays — me or the client?", a: "A practitioner split, set on the call. You keep the client revenue." },
  { q: "Will my client actually go along with explaining themselves back?", a: "Framed as understanding rather than testing, it's designed to invite participation, not resistance. You install it in the calm, never mid-conflict, so it doesn't feel like a challenge." },
  { q: "Won't paraphrasing make me look less expert, or eat my session time?", a: "The opposite — surfacing where a misunderstanding hid as a disagreement is what clients can't do alone. It's a short check inside a real conversation, not a separate exercise." },
  { q: "Does this clash with the method I already use (NVC, Gottman, DISC, my own)?", a: "It sits underneath them. Those tools measure traits or teach skills; this verifies that two people actually understood each other, and tells a misunderstanding from a real disagreement." },
  { q: "Is this proven? What if it falls flat with a client mid-engagement?", a: "Not yet — you'd be among the first and help shape it. You stay in the room running it, so if a piece doesn't land you adapt it like any other tool in your practice." },
];

// Brand CTA — matches dual-cta.tsx (NOT the near-black shadcn <Button> default).
// /letter/ck = letterShortCodes alias (short-links.ts) → the sealed one-to-many
// letter for doc "CK - 9" (anon-readable envelope, verified on prod).
function TryLetterCTA({ size = "section" }: { size?: "hero" | "section" }) {
  // hero size matches the landing DualCTA hero button (text-xl px-12 py-8)
  const sizeClasses = size === "hero" ? "text-xl px-12 py-8" : "text-base px-8 py-4";
  return (
    <Link
      to="/letter/ck"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${sizeClasses}`}
    >
      Try a Clarity Letter
    </Link>
  );
}

// Real st1 content (prod canon) rendered through the REAL card components.
// Story: stories 883d89f5 (#st1 #understanding) — full content, image, author.
// Point: points f8629cdd (st1, v3 = current version) — statement + live positions.
const ST1_AUTHOR: StoryAuthor = {
  id: "a99042ef-e740-446a-8734-389c8589cc17",
  name: "Vyacheslav Ladischenski",
  hasPledged: true,
  avatarUrl: "https://lh3.googleusercontent.com/a/ACg8ocJSyqNiPdWG0DB8otTM-4KXPW1lowW48GIrZOi1K4U6UcIn6eXUKQ=s96-c",
};

const ST1_STORY: DemoStory = {
  id: "883d89f5-4449-46b2-a663-f4f2c7204c22",
  text: "They're someone I've known for years. We were on a call trying to work something out. I paraphrased their position back to them. They said yes, that's right, you understood me. A few days later, they said they didn't feel understood. My first thought: their memory was failing them. They'd forgotten. I had the confirmation. They'd said it themselves. But then I recognized it. They'd confirmed one thing and were wishing for another. Same word: understand. Two completely different meanings. They confirmed I cognitively understood them. I reproduced their position accurately. But what they needed was emotional understanding. Feeling what they were feeling. Without that distinction named, it looks like they're lying. Or misremembering. They weren't. They just had no language for the split. Neither did I. Not until that moment. #st1 #understanding",
  authorId: ST1_AUTHOR.id,
  createdAt: "2026-02-25T05:01:00Z",
  visibility: "public",
  linkedPointIds: ["f8629cdd-aa5d-432e-90ae-1c1e8c07be73"],
  understoodCount: 0,
  imageUrl: "https://storage.googleapis.com/claritypledge-story-images/story-images/883d89f5-4449-46b2-a663-f4f2c7204c22/ce9328cc-621e-47b1-90f0-26baea23eed4.jpg",
};

const ST1_POINT: DemoPoint = {
  id: "f8629cdd-aa5d-432e-90ae-1c1e8c07be73",
  text: 'When someone says "you don\'t understand me," they could mean at least three different things. They might mean I don\'t feel what they feel. They might mean I don\'t agree with them. Or they might mean they don\'t know whether I actually know what they mean. These are three separate requests. Satisfying one doesn\'t necessarily satisfy the others. The word "understand" never tells me which kind of understanding is being asked for.',
  createdAt: "2026-04-13T13:08:40Z",
  positions: {},
  linkedStoryIds: [],
  visibility: "public",
};

// Real position counts on the st1 v3 point (prod, at snapshot time).
const ST1_POINT_COUNTS: SevenPointCounts = {
  strongly_agree: 2,
  agree: 2,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

const ST1_TAGS = ["st1", "understanding"];

/**
 * USP — show, don't tell. A Story/Point switcher demonstrates the product's two
 * atoms with the REAL interaction components: a story's MEANING gets verified
 * (VerifyButton), a point's VALIDITY gets a position (PositionButtons — live).
 */
function UspContrastSection() {
  return (
    <section className="px-4 py-20 lg:py-28 border-t border-border">
      <div className="container mx-auto max-w-4xl">
        <SectionHeader title={<>Stories verify <span className="text-blue-500">meaning</span>.<br />Points verify <span className="text-blue-500">validity</span>.</>} />
        {/* max-w-2xl: wider story = less scrolling; still under the ~75ch
            readability ceiling for the card's text size */}
        <Tabs defaultValue="story" className="max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="story">A story</TabsTrigger>
            <TabsTrigger value="point">A point</TabsTrigger>
          </TabsList>
          {/* The REAL story card — st1 with image + author avatar */}
          <TabsContent value="story">
            {/* context="point-detail" hides the footer row (points expander + "0 points") —
                the point has its own tab here, no in-card peek (founder screenshot note).
                hideActions removed: the stats-row Share button (link + embed code) should
                be visible like on the point tab — the landing previews the embed
                functionality (founder request). */}
            <StoryCardWithLinks
              story={ST1_STORY}
              author={ST1_AUTHOR}
              getPointPositionCounts={() => ST1_POINT_COUNTS}
              context="point-detail"
              disableNavigation
              tags={ST1_TAGS}
            />
          </TabsContent>
          {/* The REAL point card — st1 v3 with live position buttons (anon clicks persist locally) */}
          <TabsContent value="point">
            <PointCardWithLinks
              point={ST1_POINT}
              disableNavigation
              getPointPositionCounts={() => ST1_POINT_COUNTS}
              tags={ST1_TAGS}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

/**
 * Animated illusion Venn — one diagram, two states, looping:
 * problem (huge blue fog = assumed shared understanding, red dot far out in thin
 * fog, dashed ghost near the core = where they BELIEVE the dot is, "Assumed
 * Shared Understanding: They wrongly believe…") → verified (fog condenses into
 * the small crisp blue overlap, dot moves inside, turns blue, "Verified
 * Understanding: You both know they understand you" — caption stays in the
 * diagram's second-person frame: What YOU mean / what THEY understand).
 * Fuzzy-vs-crisp maps the epistemic state to visual texture: unverified
 * understanding has no known boundary (fog), verification draws one (crisp lens).
 * The fog is the same hue as the verified core, just diffuse — assumed and
 * verified are the same substance at different epistemic intensity. It spans
 * most of BOTH private circles (people assume nearly everything they said
 * landed), with radial falloff instead of a boundary: assumption density thins
 * with distance, it never "ends". The ghost-vs-real dot gap is the illusion:
 * they place the dot at ~9, it actually sits at ~3.
 * Echoes the st3 story image (assumed lens ⊃ verified core), radicalized.
 * Replaces the earlier static before/after pair (two Venns on one page read as
 * a duplicate, founder feedback).
 */
function MisunderstandingVenn() {
  const [verified, setVerified] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<SVGSVGElement>(null);

  // Start the loop only once the diagram is actually on screen — otherwise the
  // first transition fires before anyone is looking and goes unnoticed.
  // Observe-once (disconnect after first entry): re-arming on every scroll
  // crossing resets the 1.6s first-flip timer and leaves the dot stuck in
  // whatever state the teardown caught (review finding).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    // first flip soon after it's visible, then a slower steady loop
    const first = setTimeout(() => setVerified(true), 1600);
    const interval = setInterval(() => setVerified((v) => !v), 3500);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [inView]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 640 384"
      role="img"
      aria-label="Two circles barely overlapping: what you mean and what they understand. A diffuse blue fog covering most of both circles is the assumed shared understanding: they wrongly believe they understand you. A red dot far out in the thin fog is where their understanding actually sits; a dashed ghost near the small true overlap is where they believe it sits. On verification the fog condenses into a small crisp blue overlap and the dot moves inside and turns blue: verified understanding, you both know they understand you."
      className="w-full max-w-xl lg:max-w-2xl mx-auto"
    >
      <defs>
        <clipPath id="root-cause-left-circle">
          <circle cx="195" cy="160" r="140" />
        </clipPath>
        {/* union of both circles — the fog lives only inside what someone holds */}
        <clipPath id="circles-union">
          <circle cx="195" cy="160" r="140" />
          <circle cx="445" cy="160" r="140" />
        </clipPath>
        {/* arc masks — split each circle's stroke at the other circle's boundary.
            Outer arcs (outside the other circle) are always shown; the inner arcs
            that outline the lens only appear on verify. An unverified overlap has
            no drawable boundary — showing the crossing arcs in the assumed state
            would claim the target region is already known (founder feedback). */}
        <mask id="outside-right">
          <rect x="0" y="0" width="640" height="384" fill="white" />
          <circle cx="445" cy="160" r="141.5" fill="black" />
        </mask>
        <mask id="outside-left">
          <rect x="0" y="0" width="640" height="384" fill="white" />
          <circle cx="195" cy="160" r="141.5" fill="black" />
        </mask>
        <mask id="inside-right">
          <rect x="0" y="0" width="640" height="384" fill="black" />
          <circle cx="445" cy="160" r="141.5" fill="white" />
        </mask>
        <mask id="inside-left">
          <rect x="0" y="0" width="640" height="384" fill="black" />
          <circle cx="195" cy="160" r="141.5" fill="white" />
        </mask>
        {/* radial falloff: assumption density thins with distance from the core —
            no boundary, because unverified understanding has none */}
        <radialGradient id="assumed-fog">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* assumed fog — same hue as the verified core, just diffuse. Spans most of
          both private circles: people assume nearly everything they said landed.
          Condenses into the crisp core on verify. */}
      <ellipse
        cx="320" cy="160" rx="235" ry="150"
        fill="url(#assumed-fog)"
        clipPath="url(#circles-union)"
        className="transition-opacity duration-1000 ease-in-out"
        style={{ opacity: verified ? 0 : 1 }}
      />
      {/* the small true overlap — crisp. Fully hidden in the problem state (an
          unverified target region doesn't exist yet), solid blue once verified:
          the fog condenses into this. */}
      <circle
        cx="445" cy="160" r="140"
        className="fill-blue-500/25 transition-opacity duration-1000 ease-in-out"
        clipPath="url(#root-cause-left-circle)"
        style={{ opacity: verified ? 1 : 0 }}
      />
      {/* circle outlines — outer arcs always visible; the inner arcs that outline
          the lens fade in WITH verification: verifying is what draws the boundary.
          In the assumed state the two minds read as one open blob under fog. */}
      <circle cx="195" cy="160" r="140" fill="none" className="stroke-muted-foreground/50" strokeWidth="2" mask="url(#outside-right)" />
      <circle cx="445" cy="160" r="140" fill="none" className="stroke-blue-500" strokeWidth="2" mask="url(#outside-left)" />
      <g className="transition-opacity duration-1000 ease-in-out" style={{ opacity: verified ? 1 : 0 }}>
        <circle cx="195" cy="160" r="140" fill="none" className="stroke-muted-foreground/50" strokeWidth="2" mask="url(#inside-right)" />
        <circle cx="445" cy="160" r="140" fill="none" className="stroke-blue-500" strokeWidth="2" mask="url(#inside-left)" />
      </g>
      <text x="180" y="152" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
        What you
        <tspan x="180" dy="28">mean</tspan>
      </text>
      <text x="460" y="152" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
        What they
        <tspan x="460" dy="28">understand</tspan>
      </text>
      {/* ghost dot + gap line — where they BELIEVE their understanding sits vs
          where it actually is (the red dot, demonstratively far). The ghost is
          NEAR the verified core but deliberately OUTSIDE it: they can't believe
          it's verified (it isn't) — they believe it's much CLOSER to verified
          than it actually is. Soft blue dashed = it belongs to the ASSUMED system
          (fog, caption header); red is reserved for the real dot alone. The
          neutral dashed gap between the two IS the illusion. Problem state only. */}
      <g className="transition-opacity duration-700" style={{ opacity: verified ? 0 : 1 }}>
        <circle cx="348" cy="180" r="6.5" fill="none" stroke="#60a5fa" strokeWidth="1.75" strokeDasharray="3 3" />
        {/* bowed below the "What they understand" label so the gap line never
            collides with the text */}
        <path d="M 356 186 Q 450 224 545 194" fill="none" className="stroke-muted-foreground/50" strokeWidth="1.25" strokeDasharray="4 4" />
        {/* micro-labels — each dot names its own referent, color-matched, so the
            caption lines below don't have to do the pointing (founder finding:
            "Assumed…" read as fog OR ghost, "They wrongly believe…" as the red
            dot — two referents, no pointers) */}
        <text x="338" y="208" textAnchor="end" fontSize="13.5" fontStyle="italic" fill="#60a5fa">
          they think it&apos;s here
        </text>
        <text x="560" y="222" textAnchor="end" fontSize="13.5" fontStyle="italic" fill="#ef4444">
          it&apos;s actually here
        </text>
      </g>
      {/* belief dot — demonstratively far: near the FAR edge of their circle,
          opposite the overlap (red: feels shared, couldn't be further from it)
          → inside the crisp overlap (blue, verified). The expanding ring pulses
          in the problem state to draw the eye to the element that's about to move. */}
      <circle
        cx="552"
        cy="192"
        r="6"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        className={verified ? "opacity-0" : "animate-ping origin-center [transform-box:fill-box]"}
      />
      <circle
        cx="552"
        cy="192"
        r="6"
        className="transition-all duration-1000 ease-in-out"
        style={{
          fill: verified ? "#3b82f6" : "#ef4444",
          transform: verified ? "translate(-232px, -42px)" : "translate(0, 0)",
        }}
      />
      {/* single-line caption below the diagram (zone-name headers removed — the
          color-matched dot micro-labels carry the referents now; founder call).
          Flip sequence: strike draws through the wrong belief (0–400ms) → struck
          sentence fades (450–950ms) → verified sentence fades in (1000–1500ms).
          Verification visibly cancels the illusion before replacing it. The
          sequenced fade (not a plain crossfade) prevents the two strings
          rendering overlapped as garbled text (visual QA finding). */}
      <g
        className="transition-opacity duration-500"
        style={{ opacity: verified ? 0 : 1, transitionDelay: verified ? "450ms" : "550ms" }}
      >
        <text x="320" y="362" textAnchor="middle" fill="#ef4444" fontSize="18" fontStyle="italic">
          They wrongly believe they understand you
        </text>
        {/* strikethrough — draws left-to-right via dashoffset on verify; solid
            verified-blue: the verifying act is what cancels the wrong belief */}
        <line
          x1="160" y1="356" x2="480" y2="356"
          stroke="#3b82f6" strokeWidth="1.75" strokeDasharray="320"
          style={{ strokeDashoffset: verified ? 0 : 320, transition: "stroke-dashoffset 400ms ease-in-out" }}
        />
      </g>
      <g
        className="transition-opacity duration-500"
        style={{ opacity: verified ? 1 : 0, transitionDelay: verified ? "1000ms" : "0ms" }}
      >
        <text x="320" y="362" textAnchor="middle" fill="#3b82f6" fontSize="18" fontStyle="italic">
          You both know they understand you
        </text>
      </g>
    </svg>
  );
}

function SectionHeader({ title, subtitle }: { title: React.ReactNode; subtitle?: string }) {
  return (
    <div className="text-center mb-14">
      {/* text-3xl at base: "misunderstanding?" is one unbreakable word — at text-4xl it clips on 320px viewports */}
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{title}</h2>
      {subtitle && <p className="text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}

export function CoachPartnershipPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showLine2, setShowLine2] = useState(false);
  const [showLine3, setShowLine3] = useState(false);

  // Landing behaviors ported from clarity-pledge-landing (this page now serves "/"):
  // page-view tracking + ?referrer / ?login auto-redirects (pledge invite links).
  useEffect(() => {
    analytics.track("landing_page_viewed", {
      referrer: searchParams.get("referrer") || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchParams.get("referrer")) {
      navigate("/sign-pledge");
    } else if (searchParams.get("login")) {
      navigate("/login");
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowLine2(true), 425);
    const t2 = setTimeout(() => setShowLine3(true), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Clarity Pledge for Coaches"
        url="/"
        description="Your client didn't disagree with your advice. They misunderstood it. Give them a way to tell a misunderstanding from a real disagreement."
      />

      {/* Hero — grid bg + animated 3-beat reveal (clarity-tax-section pattern) */}
      {/* pb kept tight so badge→trust-signals fits a laptop fold (founder screenshot).
          pt must clear the FIXED header (h-16 lg:h-20 = 64/80px) — the landing layout
          adds no top padding, so py-12 put the badge under the menu (founder screenshot). */}
      <section className="relative px-4 pt-24 pb-6 lg:pt-28 lg:pb-8">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          {/* Audience badge — pill + icon (ladischenski.com hero-badge pattern, CP blue).
              Static: orientation context belongs on screen from frame one. */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em]">
            <BriefcaseIcon className="w-3.5 h-3.5" />
            For coaches and consultants
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight break-words">
            Stop losing customers.
            <br />
            <span className={`inline-block max-w-full transition-opacity duration-300 text-muted-foreground ${showLine2 ? "opacity-100" : "opacity-0"}`}>
              Honesty is risky when the stakes are high.
            </span>
            <br />
            <span className={`inline-block max-w-full transition-all duration-700 text-blue-500 ${showLine3 ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
              Make the hard truth safe to say.
            </span>
          </h1>
          <div className="flex flex-col items-center gap-3 pt-6">
            <TryLetterCTA size="hero" />
            <p className="text-muted-foreground">
              or{" "}
              <Link to="/sign-pledge" className="text-blue-500 hover:text-blue-600 underline underline-offset-4">Take the Pledge</Link>
            </p>
          </div>

          {/* Social proof + trust signals + scroll cue — same blocks as the live landing hero */}
          <PledgerAvatarStack className="pt-2" />
          <TrustSignals />
          <ScrollIndicator />
        </div>
      </section>

      {/* P915: concrete "unsent message" instance — placed right after the hero (2nd block,
          founder request). WhatsApp-style chat mockup, generic refund scenario (anonymized).
          Static, no motion. Standard layout: You (coach) right; customer left. The honest
          alternative was drafted, never sent — the thought-cloud BELOW the chat (outside it)
          says why. NOTE: green/beige hex are WhatsApp brand colors, scoped to this mockup
          (FOUNDER: swap to on-brand blue/neutral if the design-system green rule should win). */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-xl">
          <SectionHeader title={<>When the hard truth is <span className="text-blue-500">difficult to say</span></>} />
          <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Chat header — the contact you're messaging (the customer) */}
            <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <UserIcon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">Your Customer</p>
                <p className="text-[11px] text-muted-foreground leading-tight">last seen recently</p>
              </div>
            </div>
            {/* Chat body — wallpaper */}
            <div className="bg-[#efeae2] px-3 py-4 space-y-2">
              {/* Customer — received, left, white */}
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white shadow-sm px-3 py-2 text-sm text-[#111b21]">
                  I want a refund. This isn't working for me.
                  <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:02</span>
                </div>
              </div>
              {/* You — sent then DELETED (WhatsApp "You deleted this message"). We add a
                  preview of what it said so the honest alternative he binned stays visible. */}
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2">
                  <p className="flex items-center gap-1.5 text-sm italic text-[#54656f]">
                    <BanIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> You deleted this message
                  </p>
                  <p className="mt-1.5 border-t border-[#54656f]/15 pt-1.5 text-[13px] italic text-[#3b4a54] leading-snug">
                    "Honestly, I think 1-on-1 would fix this — want to switch instead of a refund?"
                  </p>
                  <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:03</span>
                </div>
              </div>
              {/* You — what you sent instead (right, green) */}
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2 text-sm text-[#111b21]">
                  Of course. I'll process your refund today.
                  <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:04 <span className="text-blue-500">✓✓</span></span>
                </div>
              </div>
              {/* System status — WhatsApp-style centered pill (the outcome) */}
              <div className="flex justify-center pt-1">
                <span className="rounded-md bg-white/70 px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">
                  Customer lost · refund initiated
                </span>
              </div>
            </div>
          </div>
          {/* Private thought OUTSIDE the chat — a thought-cloud explaining why the honest
              alternative stayed unsent (it justifies the UNSENT draft above). */}
          <div className="relative mx-auto max-w-md mt-6">
            {/* thought-cloud tail — small circles rising toward the unsent message (right) */}
            <div className="absolute -top-4 right-10 flex flex-col items-center gap-1">
              <span className="block w-3.5 h-3.5 rounded-full border border-border bg-background"></span>
              <span className="block w-2 h-2 rounded-full border border-border bg-background"></span>
            </div>
            <div className="rounded-[28px] border border-border bg-muted/40 px-5 py-4 shadow-sm">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-1.5">
                <BrainIcon className="w-4 h-4 shrink-0" aria-hidden="true" /> Why did the coach delete this message?
              </p>
              <p className="text-sm italic text-foreground/80 leading-snug">
                "If I offer that now, she'll think I'm just dodging the refund."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Proof — stat cards (sources at the bottom, ladischenski-style refs) */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader title={<>Everybody <span className="text-blue-500">assumes</span> they understand</>} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border bg-card p-6 sm:p-8 text-center shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1"
              >
                <div className="text-4xl sm:text-5xl font-bold text-blue-500 tracking-tight">{s.num}</div>
                <p className="text-sm text-muted-foreground mt-3 leading-snug">
                  {s.label}
                  <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{s.ref}</a></sup>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Root cause BEFORE the solution sections — problem → cause → mechanism → process.
          Drastically simplified illusion-of-understanding visual: two barely-overlapping
          circles, red false-belief dot (replaces the dense st3 story image). */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10">
            The illusion of <span className="text-blue-500">shared understanding</span>
          </h2>
          <MisunderstandingVenn />
        </div>
      </section>

      {/* Why nobody checks — own section (talk-deck slide). Answers the coach's
          silent objection: "I already check in with clients." */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader title={<>Why almost nobody <span className="text-blue-500">verifies</span> understanding</>} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left">
            {REASONS_NOBODY_CHECKS.map((r) => (
              <div key={r.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {r.text}
                  {r.ref && (
                    <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{r.ref}</a></sup>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — repurposed user-journey-section */}
      <section id="how" className="px-4 py-20 lg:py-32 border-t border-border scroll-mt-16">
        <div className="container mx-auto max-w-7xl">
          <SectionHeader title="How it works" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {JOURNEY.map((step) => (
              <div
                key={step.step}
                className="flex flex-col items-center text-center p-8 rounded-lg bg-background border border-transparent transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-blue-200"
              >
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xl font-bold mb-4">
                  {step.step}
                </div>
                <div className="w-16 h-16 lg:w-20 lg:h-20 flex items-center justify-center mb-6">
                  <step.icon className="w-12 h-12 lg:w-14 lg:h-14 text-blue-500 stroke-[1.5]" />
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold mb-4">{step.title}</h3>
                <p className="text-lg text-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Clarity Partner Agreement — the real AgreementCertificate (proper width).
          variant="pending" + no termsText: header + names + oath only — cuts the
          terms block and the signatures/seal row (st8/st9 story-image treatment). */}
      <section id="agreement" className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
        <div className="container mx-auto max-w-3xl">
          <SectionHeader title="Role model a partnership that survives disagreement." />
          {/* TEMPLATE stamp — same overlay as /partner-template: without it the
              Einstein/Teresa certificate reads as a real signed agreement */}
          <div className="relative">
            <AgreementCertificate
              variant="pending"
              agreementVersion={CURRENT_AGREEMENT_VERSION}
              creatorName="Albert Einstein"
              partnerName="Mother Teresa"
            />
            <TemplateStamp />
          </div>
        </div>
      </section>

      {/* USP — the REAL Story/Point cards with st1 content. Now AFTER the agreement
          (founder reorder): the agreement is the artifact; this shows the atoms
          underneath (what letters/sessions run on). */}
      <UspContrastSection />

      {/* Book — final CTA (de-duplicated); sizing mirrors the landing CTASection
          (headline text-4xl→6xl, subheadline text-xl→2xl) */}
      <section id="book" className="relative px-4 py-24 lg:py-32 border-t border-border scroll-mt-16">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
        <div className="container mx-auto max-w-5xl text-center">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
            Your customer nods.
            <br className="hidden sm:block" />
            <span className="text-blue-500"> But doesn't understand.</span>
          </h2>
          <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-4xl mx-auto">
            Stop it before they churn.
          </p>
          <div className="flex flex-col items-center gap-3">
            <TryLetterCTA size="hero" />
            <p className="text-muted-foreground">
              or{" "}
              <Link to="/sign-pledge" className="text-blue-500 hover:text-blue-600 underline underline-offset-4">Take the Pledge</Link>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ — below the final CTA, just Q&A */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl">
          <Accordion type="single" collapsible>
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border">
                <AccordionTrigger className="text-base font-medium text-left hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* References — sources at the bottom (ladischenski-style) */}
      <section id="references" className="px-4 py-10 border-t border-border scroll-mt-16">
        <div className="container mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">References</p>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            {REFERENCES.map((r) => (
              <li key={r.n}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2">
                  {r.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
