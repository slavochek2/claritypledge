/**
 * Presentational parts for the /tree/landing-fable design exploration (P1665).
 * Pure presentation, no data access. The visual idea of the page: the team starts on one
 * line and ends up on five (hero), and the close mirrors it back into one.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarIcon } from "lucide-react";
import { Link } from "react-router-dom";

const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

type Tone = "light" | "dark";

/** Fade + rise when scrolled into view, once. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Citation superscript. Tap-target padding is cancelled by a matching negative margin. */
export function RefSup({ n, tone = "light" }: { n: number; tone?: Tone }) {
  const color = tone === "dark" ? "text-blue-300 hover:text-blue-200" : "text-blue-500 hover:text-blue-600";
  return (
    <sup className="ml-0.5 text-[0.6em] font-normal">
      <a href="#references" className={`inline-block px-2 py-5 -mx-2 -my-5 ${color}`}>
        {n}
      </a>
    </sup>
  );
}

/** The page's single primary action. `inverse` is the same action on the blue closing band. */
export function AuditCTA({ tone = "primary" }: { tone?: "primary" | "inverse" }) {
  const color =
    tone === "inverse"
      ? "bg-white text-blue-700 hover:bg-blue-50 shadow-xl shadow-blue-950/30"
      : "bg-blue-500 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25";
  return (
    <Link
      to="/intro"
      className={`inline-flex items-center justify-center gap-2.5 max-w-full rounded-full px-5 sm:px-9 py-4 sm:py-5 text-[0.9375rem] sm:text-lg font-semibold transition-colors ${color}`}
    >
      <CalendarIcon className="w-5 h-5 shrink-0" />
      Book a 15-min discovery call
    </Link>
  );
}

/** Left-aligned editorial heading with a running section number in the gutter. */
export function SectionHeading({
  index,
  kicker,
  title,
  sub,
  tone = "light",
}: {
  index: string;
  kicker?: string;
  title: ReactNode;
  sub?: string;
  tone?: Tone;
}) {
  const dark = tone === "dark";
  return (
    <div className="mb-12 lg:mb-16 grid lg:grid-cols-12 gap-x-8 gap-y-5">
      <div className="lg:col-span-2 flex items-center gap-4 lg:items-start lg:pt-3">
        <span className={`font-mono text-xs tracking-[0.25em] ${dark ? "text-blue-300" : "text-blue-600"}`}>{index}</span>
        <span className={`h-px flex-1 ${dark ? "bg-white/20" : "bg-foreground/15"}`} aria-hidden />
      </div>
      <div className="lg:col-span-10">
        {kicker && (
          <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-blue-300" : "text-blue-700"}`}>{kicker}</p>
        )}
        <h2 className="max-w-3xl text-3xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tighter text-balance">{title}</h2>
        {sub && (
          <p className={`mt-5 text-xl lg:text-2xl font-medium ${dark ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p>
        )}
      </div>
    </div>
  );
}

/** Indents section content to line up with the heading text, past the number gutter. */
export function Indented({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="grid lg:grid-cols-12 gap-x-8">
      <div className={`lg:col-span-10 lg:col-start-3 ${className}`}>{children}</div>
    </div>
  );
}

/** A fraction drawn as ten dots: the number is read before the label is. */
export function DotStat({ value, denom, children }: { value: number; denom: number; children: ReactNode }) {
  return (
    <motion.li
      variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } }}
      className="grid grid-cols-[auto_1fr] sm:grid-cols-12 items-center gap-x-4 sm:gap-x-6 gap-y-4 border-t border-foreground/15 py-7 sm:py-9"
    >
      <p className="sm:col-span-3 text-5xl sm:text-7xl font-semibold tracking-tighter tabular-nums leading-none">
        {value}
        <span className="text-foreground/25">/{denom}</span>
      </p>
      <div className="sm:col-span-4 flex min-w-0 justify-end sm:justify-start gap-1 sm:gap-2" aria-hidden>
        {Array.from({ length: denom }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 sm:h-4 sm:w-4 shrink-0 rounded-full ${i < value ? "bg-blue-500" : "border border-foreground/25"}`}
          />
        ))}
      </div>
      <p className="col-span-2 sm:col-span-5 text-base sm:text-lg leading-snug text-muted-foreground">{children}</p>
    </motion.li>
  );
}

// One shared start, five different ends. The dashed line is where everyone thought they were going.
const PATHS = [
  "M24 200 C 150 200, 190 196, 232 128 S 320 44, 380 34",
  "M24 200 C 160 200, 205 204, 250 262 S 330 356, 380 368",
  "M24 200 C 150 200, 215 198, 262 176 S 330 150, 384 118",
  "M24 200 C 160 200, 214 206, 220 262 S 196 346, 150 374",
  "M24 200 C 150 200, 200 196, 204 140 S 178 56, 128 30",
];
const ENDS: [number, number][] = [[380, 34], [380, 368], [384, 118], [150, 374], [128, 30]];

/**
 * The hero figure: lines that leave one point together and end up facing different ways.
 * `mirror` flips it for the close, where the same lines read as arriving at one point.
 */
export function DivergenceGraphic({ tone = "light", mirror = false, className = "" }: { tone?: Tone; mirror?: boolean; className?: string }) {
  const dark = tone === "dark";
  const line = dark ? "stroke-white" : "stroke-blue-500";
  const back = dark ? "stroke-white/60" : "stroke-foreground";
  const dot = dark ? "fill-white" : "fill-blue-500";
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden className={className} style={mirror ? { transform: "scaleX(-1)" } : undefined}>
      <line x1="24" y1="200" x2="392" y2="200" strokeWidth="1.5" strokeDasharray="3 7" className={dark ? "stroke-white/35" : "stroke-foreground/25"} />
      {PATHS.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          strokeWidth={i > 2 ? 2 : 2.5}
          strokeLinecap="round"
          className={i > 2 ? back : line}
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: i === 2 ? 0.45 : 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1.5, delay: 0.5 + i * 0.14, ease: [0.65, 0, 0.35, 1] }}
        />
      ))}
      {ENDS.map(([cx, cy], i) => (
        <motion.circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="5"
          className={i > 2 ? (dark ? "fill-white/60" : "fill-foreground") : dot}
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: i === 2 ? 0.45 : 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3, delay: 1.9 + i * 0.14 }}
        />
      ))}
      <circle cx="24" cy="200" r="7" className={dark ? "fill-white" : "fill-foreground"} />
    </svg>
  );
}
