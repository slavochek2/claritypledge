/**
 * /hospitals — P1506. Share-by-link use-case page for people from the health industry.
 *
 * Copy is the English page of the hospital brochure, verbatim (layout and line breaks only);
 * deviations are listed in P1506's build notes. Unlisted: noIndex, no nav item, no sitemap entry.
 * Clarity Pledge is the subject throughout, no first-person service offer.
 *
 * Since P1674 it renders the fable layout of /builders and /change-managers, with the hero drawing
 * (AGREED_HOSPITALS: one hand-over, five meanings; the words are screen-reader only). Section order
 * is unchanged. Owns: `landing_page_viewed` (variant "hospitals") on load; `hospitals_cta_clicked`
 * with the button's location ("hero" | "closing"); `hospitals_pledge_clicked` on the hero pledge
 * link; the exchange's own view event (HOSPITAL_CAST, the gap exchange's default); the noindex SEO
 * with its OG card.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";
import { HeartPulseIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { HospitalIcon, type HospitalIconName } from "@/app/components/hospitals/hospital-icons";
import { HOSPITAL_HIERARCHY_TEXT } from "@/app/components/landing/why-nobody-verifies";
import { HOSPITAL_MAINTAIN_TEXT } from "@/app/components/landing/team-norm-section";
import { HOSPITAL_CAST } from "@/app/content/exchange-casts";
import { HOSPITALS_OG } from "@/app/content/hospitals-og";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { AGREED_HOSPITALS, CHANGE_REASONS, SHELL, type Reason, type Reference } from "@/app/components/landing/fable/fable-content";
import { RISE, STAGGER, VIEWPORT_ONCE } from "@/app/components/landing/fable/fable-motion";
import { CountUp, Indented, PercentBar, RefSup, Reveal, SectionHeading } from "@/app/components/landing/fable/fable-parts";
import { CloseSection, ExchangeSection, FableHero, NormSection, PromiseSection, ReasonsSection, ReferencesSection, StakesBand } from "@/app/components/landing/fable/fable-sections";
import { FablePage } from "@/app/components/landing/fable/fable-use-case";
import type { FableTracking } from "@/app/components/landing/fable/fable-tracking";

const REFERENCES: Reference[] = [
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
];

/**
 * The shared why-nobody-verifies reasons (CHANGE_REASONS, checked against the shared section's copy)
 * in the hospital wording; reading order numbers them 2, 3, 4 (the stat is 1).
 */
const REASONS: Reason[] = CHANGE_REASONS.map((r, i) => ({ ...r, text: i === 0 ? HOSPITAL_HIERARCHY_TEXT : r.text, refs: [i + 2] }));

const VALUES: { icon: HospitalIconName; text: string }[] = [
  { icon: "shield", text: "Fewer mistakes and rework" },
  { icon: "scale", text: "Better decisions" },
  { icon: "stay", text: "Lower staff turnover" },
];

const TRACKING: FableTracking = {
  cta: (location) => analytics.track("hospitals_cta_clicked", { location }),
  pledge: () => analytics.track("hospitals_pledge_clicked"),
};

/** "The value for the hospital": three outcomes, icon over label. [FOUNDER DECISION: heading — drafted] */
function ValueSection() {
  return (
    <section className="border-t border-border px-4 py-16 lg:py-28">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index="02" title={<>The value for the <span className="text-blue-600">hospital</span></>} />
        </Reveal>
        <Indented>
          <motion.ul variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="grid grid-cols-3 gap-3 sm:gap-x-10">
            {VALUES.map((v) => (
              <motion.li key={v.text} variants={RISE} className="flex flex-col gap-4 border-t-2 border-foreground pt-5">
                <HospitalIcon name={v.icon} className="h-8 w-8 sm:h-9 sm:w-9 text-blue-600" />
                <span className="text-[13px] min-[360px]:text-sm sm:text-xl font-semibold leading-snug tracking-tight">{v.text}</span>
              </motion.li>
            ))}
          </motion.ul>
        </Indented>
      </div>
    </section>
  );
}

export function HospitalsPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "hospitals" });
  }, []);

  return (
    <FablePage tracking={TRACKING} seo={<SEO title={HOSPITALS_OG.title} description={HOSPITALS_OG.description} url="/hospitals" image={HOSPITALS_OG.image} noIndex />}>
      {/* [FOUNDER DECISION: eyebrow text — drafted] */}
      <FableHero
        eyebrow="Patient safety starts with understanding"
        EyebrowIcon={HeartPulseIcon}
        title={
          <span className="block">
            Reveal gaps in understanding between hospital staff <span className="text-blue-600">before</span> they become mistakes
          </span>
        }
        example={AGREED_HOSPITALS}
        nextId="stakes"
        nextLabel="Why it matters"
      />
      <StakesBand id="stakes" big={<><span className="text-blue-400"><CountUp target={30} /></span>%</>} visual={<PercentBar percent={30} />}>
        of 23,658 US malpractice cases studied involved a communication failure.
        <RefSup n={1} label={REFERENCES[0]?.label} tone="dark" />
      </StakesBand>
      <ReasonsSection index="01" reasons={REASONS} references={REFERENCES} />
      <ExchangeSection cast={HOSPITAL_CAST} muted />
      <ValueSection />
      <PromiseSection index="03" title={<>Make it <span className="text-blue-400">normal</span> to ask how well we understand each other</>} />
      <NormSection index="04" maintainText={HOSPITAL_MAINTAIN_TEXT} />
      <FounderCredibility />
      <CloseSection title="Reveal gaps in understanding between hospital staff before they become mistakes" />
      <ReferencesSection references={REFERENCES} />
    </FablePage>
  );
}

export default HospitalsPage;
