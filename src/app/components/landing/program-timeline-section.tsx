import { useEffect, useMemo, useState } from "react";
import { ClockIcon, UsersIcon } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { getCountdownParts } from "@/app/utils/format-time";
import { getNextBatchStartISO } from "@/app/content/webinar";

// The month arc — ONE sentence per month, naming that month's goal and nothing else
// (P1087 UAT: the explanatory second paragraph was the page's biggest text block and
// repeated what the offer card already lists). No job titles anywhere (Non-Goals): stays
// readable across roles, from a startup pair to a change lead in a 5,000-person company.
// Month 3 promises personal support, never a launch.
//
// "Month 4 and beyond" added at UAT: the price is monthly and open-ended, so an arc that
// stops at three reads like a three-month course that then charges forever. What actually
// continues is the practice community — that is the thing being paid for from month four
// on, and the page never said so.
const MONTH_ARC = [
  { when: "Month 1", heading: "Practise together weekly, and learn why the clarity principle works." },
  { when: "Month 2", heading: "Take it to a few people you actually work with." },
  { when: "Month 3", heading: "Open your Clarity Organization and run your first events." },
  {
    when: "Month 4 and beyond",
    heading:
      "Keep practising with the others — exchange what works, help each other grow the practice.",
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

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Live countdown to the next Clarity Champions batch start — recomputed via
 * getNextBatchStartISO on every mount/interval tick, so it is ALWAYS a future instant
 * (P1087; the prior single hardcoded COHORT_ENROLLMENT_CLOSES_ISO rendered a permanent
 * "expired" state once its one fixed deadline passed). Ticks once per second.
 *
 * Rendered by the CLOSING Champions CTA at the bottom of the page, not here (P1087 UAT,
 * round 3). The founder's own reasoning decided the placement against their first guess:
 * "people don't care about the batch start before they know what it is, and they read what
 * it is by looking at the months." A deadline is only urgent once the reader wants the
 * thing, so it sits beside the last buy button rather than above the fold. Exported so the
 * page can compose it there. Urgency is carried by the ticking digits and a blue band —
 * the design system reserves amber/orange/red, so no red "hurry" color is used.
 */
export function BatchCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const target = useMemo(() => new Date(getNextBatchStartISO(new Date(now))).getTime(), [now]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(target)) return null;

  const { days, hours, minutes, seconds } = getCountdownParts(target, now);

  const units = [
    { value: days, label: "days" },
    { value: hours, label: "hrs" },
    { value: minutes, label: "min" },
    { value: seconds, label: "sec" },
  ];

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Next batch starts in
      </div>
      <div
        className="mt-2 flex items-stretch justify-center gap-1.5"
        role="timer"
        aria-label={`Next batch starts in ${days} days, ${hours} hours, ${minutes} minutes`}
      >
        {units.map((u) => (
          <div
            key={u.label}
            className="flex min-w-[3.25rem] flex-col items-center rounded-lg bg-card px-2 py-1.5 shadow-sm"
          >
            <span className="text-xl font-bold tabular-nums text-foreground">{pad(u.value)}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {u.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgramTimelineSection({ className = "" }: { className?: string }) {
  return (
    <section className={`px-4 pb-14 lg:pb-16 ${className}`}>
      <div className="container mx-auto max-w-5xl">
        <Reveal className="text-center">
          {/* "Program" is load-bearing, not decoration (founder UAT): the page names one
              program and then shows a three-card grid, so every surface that means THE
              PROGRAM says the same words — this title, the offer card, the assurance band,
              the SEO title. Anything shorter and the card heading reads as a fourth name.

              "— your first three months" was cut at UAT: the arc now runs to month four and
              beyond, so the subtitle contradicted the content directly under it. */}
          <SectionHeader title={<><span className="text-blue-500">Clarity Champions Program</span></>} />
          {/* This section now sits BELOW the pricing grid, so it has to say what the program
              IS before the months make sense — the grid above named it and priced it, nothing
              more. High-level on purpose: an acceleration program for people bringing the
              practice into their own organization, run as a group. [FOUNDER DECISION: wording] */}
          <p className="-mt-10 mx-auto max-w-2xl text-pretty text-base text-muted-foreground">
            An acceleration program for people who want to bring the clarity practice into
            their organization — run as a group, so you learn it by doing it with others.
          </p>
          {/* "monthly, open-ended" removed (P1087 UAT) — the price line already reads
              "/ month", so the chip restated it. The two survivors carry facts nothing
              else on the page states at a glance. */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ClockIcon className="h-4 w-4 shrink-0 text-blue-500" /> weekly live session
            </span>
            <span className="inline-flex items-center gap-2">
              <UsersIcon className="h-4 w-4 shrink-0 text-blue-500" /> a batch of 3–10
            </span>
          </div>
        </Reveal>
        <motion.ol
          className="mx-auto mt-12 max-w-2xl space-y-3"
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
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
