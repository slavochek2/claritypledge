/**
 * Presentational parts of the fable layout (P1665, P1667; live on /builders and /change-managers
 * since P1671). Pure presentation, no data access; CTA analytics come from fable-tracking.ts. The hero example lives in fable-agreed.tsx and the
 * page sections in fable-sections.tsx.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { RISE, VIEWPORT_ONCE } from "./fable-motion";
import { useFableTracking, type CtaLocation } from "./fable-tracking";

export type Tone = "light" | "dark";

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

/**
 * Citation superscript. The link stays `inline` on purpose: an inline-block is its own line-break
 * opportunity, which let the number wrap alone under its paragraph. Padding on an inline box
 * widens the tap target without moving the lines around it.
 */
export function RefSup({ n, label, tone = "light" }: { n: number; label?: string; tone?: Tone }) {
  const color = tone === "dark" ? "text-blue-300 hover:text-blue-200" : "text-blue-600 hover:text-blue-700";
  return (
    <sup className="ml-0.5 text-[0.6em] font-normal">
      <a href="#references" aria-label={label ? `Reference ${n}: ${label}` : `Reference ${n}`} className={`px-2 py-5 -mx-2 ${color}`}>
        {n}
      </a>
    </sup>
  );
}

/** The fable button: a filled pill. `inverse` is the same button on the blue closing band. A `to` that is not a route opens in a new tab. */
export function FableButton({ to, onClick, tone = "primary", children }: { to: string; onClick?: () => void; tone?: "primary" | "inverse"; children: ReactNode }) {
  const color =
    tone === "inverse"
      ? "bg-white text-blue-700 hover:bg-blue-50 shadow-xl shadow-blue-950/30 focus-visible:ring-white focus-visible:ring-offset-blue-600"
      : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/25 focus-visible:ring-blue-600 focus-visible:ring-offset-background";
  const className = `inline-flex items-center justify-center gap-2.5 max-w-full rounded-full px-5 sm:px-9 py-4 sm:py-5 text-[0.9375rem] sm:text-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${color}`;
  return to.startsWith("/") ? (
    <Link to={to} onClick={onClick} className={className}>
      {children}
    </Link>
  ) : (
    <a href={to} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
      {children}
    </a>
  );
}

/** The page's single primary action. `inverse` is the same action on the blue closing band. */
export function AuditCTA({ location, tone = "primary" }: { location: CtaLocation; tone?: "primary" | "inverse" }) {
  const { cta } = useFableTracking();
  return (
    <FableButton to="/intro" onClick={() => cta?.(location)} tone={tone}>
      <CalendarIcon className="w-5 h-5 shrink-0" />
      Book a 15-min discovery call
    </FableButton>
  );
}

/** The quiet second action beside a button: "or <link>". `inverse` sits on the blue closing band. */
export function OrLink({ to, onClick, tone = "primary", children }: { to: string; onClick?: () => void; tone?: "primary" | "inverse"; children: ReactNode }) {
  const inverse = tone === "inverse";
  return (
    <p className={inverse ? "text-blue-100" : "text-foreground/70"}>
      or{" "}
      <Link
        to={to}
        onClick={onClick}
        className={
          inverse
            ? "inline-flex min-h-10 items-center text-white underline underline-offset-4 hover:text-blue-50"
            : "inline-flex min-h-10 items-center text-blue-600 underline underline-offset-4 hover:text-blue-700"
        }
      >
        {children}
      </Link>
    </p>
  );
}

/** Left-aligned heading with a running section number in the gutter. */
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
    <div className="mb-10 lg:mb-14 grid lg:grid-cols-12 gap-x-8 gap-y-5">
      <div className="lg:col-span-2 flex items-center gap-4 lg:items-start lg:pt-3">
        <span className={`font-mono text-xs tracking-[0.25em] ${dark ? "text-blue-300" : "text-blue-700"}`} aria-hidden>{index}</span>
        <span className={`h-px flex-1 ${dark ? "bg-white/20" : "bg-foreground/15"}`} aria-hidden />
      </div>
      <div className="lg:col-span-10">
        {kicker && (
          <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-blue-300" : "text-blue-700"}`}>{kicker}</p>
        )}
        <h2 className="max-w-3xl text-3xl sm:text-4xl lg:text-5xl font-semibold leading-[1.1] tracking-tight text-balance">{title}</h2>
        {sub && (
          <p className={`mt-5 text-xl lg:text-2xl font-medium ${dark ? "text-white/70" : "text-muted-foreground"}`}>{sub}</p>
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
      variants={RISE}
      className="grid grid-cols-[auto_1fr] sm:grid-cols-12 items-center gap-x-4 sm:gap-x-6 gap-y-4 border-t border-foreground/15 py-7 sm:py-9"
    >
      <p className="sm:col-span-3 text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums leading-none">
        {value}
        <span className="text-foreground/50">/{denom}</span>
      </p>
      <div className="sm:col-span-4 flex min-w-0 justify-end sm:justify-start gap-1 sm:gap-2" aria-hidden>
        {Array.from({ length: denom }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 sm:h-4 sm:w-4 shrink-0 rounded-full ${i < value ? "bg-blue-600" : "border border-foreground/25"}`}
          />
        ))}
      </div>
      <p className="col-span-2 sm:col-span-5 text-base sm:text-lg leading-snug text-foreground/75 text-balance">{children}</p>
    </motion.li>
  );
}

/** A stakes-band bar filled to a percentage, as on /change-managers. */
export function PercentBar({ percent }: { percent: number }) {
  return (
    <div className="h-14 overflow-hidden rounded-sm border border-white/25" aria-hidden>
      <div className="h-full bg-blue-400" style={{ width: `${percent}%` }} />
    </div>
  );
}
