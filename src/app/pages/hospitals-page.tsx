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
 * /intro, appears in the hero and the closing section, as on the other landings.
 *
 * Reveal / CountUpPercent / RefSup are duplicated from program-page.tsx, as
 * build-right-thing-landing.tsx already does (see its header): extracting them would edit
 * the frozen landings, which is the follow-up spec's call.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon } from "lucide-react";
import { motion, MotionConfig, useInView, useReducedMotion, animate, type Variants } from "framer-motion";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { HospitalIcon, PeopleStrip, type HospitalIconName } from "@/app/components/hospitals/hospital-icons";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { HOSPITALS_OG } from "@/app/content/hospitals-og";

const REFERENCES = [
  {
    n: 1,
    label: "HA Thailand (Healthcare Accreditation Institute), Patient Safety Goals, P2 Communication",
    url: "https://backend.ha.or.th/fileupload/DOCUMENT/00537/7639551a-50b9-459c-9ff3-98f65c3d8cb8.pdf",
  },
  {
    n: 2,
    label: "CRICO Strategies (2015), Malpractice Risks in Communication Failures",
    url: "https://www.rmf.harvard.edu/News-and-Blog/Press-Releases-Home/Press-Releases/2016/February/Failures-in-Communication-Contribute-to-Medical-Malpractice",
  },
] as const;

const VALUES: { icon: HospitalIconName; text: string }[] = [
  { icon: "shield", text: "Fewer mistakes and rework" },
  { icon: "star", text: "Better patient experience" },
  { icon: "scale", text: "Better decisions" },
  { icon: "stay", text: "Lower staff turnover" },
];

const CASES: { icon: HospitalIconName; text: string }[] = [
  { icon: "dept", text: "Between departments" },
  { icon: "rank", text: "Across seniority" },
  { icon: "heart", text: "Patients and families" },
  { icon: "globe", text: "International patients" },
  { icon: "case", text: "Vendor and investment choices" },
  { icon: "change", text: "Introducing change" },
];

const PATH = [
  { title: "See the cost", text: "Where gaps cost the most.", strip: { blue: [], questions: [1, 3] } },
  { title: "Find champions", text: "People who naturally reveal gaps.", strip: { blue: [1] } },
  { title: "Spread", text: "In important meetings, with support.", strip: { blue: [1, 2, 3] } },
  { title: "Norm", text: "Checking before key decisions is expected.", strip: { blue: [0, 1, 2, 3, 4] } },
  { title: "Maintain", text: "New staff onboard fast, digitally.", strip: { blue: [0, 1, 2, 3, 4], plus: true } },
];

// ── Motion (presi port via framer-motion), duplicated from program-page (see header).
const STAGGER_CONTAINER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const STAGGER_ITEM: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
const SECTION = "px-4 py-20 lg:py-28 border-t border-border";

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** 0 → target on scroll-in. Starts at the real target so a page whose JS never animates
 *  still shows the right number (see program-page.tsx). */
