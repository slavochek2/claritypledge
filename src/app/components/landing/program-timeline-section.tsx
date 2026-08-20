import { CalendarIcon, ClockIcon, UsersIcon } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";

// The month arc — settled verbatim in the spec ("confirmed, ship as written"). No job
// titles anywhere (Non-Goals): stays readable across roles, from a startup pair to a
// change lead in a 5,000-person company. Month 3 promises personal support, never a launch.
const MONTH_ARC = [
  {
    when: "Month 1",
    heading: "Practise together, and learn how and why the clarity principle works.",
    what: "Weekly live sessions where you run the protocol on real disagreements. The nine situations are the material: you learn each one by verifying you understood it, so the practice and the theory are the same activity. You leave able to practise deliberately rather than by imitation, and able to answer the questions you will get asked.",
  },
  {
    when: "Month 2",
    heading: "Take it to a few people you actually work with.",
    what: "You pick a small number of people in your own organization and start running real exchanges with them, with a Clarity Partner Agreement where it fits and Clarity Letters when someone cannot sit in a session. I help you onboard them. This is where the practice stops being yours and becomes something two people do.",
  },
  {
    when: "Month 3",
    heading: "Open your Clarity Organization and start running events.",
    what: "I help you set it up and design your first Clarity events, so the practice reaches past the two or three early adopters who said yes first.",
  },
];

const STAGGER_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function ProgramTimelineSection({ className = "" }: { className?: string }) {
  return (
    <section className={`px-4 py-20 lg:py-28 bg-muted/30 ${className}`}>
      <div className="container mx-auto max-w-5xl">
        <Reveal className="text-center">
          <SectionHeader title={<><span className="text-blue-500">Clarity Champions</span> — your first three months</>} />
          <div className="-mt-10 mb-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 text-blue-500" /> monthly, open-ended
            </span>
            <span className="inline-flex items-center gap-2">
              <ClockIcon className="h-4 w-4 shrink-0 text-blue-500" /> weekly live session
            </span>
            <span className="inline-flex items-center gap-2">
              <UsersIcon className="h-4 w-4 shrink-0 text-blue-500" /> a batch of 3–10
            </span>
          </div>
        </Reveal>
        <motion.ol
          className="mx-auto max-w-2xl space-y-4"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT_ONCE}
        >
          {MONTH_ARC.map((t, i) => (
            <motion.li key={t.when} className="flex gap-4 sm:gap-5" variants={STAGGER_ITEM}>
              <div className="flex flex-col items-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                {i < MONTH_ARC.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 rounded-xl border border-border bg-card p-5 shadow-sm text-left">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-500">{t.when}</div>
                <p className="text-sm font-semibold text-foreground">{t.heading}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.what}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
