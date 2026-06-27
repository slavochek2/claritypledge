import { CalendarIcon, ClockIcon, UsersIcon } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";

const PROGRAM_TIMELINE = [
  { when: "Week 1", what: "File your first Clarity Letter and join a live Clarity Experiment where we answer all your questions. Then write a response to the letter you receive, and exchange them before you meet — so you start from a written, shared baseline instead of assumptions." },
  { when: "Week 2", what: "Meet 5 other participants 1-on-1 and run Clarity sessions live. You leave with your listening calibration measured — you know whether you're over- or under-confident about how well you actually understand each other." },
  { when: "Week 3", what: "A discussion and final live Q&A, with guidance on your own Clarity Partner Agreement — so you leave with an agreement you'll actually use." },
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
          <SectionHeader title={<>What the <span className="text-blue-500">co-founder program</span> is about</>} />
          <div className="-mt-10 mb-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 text-blue-500" /> 3 weeks, live
            </span>
            <span className="inline-flex items-center gap-2">
              <ClockIcon className="h-4 w-4 shrink-0 text-blue-500" /> ~7 hours
            </span>
            <span className="inline-flex items-center gap-2">
              <UsersIcon className="h-4 w-4 shrink-0 text-blue-500" /> a cohort of 5 pairs
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
          {PROGRAM_TIMELINE.map((t, i) => (
            <motion.li key={t.when} className="flex gap-4 sm:gap-5" variants={STAGGER_ITEM}>
              <div className="flex flex-col items-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                {i < PROGRAM_TIMELINE.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 rounded-xl border border-border bg-card p-5 shadow-sm text-left">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-500">{t.when}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">{t.what}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
