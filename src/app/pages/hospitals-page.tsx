/**
 * /hospitals — P1506. Share-by-link use-case page for people from the health industry.
 *
 * Copy is the English page of the hospital brochure, verbatim (layout and line breaks only);
 * deviations are listed in the spec's build notes. Layout follows the site's landing pattern
 * (/builders build-right-thing-landing.tsx, /hiring program-page.tsx): centred SectionHeader
 * titles, py-20 lg:py-28 sections alternating bg-muted/30, Reveal on scroll, a count-up stat,
 * a WhatsApp-style chat beat, the Clarity Group Terms specimen, a closing CTA and References.
 * Unlisted: noIndex, no nav item, no sitemap entry. Clarity Pledge is the subject throughout,
 * no first-person service offer. The page's one action, "Book a 15-min discovery call" →
 * /intro, appears in the hero and the closing section; the hero adds the /builders quiet
 * "or Take the Pledge" link, the pledger strip and the scroll cue.
 *
 * Reveal, RefSup, References, CountUpPercent and the why / Group Terms / team-norm sections are
 * shared with /change-managers (src/app/components/landing/). program-page.tsx and
 * build-right-thing-landing.tsx still carry their own copies.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon, HeartPulseIcon } from "lucide-react";
import { motion, MotionConfig } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { HospitalIcon, type HospitalIconName } from "@/app/components/hospitals/hospital-icons";
import { CountUpPercent } from "@/app/components/landing/count-up-percent";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { HOSPITALS_OG } from "@/app/content/hospitals-og";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { Reveal } from "@/app/components/landing/reveal";
import { RefSup as RefSupLink } from "@/app/components/landing/ref-sup";
import { ReferencesList } from "@/app/components/landing/references-list";
import { WhyNobodyVerifiesSection, type ReasonSource } from "@/app/components/landing/why-nobody-verifies";
import { GroupTermsSection } from "@/app/components/landing/group-terms-section";
import { TeamNormSection } from "@/app/components/landing/team-norm-section";
import { SECTION, MUTED, STAGGER_CONTAINER, STAGGER_ITEM, VIEWPORT_ONCE } from "@/app/components/landing/landing-motion";

const REFERENCES = [
  {
    n: 1,
    label: "CRICO Strategies (2015), Malpractice Risks in Communication Failures",
    url: "https://www.rmf.harvard.edu/News-and-Blog/Press-Releases-Home/Press-Releases/2016/February/Failures-in-Communication-Contribute-to-Medical-Malpractice",
  },
  {
    n: 2,
    label: "HA Thailand (Healthcare Accreditation Institute), Patient Safety Goals, P2 Communication",
    url: "https://backend.ha.or.th/fileupload/DOCUMENT/00537/7639551a-50b9-459c-9ff3-98f65c3d8cb8.pdf",
  },
  {
    n: 3,
    label: "Newton (1990), The Rocky Road from Actions to Intentions (Stanford dissertation; the tapper–listener study)",
    url: "https://gwern.net/doc/psychology/cognitive-bias/illusion-of-depth/1990-newton.pdf",
  },
  {
    n: 4,
    label: "Camerer, Loewenstein & Weber (1989), The Curse of Knowledge in Economic Settings, Journal of Political Economy",
    url: "https://doi.org/10.1086/261651",
  },
] as const;

const VALUES: { icon: HospitalIconName; text: string }[] = [
  { icon: "shield", text: "Fewer mistakes and rework" },
  { icon: "scale", text: "Better decisions" },
  { icon: "stay", text: "Lower staff turnover" },
];

// Which reference number each reason cites (reading order: the stat is 1).
const REASON_REF: Record<ReasonSource, 2 | 3 | 4> = { ha: 2, newton: 3, camerer: 4 };


function RefSup({ n }: { n: 1 | 2 | 3 | 4 }) {
  return <RefSupLink n={n} label={REFERENCES[n - 1].label} />;
}

function PrimaryCTA({ location }: { location: "hero" | "closing" }) {
  return (
    <Link
      to="/intro"
      onClick={() => analytics.track("hospitals_cta_clicked", { location })}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all text-[15px] min-[360px]:text-base sm:text-lg px-5 sm:px-10 py-4 sm:py-5"
    >
      <CalendarIcon className="w-5 h-5 shrink-0" />
      <span className="whitespace-nowrap">Book a 15-min discovery call</span>
    </Link>
  );
}

/** Icon-over-label tile grid, staggered in on scroll. */
function TileGrid({ items, cols }: { items: { icon: HospitalIconName; text: string }[]; cols: string }) {
  return (
    <motion.ul className={`grid ${cols} gap-3 sm:gap-6`} variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
      {items.map((v) => (
        <motion.li key={v.text} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card shadow-sm flex flex-col items-center gap-3 px-2 py-5 sm:p-6 text-center">
          <HospitalIcon name={v.icon} className="w-8 h-8 sm:w-9 sm:h-9 text-blue-600" />
          <span className="text-[13px] min-[360px]:text-sm sm:text-base font-semibold leading-snug">{v.text}</span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

export function HospitalsPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "hospitals" });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO title={HOSPITALS_OG.title} description={HOSPITALS_OG.description} url="/hospitals" image={HOSPITALS_OG.image} noIndex />

        {/* 1. Hero — eyebrow pill, H1, the one action (the /builders hero pattern).
            [FOUNDER DECISION: pill text — drafted] */}
        <section className="relative px-4 pt-20 pb-8 lg:pt-28 lg:pb-10">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-[11px] sm:text-xs font-semibold uppercase tracking-wider sm:tracking-[0.18em]">
              <HeartPulseIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Patient safety starts with understanding
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Reveal gaps in understanding between hospital staff <span className="text-blue-500">before</span> they become mistakes
            </h1>
            {/* /builders hero pattern: one primary, the pledge as a quiet text link, then pledgers. */}
            <div className="mt-10 flex flex-col items-center gap-3">
              <PrimaryCTA location="hero" />
              <p className="text-muted-foreground">
                or{" "}
                <Link to="/sign-pledge" onClick={() => analytics.track("hospitals_pledge_clicked")} className="inline-flex items-center min-h-10 text-blue-500 hover:text-blue-600 underline underline-offset-4">
                  Take the Pledge
                </Link>
              </p>
            </div>
            <PledgerAvatarStack className="pt-2" />
          </div>
          <ScrollIndicator label="Why it matters" targetId="stakes" className="pt-6" />
        </section>

        {/* 2. The stakes — the stat right under the hero, as /builders and /hiring do. */}
        <section id="stakes" className={`${SECTION} bg-muted/30 scroll-mt-16`}>
          <Reveal className="container mx-auto max-w-3xl text-center">
            <div data-testid="stat-card">
              <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
                <CountUpPercent target={30} />
              </p>
              <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
                of 23,658 US malpractice cases studied involved a communication failure.<RefSup n={1} />
              </p>
            </div>
          </Reveal>
        </section>

        {/* 3. Why almost nobody verifies — shared with /change-managers. */}
        <WhyNobodyVerifiesSection cite={(src) => <RefSup n={REASON_REF[src]} />} />

        {/* 4. The exchange — auto-playing chat, as the Maya chat on /builders. */}
        <section className={`${SECTION} ${MUTED}`}>
          <GapExchangeSection />
        </section>

        {/* 5. The value for the hospital — right after the mechanism. [FOUNDER DECISION: heading — drafted] */}
        <section className={SECTION}>
          <div className="container mx-auto max-w-5xl">
            <Reveal><SectionHeader title={<>The value for the <span className="text-blue-500">hospital</span></>} /></Reveal>
            <TileGrid items={VALUES} cols="grid-cols-3" />
          </div>
        </section>

        {/* 6. The norm in writing — shared Group Terms specimen. */}
        <GroupTermsSection muted />

        {/* 7. How it becomes a norm — shared with /change-managers. */}
        <TeamNormSection />

        {/* Founder credibility — the shared section, byte-identical to /builders, /coach, /founder. */}
        <FounderCredibility />

        {/* 8. Closing CTA */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
              Reveal gaps in understanding between hospital staff <span className="text-blue-500">before they become mistakes</span>
            </h2>
            <div className="mt-12 flex justify-center">
              <PrimaryCTA location="closing" />
            </div>
          </Reveal>
        </section>

        {/* 9. References */}
        <ReferencesList references={REFERENCES} />
      </div>
    </MotionConfig>
  );
}

export default HospitalsPage;
