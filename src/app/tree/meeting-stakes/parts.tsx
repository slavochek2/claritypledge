/** Shared controls for the /tree/meeting-stakes prototype. */
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FIELD, errorId } from "./ui";


/**
 * One question as a native radio group (arrow keys, one tab stop, announced as "1 of 5").
 * Unanswered is its own state, never Unsure, and Clear takes an answer back.
 */
export function ChoiceGroup<T extends string | number>({ name, legend, options, value, onChange, error, columns }: { name: string; legend: ReactNode; options: ReadonlyArray<{ value: T; label: string }>; value: T | null; onChange: (v: T | null) => void; error?: string; columns: 2 | 5 }) {
  const set = useRef<HTMLFieldSetElement>(null);
  const clear = () => {
    onChange(null);
    // The Clear button disappears with the answer, so focus goes back into the group.
    set.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };
  return (
    // The wrapper, not the fieldset, anchors Clear: a fieldset lays its children out below the legend.
    <div className="relative">
    <fieldset ref={set} data-question={name} aria-describedby={error ? errorId(name) : undefined} aria-invalid={error ? true : undefined}>
      <legend id={`${name}-legend`} className="pr-16 font-medium">{legend}</legend>
      {error && <p id={errorId(name)} className="mt-1 text-sm text-red-700">{error}</p>}
      <div className={cn("mt-3 grid", columns === 5 ? "grid-cols-5 gap-1 sm:gap-1.5" : "grid-cols-2 gap-1.5 sm:max-w-xs")}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex min-h-12 cursor-pointer items-center rounded-md border py-2 text-center leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-1",
                // Five across must fit a 320px phone: a smaller face there, and no bold when picked (bold widens the
                // word past its box); the filled dot, the border and the fill mark the pick.
                columns === 5 ? "flex-col justify-start gap-1.5 px-0.5 text-[10px] min-[380px]:text-[11px] sm:text-xs" : "justify-center gap-2 px-1 text-sm",
                on ? "border-blue-600 bg-blue-100 text-blue-900" : "border-blue-200 text-foreground hover:border-blue-400 hover:bg-blue-50",
                on && columns === 2 && "font-semibold",
              )}
            >
              <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              <span aria-hidden="true" className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", on ? "border-blue-600" : "border-blue-500")}>
                {on && <span className="h-2 w-2 rounded-full bg-blue-600" />}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
    {/* In the corner beside the question (the legend leaves room), so it takes no row of its own and
        answering never moves the questions below. After the fieldset, so it is tabbed to after the answers. */}
    {value !== null && (
      <button type="button" id={`${name}-clear`} onClick={clear} aria-labelledby={`${name}-clear ${name}-legend`} className="absolute -top-2.5 right-0 min-h-11 rounded-md px-2 text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        Clear
      </button>
    )}
    </div>
  );
}

const MAX_NUMBER = 1_000_000_000;

/** A number the host may leave empty (null). The field keeps the typed text, so it can be cleared and retyped. */
export function NumberField({ label, hint, value, onChange, unit, min = 0 }: { label: string; hint?: string; value: number | null; onChange: (n: number | null) => void; unit?: string; min?: number }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const edit = (text: string, badInput: boolean) => {
    setDraft(text);
    // A half-typed number ("1e", "-") reads as empty; keep the last number rather than wiping it.
    if (badInput) return;
    const n = Number(text);
    if (text.trim() === "") onChange(null);
    else if (Number.isFinite(n)) onChange(Math.min(MAX_NUMBER, Math.max(min, n)));
  };
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {/* The unit sits inside the field, so every field keeps the same left and right edge. */}
      <span className="relative flex items-center">
        {unit === "€" && <span aria-hidden="true" className="pointer-events-none absolute left-3 text-muted-foreground">€</span>}
        <input type="number" inputMode="decimal" min={min} max={MAX_NUMBER} value={draft} onChange={(e) => edit(e.target.value, e.target.validity.badInput)} onBlur={() => setDraft(value === null ? "" : String(value))} className={cn(FIELD, unit === "€" && "pl-7", unit && unit !== "€" && (unit.length > 3 ? "pr-24" : "pr-12"))} />
        {unit && unit !== "€" && <span aria-hidden="true" className="pointer-events-none absolute right-3 text-sm text-muted-foreground">{unit}</span>}
      </span>
      {/* Below the field, so fields side by side stay level. */}
      {hint && <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** One step: its heading (focused on arrival, so a screen reader hears the step change) and its own Back / Next row. */
export function StepFrame({ title, intro, headingRef, children, back, next }: { title: string; intro?: ReactNode; headingRef: RefObject<HTMLHeadingElement | null>; children: ReactNode; back?: { label?: string; onClick: () => void }; next?: { label: string; onClick: () => void; secondary?: { label: string; onClick: () => void } } }) {
  return (
    <section aria-labelledby="step-title" className="mt-6">
      <h2 id="step-title" ref={headingRef} tabIndex={-1} className="scroll-mt-20 text-2xl font-semibold tracking-tight focus:outline-none">
        {title}
      </h2>
      {intro && <div className="mt-2 text-muted-foreground">{intro}</div>}
      <div className="mt-6">{children}</div>
      {(back || next) && (
        // docs/design-system.md Button Decision Rules: the step forward filled and full width (1), a real
        // alternative outlined under it (2), backing out as ghost and last (3). One column at every width,
        // so the reading, tab and visual order are the same.
        <div className="mt-8 grid gap-3 border-t border-border pt-5">
          {next && (
            <Button type="button" size="lg" onClick={next.onClick} className="w-full">
              {next.label}
            </Button>
          )}
          {next?.secondary && (
            <Button type="button" variant="outline" size="lg" onClick={next.secondary.onClick} className="w-full">
              {next.secondary.label}
            </Button>
          )}
          {back && (
            <Button type="button" variant="ghost" size="lg" onClick={back.onClick} className="w-full">
              {back.label ?? "Back"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
