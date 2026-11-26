/** Shared controls for the /meeting-types prototype. */
import type { ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIMENSIONS, LEVELS, type DimensionKey, type Level, type Levels } from "./model";
import { errorId } from "./ui";

type Dimension = (typeof DIMENSIONS)[number];

/**
 * One segment of a five-segment bar, filled up to the level (the look of the film's five-bar card).
 * A bar not set yet is dashed, so it never reads as "set to low".
 */
const segment = (filled: boolean, unset = false) =>
  // blue-500 keeps an empty segment's edge at 3:1 against white (non-text contrast).
  // In forced-colors mode the browser would map filled and empty to the same system colours, so they get their own.
  cn(
    "block h-3 w-full rounded-full border transition-colors forced-colors:forced-color-adjust-none",
    filled ? "border-blue-600 bg-blue-600 forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight]" : "border-blue-500 bg-blue-50 forced-colors:border-[color:CanvasText] forced-colors:bg-[color:Canvas]",
    unset && "border-dashed bg-transparent",
  );

/**
 * One dimension as a bar the host fills by tapping a segment. Underneath it is a native radio group
 * (arrow keys, one tab stop, "3 of 5"), so it starts unset: nothing is pre-set, and no Clear is needed.
 */
export function LevelBar({ dim, value, onChange, error }: { dim: Dimension; value: Level | null; onChange: (l: Level) => void; error?: string }) {
  const hint = `${dim.key}-hint`;
  return (
    // A radiogroup, not a plain group: aria-invalid is supported on radiogroup (WAI-ARIA 1.2), and named by the legend.
    <fieldset role="radiogroup" aria-required="true" aria-labelledby={`${dim.key}-legend`} data-question={dim.key} aria-describedby={error ? `${hint} ${errorId(dim.key)}` : hint} aria-invalid={error ? true : undefined}>
      <legend id={`${dim.key}-legend`} className="font-medium">{dim.name}</legend>
      <p id={hint} className="text-sm text-muted-foreground">{dim.hint}</p>
      {error && <p id={errorId(dim.key)} className="text-sm text-red-700">{error}</p>}
      <div className="mt-1 grid grid-cols-5 gap-1">
        {LEVELS.map((l) => (
          // The label is the 44px touch target; the focus ring sits on the visible segment.
          <label key={l} className="flex min-h-11 cursor-pointer items-center hover:opacity-80">
            <input type="radio" name={dim.key} checked={value === l} onChange={() => onChange(l)} className="peer sr-only" />
            <span className="sr-only">{l} of 5{l === 1 ? ", low" : l === 5 ? ", high" : ""}</span>
            <span aria-hidden="true" className={cn(segment(value !== null && l <= value, value === null), "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 forced-colors:peer-focus-visible:outline-[color:Highlight]")} />
          </label>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Low</span>
        <span>High</span>
      </div>
    </fieldset>
  );
}

/** The five bars as set, read-only, for the impact step. */
export function Bars({ levels }: { levels: Levels }) {
  return (
    <ul className="grid gap-3">
      {DIMENSIONS.map((d) => {
        const l = levels[d.key] ?? 0;
        return (
          <li key={d.key} data-level={l} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-3">
            <span className="text-sm font-medium">
              {d.name}
              <span className="sr-only">: {l} of 5</span>
            </span>
            <span aria-hidden="true" className="grid grid-cols-5 gap-1">
              {LEVELS.map((s) => (
                <span key={s} data-filled={s <= l} className={segment(s <= l)} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type DimensionErrors = Partial<Record<DimensionKey, string>>;

/**
 * One step: its heading (focused on arrival, so a screen reader hears the step change) and its own buttons.
 * Continue looks muted until the step is answered but always works: pressed early, it names what is missing
 * (a disabled button could not say why, and the P955 gate bans one in the initial state).
 */
export function StepFrame({ title, intro, headingRef, children, back, next }: { title: string; intro?: ReactNode; headingRef: RefObject<HTMLHeadingElement | null>; children: ReactNode; back?: () => void; next?: { label: string; onClick: () => void; ready?: boolean } | { label: string; to: string } }) {
  return (
    <section aria-labelledby="step-title" className="mt-6">
      <h2 id="step-title" ref={headingRef} tabIndex={-1} className="scroll-mt-20 text-2xl font-semibold tracking-tight focus:outline-none">
        {title}
      </h2>
      {intro && <div className="mt-1 text-muted-foreground">{intro}</div>}
      <div className="mt-5">{children}</div>
      {(back || next) && (
        // docs/design-system.md Button Decision Rules: the step forward filled and full width, backing out as ghost and last.
        <div className="mt-8 grid gap-3">
          {next &&
            ("to" in next ? (
              // Leaving the page is navigation, so a link (opens in a new tab like any link), styled as the primary.
              <Button asChild size="lg" className="min-h-11 w-full">
                <Link to={next.to}>{next.label}</Link>
              </Button>
            ) : (
              // Not answered yet: the outlined variant, the design system's quieter blue, until it fills in (founder's ask).
              <Button type="button" size="lg" variant={next.ready === false ? "outline" : "default"} onClick={next.onClick} className="min-h-11 w-full">
                {next.label}
              </Button>
            ))}
          {back && (
            <Button type="button" variant="ghost" size="lg" onClick={back} className="min-h-11 w-full">
              Back
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
