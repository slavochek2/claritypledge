/**
 * HowPlatformWorks — the "five moves" solution model (ported from the /presi deck:
 * a conceptual argument, not a feature list — each move says WHY it exists).
 *
 * Shared by the program landing ("/", program-page) and /coach (coach-partnership-page)
 * so the section is authored once. Renders the heading + OSS note + the 5-card grid only,
 * wrapped in its own `container`; each page supplies the outer <section> (they differ in
 * background, padding, and anchor id). Self-contained animation (framer-motion) so it
 * carries no dependency on a host page's local Reveal/stagger helpers.
 */
import { motion, type Variants } from "framer-motion";
import {
  EyeIcon,
  GaugeIcon,
  HandshakeIcon,
  ZapIcon,
  ShieldCheckIcon,
  GithubIcon,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/app/components/landing/section-header";

const MOVES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: EyeIcon, title: "Increase the will", text: "Make the problem, its root cause and its cost easy to see." },
  { icon: GaugeIcon, title: "Improve the skill", text: "Measure listening calibration so it can be improved." },
  { icon: HandshakeIcon, title: "Align expectations", text: "Commit to a minimum principle in your partnership." },
  { icon: ZapIcon, title: "Decrease the friction", text: "Cut the time and emotional cost of revealing and bridging gaps." },
  { icon: ShieldCheckIcon, title: "Prevent common pitfalls", text: "Guard against memory failures and gaslighting." },
];

const CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const ITEM: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};
const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

export function HowPlatformWorks({ className = "" }: { className?: string }) {
  return (
    <div className={`container mx-auto max-w-5xl ${className}`}>
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={VIEWPORT_ONCE}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <SectionHeader title={<>How the <span className="text-blue-500">platform</span> works</>} />
        {/* OSS note (presi parity) — sits just under the heading */}
        <p className="-mt-8 mb-10 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <GithubIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold text-foreground">Free and open source</span> ·{" "}
            <a href="https://github.com/slavochek2/claritypledge" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">github.com/slavochek2/claritypledge</a>
          </span>
        </p>
      </motion.div>
      {/* presi-parity boxed step cards: number circle on top, icon, title, text. */}
      <motion.ol
        className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5"
        variants={CONTAINER}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
      >
        {MOVES.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.li
              key={step.title}
              className="flex flex-col items-center rounded-xl border border-border bg-card p-6 text-center shadow-sm"
              variants={ITEM}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/10 text-base font-bold text-blue-700">
                {i + 1}
              </span>
              <Icon className="mt-4 h-11 w-11 text-blue-500" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="mt-4 text-base font-bold leading-snug">{step.title}</h3>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">{step.text}</p>
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );
}

export default HowPlatformWorks;
