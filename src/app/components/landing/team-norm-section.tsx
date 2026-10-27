import { motion, useReducedMotion } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { PeopleStrip } from "@/app/components/hospitals/hospital-icons";
import { Reveal } from "./reveal";
import { MUTED, PATH_CONTAINER, SECTION, STAGGER_ITEM, VIEWPORT_ONCE } from "./landing-motion";

export const HOSPITAL_MAINTAIN_TEXT = "New staff onboard fast, digitally.";
export const NEUTRAL_MAINTAIN_TEXT = "New joiners onboard fast, digitally.";

/** Workshop-impact-fades vs team-norm chart, with a text alternative. */
function NormChart() {
  // MotionConfig's reducedMotion only skips transforms; pathLength would still animate, so skip it here.
  const reduce = useReducedMotion();
  const draw = (duration: number, delay = 0) => ({
    initial: reduce ? false : { pathLength: 0 },
    whileInView: { pathLength: 1 },
    viewport: VIEWPORT_ONCE,
    transition: { duration, delay, ease: "easeInOut" as const },
  });
  // Each label appears as its line arrives, so it never names empty space.
  const label = (delay: number) => ({
    initial: reduce ? false : { opacity: 0 },
    whileInView: { opacity: 1 },
    viewport: VIEWPORT_ONCE,
    transition: { duration: 0.4, delay },
  });
  return (
    <figure className="w-full max-w-md mx-auto">
      <svg viewBox="-6 0 206 62" className="w-full h-auto" role="img" aria-labelledby="norm-chart-desc">
        <line x1="8" y1="48" x2="196" y2="48" stroke="#e5e7eb" />
        <line x1="9" y1="4" x2="9" y2="48" stroke="#e5e7eb" />
        {/* The lines draw left to right on scroll-in: the workshop spikes and fades, then the norm climbs. */}
        <motion.path d="M8 46 C30 46 34 12 46 12 C60 12 66 42 110 45 L196 46" fill="none" stroke="#9ca3af" strokeWidth="2.2" {...draw(1.4)} />
        <motion.path d="M8 46 C50 44 80 32 110 22 C140 13 170 11 196 10" fill="none" stroke="#2563eb" strokeWidth="2.6" {...draw(1.6, 0.5)} />
        <motion.text x="52" y="9" fontSize="9" fill="#4b5563" {...label(0.4)}>One-off workshop</motion.text>
        <motion.text x="196" y="26" textAnchor="end" fontSize="9" fill="#2563eb" fontWeight="700" {...label(1.8)}>Team norm</motion.text>
        <text x="196" y="58" textAnchor="end" fontSize="8.5" fill="#6b7280">Time</text>
        <text x="5" y="47" fontSize="8.5" fill="#6b7280" transform="rotate(-90 5 47)">Adoption</text>
      </svg>
      <figcaption id="norm-chart-desc" className="sr-only">
        Chart of how widely the practice is adopted over time: after a one-off workshop, use peaks and then fades back to
        near zero; as a team norm, use rises steadily and stays high.
      </figcaption>
    </figure>
  );
}

/** "How revealing gaps becomes a team norm": the workshop-fades chart and the five-step path. */
export function TeamNormSection({ maintainText = HOSPITAL_MAINTAIN_TEXT, muted = false }: { maintainText?: string; muted?: boolean }) {
  const path = [
    { title: "See the cost", text: "Where gaps cost the most.", strip: { blue: [], questions: [1, 3] } },
    { title: "Find champions", text: "People who naturally reveal gaps.", strip: { blue: [1] } },
    { title: "Spread", text: "In important meetings, with a simple structure.", strip: { blue: [1, 2, 3] } },
    { title: "Norm", text: "Verifying before important decisions is expected.", strip: { blue: [0, 1, 2, 3, 4] } },
    { title: "Maintain", text: maintainText, strip: { blue: [0, 1, 2, 3, 4], plus: true } },
  ];
  return (
    <section className={`${SECTION} ${muted ? MUTED : ""}`}>
      <div className="container mx-auto max-w-5xl">
        <Reveal className="text-center">
          <SectionHeader title={<span className="inline-block text-balance">How revealing gaps becomes a <span className="text-blue-500">team norm</span></span>} />
          <NormChart />
        </Reveal>
        <motion.ol className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-3 lg:gap-4" variants={PATH_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
          {path.map((p, i) => (
            <motion.li key={p.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-4 lg:p-5 shadow-sm flex lg:flex-col items-start lg:items-center gap-4 lg:gap-0 text-left lg:text-center">
              {/* Desktop: strip above the number. Mobile: number left, strip under the text. */}
              <div className="hidden lg:block w-28"><PeopleStrip {...p.strip} /></div>
              <div className="lg:my-3 w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">{i + 1}</div>
              <span className="min-w-0 flex-1">
                <b className="block">{p.title}</b>
                <span className="text-sm text-muted-foreground">{p.text}</span>
                <span className="block lg:hidden w-32 mt-2"><PeopleStrip {...p.strip} /></span>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