function CountUpPercent({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(target);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return <span ref={ref}>{val}%</span>;
}

/** Citation superscript → the References list (the standard landing pattern). */
function RefSup({ n }: { n: 1 | 2 }) {
  return (
    <sup className="ml-0.5">
      <a href="#references" aria-label={`Reference ${n}: ${REFERENCES[n - 1].label}`} className="inline-block px-2 py-5 -mx-2 -my-5 text-blue-600 hover:text-blue-700">
        {n}
      </a>
    </sup>
  );
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

/** Workshop-impact-fades vs team-norm chart, with a text alternative. */
function NormChart() {
  return (
    <figure className="w-full max-w-md mx-auto">
      <svg viewBox="0 0 200 60" className="w-full h-auto" role="img" aria-labelledby="norm-chart-desc">
        <line x1="8" y1="48" x2="196" y2="48" stroke="#e5e7eb" />
        <path d="M8 46 C30 46 34 12 46 12 C60 12 66 42 110 45 L196 46" fill="none" stroke="#9ca3af" strokeWidth="2.2" />
        <path d="M8 46 C50 44 80 32 110 22 C140 13 170 11 196 10" fill="none" stroke="#2563eb" strokeWidth="2.6" />
        <text x="52" y="9" fontSize="9" fill="#4b5563">One-off workshop</text>
        <text x="196" y="26" textAnchor="end" fontSize="9" fill="#2563eb" fontWeight="700">Team norm</text>
        <text x="196" y="58" textAnchor="end" fontSize="8.5" fill="#6b7280">time &rarr;</text>
        <text x="8" y="58" fontSize="8.5" fill="#6b7280">in use</text>
      </svg>
      <figcaption id="norm-chart-desc" className="sr-only">
        Chart of how much the practice is in use over time: after a one-off workshop, use peaks and then fades back to
        near zero; as a team norm, use rises steadily and stays high.
      </figcaption>
    </figure>
  );
}

/** Icon-over-label tile grid, staggered in on scroll. */
function TileGrid({ items, cols }: { items: { icon: HospitalIconName; text: string }[]; cols: string }) {
  return (
    <motion.ul className={`grid grid-cols-2 ${cols} gap-3 sm:gap-6`} variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
      {items.map((v) => (
        <motion.li key={v.text} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card px-3 py-5 sm:p-6 text-center shadow-sm flex flex-col items-center gap-3">
          <HospitalIcon name={v.icon} className="w-8 h-8 sm:w-9 sm:h-9 text-blue-600" />
          <span className="text-sm sm:text-base font-semibold leading-snug">{v.text}</span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

export function HospitalsPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "hospitals" });
  }, []);
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];

  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO title={HOSPITALS_OG.title} description={HOSPITALS_OG.description} url="/hospitals" image={HOSPITALS_OG.image} noIndex />

        {/* 1. Hero */}
        <section className="relative px-4 pt-20 pb-20 lg:pt-28 lg:pb-28">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-balance">
              Reveal gaps in understanding between hospital staff <span className="text-blue-500">before</span> they become mistakes
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground font-medium max-w-2xl mx-auto text-balance">Clarity Pledge helps hospital teams establish and maintain one new team norm:</p>
            <p className="mt-5 mx-auto max-w-2xl rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-4 text-xl sm:text-2xl font-bold text-blue-700 text-balance">
              Make it normal to ask how well we understand each other
            </p>
            <div className="mt-10 flex justify-center">
              <PrimaryCTA location="hero" />
            </div>
          </div>
        </section>

        {/* 2. Outcomes */}
        <section className={`${SECTION} bg-muted/30`}>
          <div className="container mx-auto max-w-5xl">
            <Reveal><SectionHeader title="What the hospital can expect" /></Reveal>
            <TileGrid items={VALUES} cols="lg:grid-cols-4" />
          </div>
        </section>

        {/* 3. Why gaps stay invisible */}
        <section className={SECTION}>
          <Reveal className="container mx-auto max-w-3xl text-center">
            <SectionHeader title={<span className="inline-block text-balance">Why gaps in mutual understanding stay <span className="text-blue-500">invisible</span></span>} />
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
              Saying how much you really understood, or asking a colleague how much they did, can feel awkward or
              disrespectful, especially across seniority. So people nod, and the gap surfaces later. Read-back already
              protects clinical orders.<RefSup n={1} /> Everyday conversations have no such habit.
            </p>
          </Reveal>
        </section>

        {/* 4. The stat — count-up on scroll-in, as the 46% on /hiring */}
        <section className={`${SECTION} bg-muted/30`}>
          <Reveal className="container mx-auto max-w-3xl text-center">
            <div data-testid="stat-card">
              <p className="text-7xl sm:text-8xl font-bold text-blue-500 tracking-tight">
                <CountUpPercent target={30} />
              </p>
              <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
                of 23,658 US malpractice cases studied involved a communication failure.<RefSup n={2} />
              </p>
            </div>
          </Reveal>
        </section>

        {/* 5. The exchange — WhatsApp chat between the two colleagues */}
        <section className={SECTION} aria-label="Revealing a gap">
          <Reveal>
            <GapExchangeSection />
          </Reveal>
        </section>

        {/* 6. Use cases */}
        <section className={`${SECTION} bg-muted/30`}>
          <div className="container mx-auto max-w-5xl">
            <Reveal><SectionHeader title="Where gaps in understanding cost most" /></Reveal>
            <TileGrid items={CASES} cols="md:grid-cols-3" />
          </div>
        </section>

        {/* 7. Five-step path */}
        <section className={SECTION}>
          <div className="container mx-auto max-w-5xl">
            <Reveal><SectionHeader title={<span className="inline-block text-balance">How revealing gaps becomes a <span className="text-blue-500">team norm</span></span>} /></Reveal>
            <motion.ol className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
              {PATH.map((p, i) => (
                <motion.li key={p.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-5 text-center shadow-sm flex flex-col items-center">
                  <div className="w-28"><PeopleStrip {...p.strip} /></div>
                  <div className="my-3 w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center">{i + 1}</div>
                  <b className="block">{p.title}</b>
                  <span className="text-sm text-muted-foreground">{p.text}</span>
                </motion.li>
              ))}
            </motion.ol>
          </div>
        </section>

        {/* 8. How it's different */}
        <section className={`${SECTION} bg-muted/30`}>
          <Reveal className="container mx-auto max-w-3xl text-center">
            <SectionHeader title="How Clarity Pledge is different" />
            <p className="text-lg sm:text-xl text-muted-foreground font-medium">The impact of a one-off communication workshop fades.</p>
            <p className="mt-3 text-xl sm:text-2xl font-bold text-blue-600">Clarity Pledge helps teams establish and keep this norm.</p>
            <div className="mt-10"><NormChart /></div>
          </Reveal>
        </section>

        {/* 9. The norm in writing — the Clarity Group Terms specimen, as on /builders.
            Body is the shared oath via COA_VERSIONS, byte-identical to /groups/:slug/join.
            No Accept button: a live action on a marketing page is a dead control (P955).
            [FOUNDER DECISION: section heading — drafted, see spec build notes] */}
        <section className={`${SECTION} overflow-hidden`}>
          <Reveal className="container mx-auto max-w-3xl">
            <SectionHeader title={<span className="inline-block text-balance">One new team norm, <span className="text-blue-500">in writing</span></span>} />
            <div className="relative">
              <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen.">
                <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
              </CertificateFrame>
              <TemplateStamp animate />
            </div>
          </Reveal>
        </section>

        {/* 10. Closing CTA [FOUNDER DECISION: heading — drafted from the H1, see build notes] */}
        <section className="relative px-4 py-24 lg:py-32 border-t border-border overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
          <Reveal className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
              Reveal the gaps <span className="text-blue-500">before they become mistakes.</span>
            </h2>
            <div className="mt-12 flex justify-center">
              <PrimaryCTA location="closing" />
            </div>
          </Reveal>
        </section>

        {/* 11. References */}
        <section id="references" className="px-4 py-10 border-t border-border scroll-mt-16">
          <div className="container mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">References</p>
            <ol className="text-xs text-muted-foreground space-y-1.5">
              {REFERENCES.map((r) => (
                <li key={r.n} className="flex gap-1.5">
                  <span className="shrink-0 py-3">{r.n}.</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-block py-3 hover:text-foreground underline underline-offset-2">
                    {r.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}

export default HospitalsPage;
