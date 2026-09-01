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
import { useState, useEffect, useRef, Children } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { BriefcaseIcon, BanIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AgreementCertificate } from "@/app/components/agreements/agreement-certificate";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { CURRENT_AGREEMENT_VERSION } from "@/app/content/agreement-versions";
import { PledgerAvatarStack, ScrollIndicator } from "@/app/components/landing/social-proof";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";

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

// Fire-once scroll trigger (same idiom as MisunderstandingVenn above). Falls
// back to "in view" immediately when IntersectionObserver is missing (jsdom/SSR)
// or the user prefers reduced motion — so content is never stuck hidden.
function useInViewOnce<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          ob.disconnect();
        }
      },
      { threshold },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

// Staggered fade+rise for a grid of cards: each child reveals a beat after the
// previous once the grid scrolls in. Wrappers carry the entrance so the cards'
// own hover transforms stay untouched; h-full keeps grid rows equal height.
function StaggerReveal({
  className,
  step = 90,
  children,
}: {
  className?: string;
  step?: number;
  children: React.ReactNode;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.18);
  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, i) => (
        <div
          className="h-full"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "none" : "translateY(14px)",
            transition: `opacity .55s ease-out ${i * step}ms, transform .55s ease-out ${i * step}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// The honest draft the coach typed, then binned. Single source — typed live,
// then shown as the deleted-message preview.
const HONEST_DRAFT = "\"Honestly, I think 1-on-1 would fix this — want to switch instead of a refund?\"";

/**
 * "When the hard truth is difficult to say" — the talk-deck chat beat, ported to
 * the landing. On scroll-in it replays: the customer asks for a refund → the
 * coach drafts the honest reply → hesitates (thought-cloud) → strikes it →
 * it collapses to "You deleted this message" → the bland reply sends → the
 * customer is lost. Realism kept (WhatsApp green/beige, refined tones).
 *
 * EVERY asserted string is always in the DOM; only opacity/transform/maxHeight
 * are gated by phase. So when the observer never fires (jsdom test) or motion is
 * reduced, the full final state is present and legible — no conditional render.
 */
function HardTruthChat() {
  const ref = useRef<HTMLDivElement>(null);
  const FINAL = 7;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setPhase(FINAL);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        ob.disconnect();
        // customer · draft · hesitate · strike · collapse · reply · consequence
        [200, 900, 1800, 2600, 3100, 3700, 4300].forEach((t, i) => {
          timers.push(setTimeout(() => setPhase(i + 1), t));
        });
      },
      { threshold: 0.4 },
    );
    ob.observe(el);
    return () => {
      ob.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // opacity + rise, gated on reaching phase p
  const rise = (p: number) => ({
    opacity: phase >= p ? 1 : 0,
    transform: phase >= p ? "none" : "translateY(10px)",
    transition: "opacity .5s ease-out, transform .5s ease-out",
  });
  const deleted = phase >= 5; // collapsed to "You deleted this message"

  return (
    <div ref={ref}>
      <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Chat header — the contact you're messaging (the customer) */}
        <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
          <img
            src="/customer-avatar.jpg"
            alt="Your Customer"
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Your Customer</p>
            <p className="text-[11px] text-muted-foreground leading-tight">last seen recently</p>
          </div>
        </div>
        {/* Chat body — wallpaper (WhatsApp light, warmer tone) */}
        <div className="bg-[#ebe4dc] px-3 py-4 space-y-2">
          {/* Customer — received, left, white */}
          <div className="flex justify-start" style={rise(1)}>
            <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white shadow-sm px-3 py-2 text-sm text-[#111b21]">
              I want a refund. This isn't working for me.
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:02</span>
            </div>
          </div>
          {/* You — the honest draft: typed live, hesitated over, then deleted */}
          <div className="flex justify-end" style={rise(2)}>
            <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#dcf8c6] shadow-sm px-3 py-2">
              {/* "You deleted this message" header — collapses in on delete */}
              <div
                style={{
                  maxHeight: deleted ? "2.5rem" : 0,
                  opacity: deleted ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height .4s ease, opacity .3s ease",
                }}
              >
                <p className="flex items-center gap-1.5 text-sm italic text-[#54656f] border-b border-[#54656f]/15 pb-1.5 mb-1.5">
                  <BanIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> You deleted this message
                </p>
              </div>
              <p
                className={`leading-snug ${deleted ? "text-[13px] italic text-[#3b4a54]" : "text-sm text-[#111b21]"} ${phase === 4 ? "line-through" : ""}`}
                style={{ transition: "color .3s ease" }}
              >
                {HONEST_DRAFT}
              </p>
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:03</span>
            </div>
          </div>
          {/* You — what you sent instead (right, green) */}
          <div className="flex justify-end" style={rise(6)}>
            <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#dcf8c6] shadow-sm px-3 py-2 text-sm text-[#111b21]">
              Of course. I'll process your refund today.
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:04 <span className="text-blue-500">✓✓</span></span>
            </div>
          </div>
          {/* System status — WhatsApp-style centered pill (the outcome) */}
          <div className="flex justify-center pt-1" style={rise(7)}>
            <span className="rounded-md border !border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.07)] px-3 py-1 text-[11px] font-semibold text-[#b42318] shadow-sm">
              Customer lost · refund initiated
            </span>
          </div>
        </div>
      </div>
      {/* Private thought OUTSIDE the chat — why the honest alternative stayed unsent */}
      <div className="relative mx-auto max-w-md mt-6" style={rise(3)}>
        {/* thought-cloud tail — small circles rising toward the unsent message (right) */}
        <div className="absolute -top-4 right-10 flex flex-col items-center gap-1">
          <span className="block w-3.5 h-3.5 rounded-full border border-border bg-background"></span>
          <span className="block w-2 h-2 rounded-full border border-border bg-background"></span>
        </div>
        <div className="rounded-[28px] border border-border bg-muted/40 px-5 py-4 shadow-sm">
          <p className="text-sm font-bold text-foreground mb-1.5">
            Why couldn't the coach just be honest?
          </p>
          <p className="text-sm italic text-foreground/80 leading-snug">
            "She'd misunderstand it as avoiding the refund."
          </p>
        </div>
      </div>
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
        url="/coach"
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
            Reducing customer churn for coaches &amp; therapists
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight break-words">
              Stop losing customers.
            </h1>
            <p className="text-xl sm:text-2xl lg:text-3xl font-semibold leading-snug text-balance max-w-2xl mx-auto">
              <span className={`inline-block max-w-full transition-opacity duration-300 text-muted-foreground ${showLine2 ? "opacity-100" : "opacity-0"}`}>
                Honesty is risky when the stakes are high.
              </span>
              <br />
              <span className={`inline-block max-w-full transition-all duration-700 text-blue-500 ${showLine3 ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
                Make the hard truth safe to share.
              </span>
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 pt-6">
            <TryLetterCTA size="hero" />
            <p className="text-muted-foreground">
              or{" "}
              <Link to="/sign-pledge" className="text-blue-500 hover:text-blue-600 underline underline-offset-4">Take the Pledge</Link>
            </p>
          </div>

          {/* Social proof + scroll cue — same blocks as the live landing hero. "Free &
              open source" trust line removed for parity with the program hero (paid
              certification ahead; free signal muddies it). */}
          <PledgerAvatarStack className="pt-2" />
          <ScrollIndicator />
        </div>
      </section>

      {/* P915: concrete "unsent message" instance — placed right after the hero (2nd block,
          founder request). WhatsApp-style chat mockup, generic refund scenario (anonymized).
          Animated on scroll-in (HardTruthChat, talk-deck beat): draft → hesitate → strike →
          "You deleted this message" → bland reply → customer lost. Standard layout: You (coach)
          right; customer left. Thought-cloud BELOW the chat (outside it) says why he binned it.
          NOTE: green/beige hex are WhatsApp brand colors, scoped to this mockup — kept (founder:
          realism reads as "your real DMs"), tones refined warmer/softer. */}
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <div className="container mx-auto max-w-xl">
          <SectionHeader title={<>When the hard truth is <span className="text-blue-500">difficult to say</span></>} />
          <HardTruthChat />
        </div>
      </section>

      {/* Proof — stat cards (sources at the bottom, ladischenski-style refs) */}
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-4xl">
          <SectionHeader title={<>Everybody <span className="text-blue-500">assumes</span> they understand</>} />
          <StaggerReveal className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="h-full rounded-xl border border-border bg-card p-6 sm:p-8 text-center shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1"
              >
                <div className="text-4xl sm:text-5xl font-bold text-blue-500 tracking-tight">{s.num}</div>
                <p className="text-sm text-muted-foreground mt-3 leading-snug">
                  {s.label}
                  <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{s.ref}</a></sup>
                </p>
              </div>
            ))}
          </StaggerReveal>
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
          <StaggerReveal className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left">
            {REASONS_NOBODY_CHECKS.map((r) => (
              <div key={r.title} className="h-full rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {r.text}
                  {r.ref && (
                    <sup className="ml-0.5"><a href="#references" className="text-blue-500 hover:text-blue-600">{r.ref}</a></sup>
                  )}
                </p>
              </div>
            ))}
          </StaggerReveal>
        </div>
      </section>

      {/* How it works — shared HowPlatformWorks (same component as the program landing). */}
      <section id="how" className="px-4 py-20 lg:py-32 border-t border-border scroll-mt-16">
        <HowPlatformWorks />
      </section>

      {/* Clarity Partner Agreement — the real AgreementCertificate (proper width).
          variant="pending" + no termsText: header + names + oath only — cuts the
          terms block and the signatures/seal row (st8/st9 story-image treatment). */}
      <section id="agreement" className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border scroll-mt-16">
        <div className="container mx-auto max-w-3xl">
          <SectionHeader title="Role model a partnership that survives disagreement." />
          {/* TEMPLATE stamp — same overlay as /partner-template: without it the
              Einstein/Teresa certificate reads as a real signed agreement.
              P1229 D3: overflow-x-clip — the stamp's pre-landing scale(2.7) state and its
              880px nowrap span otherwise widen the layout viewport to 627px on phones. */}
          <div className="relative overflow-x-clip">
            <AgreementCertificate
              variant="pending"
              agreementVersion={CURRENT_AGREEMENT_VERSION}
              creatorName="Albert Einstein"
              partnerName="Mother Teresa"
            />
            <TemplateStamp animate />
          </div>
        </div>
      </section>

      {/* Founder credibility — full self-contained section (P1005), identical across
          /, /coach, /founder. The "who's behind this" trust anchor before the close. */}
      <FounderCredibility />

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
