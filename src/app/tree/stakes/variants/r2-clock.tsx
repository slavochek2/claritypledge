/**
 * @file r2-clock.tsx
 * P992 stakes-section prototype — variant "THE WINDOW".
 *
 * Seed: time is the axis. Kept — but the seed's own trap forced the design.
 *
 * THESIS: the sources give time exactly ONE piece of structure — failure lands
 * somewhere inside an 18-month window — and they say NOTHING about where. So the
 * honest temporal object is not a cost curve; it is a window of ignorance. This
 * variant draws that window as a RULER (an axis), scrubs a cursor across it, and
 * the money above never moves. The reader discovers the flatness by dragging it
 * themselves. No sentence has to claim it.
 *
 * WHY NO SLOPE IS DRAWN — read before adding one.
 * Leadership IQ says failure OCCURS within 18 months. Gallup prices a
 * replacement at ~200% of salary. Neither publishes a per-month curve, an
 * accrual, or a compounding term. `computeRisk()` in model.ts accordingly has no
 * time term at all. Any slope on this axis would be OUR invention wearing the
 * studies' citations — the logged incident (docs/decisions.md 2026-06-05, the
 * page's own thesis smuggled into a stat). This file therefore draws:
 *   - no y-axis          (there is no published quantity to plot against time)
 *   - no fill/progress   (a fill reads as accrual; nothing accrues)
 *   - no bars            (bar heights read as a distribution; none is published)
 * A ruler asserts an axis. A chart asserts a shape. We only have the axis.
 *
 * The one inference this variant does make — that the replacement figure is the
 * same whichever month it lands in — is not smuggled, it is SHOWN: drag the
 * cursor, watch the number hold. It is also not new. Every variant that prints a
 * single euro figure already assumes it; this one just makes the assumption
 * visible instead of silent.
 *
 * Shares math + copy with every other /tree/stakes variant via model.ts.
 * Spec: features/p992_key_hire_risk_calculator.md
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import {
  BOUNDS,
  CITED,
  COPY,
  DEFAULTS,
  REFS,
  computeRisk,
  derivationLine,
  formatEur,
  formatMultiple,
  type RiskInputs,
} from "@/app/tree/stakes/model";

/* ────────────────────────────────────────────────────────────────────────────
 * Local constants. model.ts is shared with three other agents and is NOT edited
 * here; anything below is this variant's own framing, defined locally per the
 * spec's invariant 5. Every `sourced` string still comes from model.ts — that is
 * what keeps it from drifting.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The window's months. 18 is Leadership IQ's — it is the outer edge of their
 * "within 18 months", not a number we chose. Month 1 is the axis origin (the day
 * the hire starts); labelling it is ours.
 */
const WINDOW = { min: 1, max: 18, step: 1 } as const;

/**
 * Salary presets — this variant's answer to "4 sliders would be boring and ugly".
 *
 * Every value sits inside BOUNDS.salary [40k..300k] on its 10k grid, so the
 * model's contract holds. But a chip set is COARSER than the slider it replaces:
 * it deliberately cannot express €117,000, which is the point — the spec's stated
 * reason for rejecting typed input ("precision the modeled figure does not have")
 * argues for chips more strongly than it argues for a slider.
 *
 * FLOOR-TEST CONSEQUENCE, stated rather than buried: the slider can reach €40k,
 * these chips bottom out at €60k. At hires=1 that lifts the lowest reachable
 * floor from €8,000 (40k × 0.2 × 1) to €12,000 (60k × 0.2 × 1). Higher, but
 * nowhere near a pass — the floor test still FAILS at hires=1, exactly as the
 * spec records. This is a real change to the floor's reachable set and it is the
 * founder's to accept or reject; BOUNDS itself is untouched.
 */
const SALARY_CHIPS = [60_000, 90_000, 120_000, 160_000, 220_000, 300_000] as const;

/** "€120k" — a compact chip label, not a formatted amount. Amounts use model's formatEur. */
const chipLabel = (n: number) => `€${n / 1000}k`;

/** Half the thumb. The rail reserves this at each end so the thumb never overhangs. */
const PAD = 22;

/* ────────────────────────────────────────────────────────────────────────────
 * Citations
 *
 * TWO treatments, because a citation must scope to the sourced UNIT and the
 * sourced unit has two different shapes here:
 *
 *  - In PROSE the unit is a clause, and a superscript is what closes on a clause
 *    without breaking the sentence. Used for beats 1, 3, 4.
 *  - In the DERIVATION the unit is a single factor sitting next to a number, and
 *    a superscript there collides with it — "2x to replace²" reads as "replace2"
 *    (founder's flag, round 1). A named source cannot be misread as a digit, and
 *    it also spends the reader's attention better than a footnote number they
 *    have to go resolve.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Superscript citation. Closes on the SOURCED CLAUSE — never a whole sentence, never our claim. */
function Cite({ n }: { n: 1 | 2 }) {
  const ref = REFS[n];
  return (
    <sup className="ml-0.5 text-[0.6em] font-normal">
      <a
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        title={ref.label}
        className="text-blue-500 hover:text-blue-600"
      >
        {n}
      </a>
    </sup>
  );
}

/**
 * The attribution tag on a derivation factor.
 *
 * `cited` is the whole mechanism: it is true only while the factor still HOLDS the
 * value the study published. Drag the failure rate to 30% and the tag stops
 * saying "Leadership IQ" and starts saying "yours" — because 30% is not
 * Leadership IQ's number and must not wear Leadership IQ's citation. Round 1
 * kept the citation attached through the drag, which silently attributes the
 * reader's number to the study. That is invariant 4, enforced at runtime.
 */
function SourceTag({ n, cited }: { n: 1 | 2; cited: boolean }) {
  if (!cited) return <span className="text-muted-foreground/70"> (yours)</span>;
  const ref = REFS[n];
  const name = n === 1 ? "Leadership IQ" : "Gallup";
  return (
    <>
      {" "}
      <a
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        title={ref.label}
        className="text-blue-500 hover:text-blue-600"
      >
        ({name})
      </a>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scrub — one pointer/keyboard primitive, three uses.
 *
 * Built rather than reused because shadcn's Slider thumb is h-4 w-4 (16px) — the
 * confirmed round-1 defect. Here the interactive row is 44px tall and the thumb
 * is a 44px pill that carries its own value, so there is nothing to read
 * elsewhere while dragging.
 * ──────────────────────────────────────────────────────────────────────────── */

function Scrub({
  value,
  min,
  max,
  step,
  onChange,
  onInteractStart,
  ariaLabel,
  valueText,
  thumbLabel,
  citedAt,
  children,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onInteractStart?: () => void;
  ariaLabel: string;
  /** Spoken value — "month 7", "46%". The thumb shows a glyph; screen readers get the noun. */
  valueText: string;
  thumbLabel: string;
  /** Where the published value sits. Stays visible while you drag away from it. */
  citedAt?: number;
  children?: React.ReactNode;
}) {
  const hit = useRef<HTMLDivElement>(null);
  const span = max - min;
  const t = span === 0 ? 0 : (value - min) / span;
  const decimals = (String(step).split(".")[1] ?? "").length;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = hit.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = r.width - 2 * PAD;
      if (travel <= 0) return;
      const frac = Math.min(1, Math.max(0, (clientX - r.left - PAD) / travel));
      const raw = min + frac * span;
      const snapped = Math.round((raw - min) / step) * step + min;
      onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals)));
    },
    [min, max, span, step, decimals, onChange],
  );

  const nudge = (delta: number) => {
    onChange(Number(Math.min(max, Math.max(min, value + delta)).toFixed(decimals)));
  };

  return (
    <div
      ref={hit}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className="relative h-11 w-full cursor-pointer touch-none select-none rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onPointerDown={(e) => {
        onInteractStart?.();
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromClientX(e.clientX);
      }}
      onKeyDown={(e) => {
        const keys = ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        onInteractStart?.();
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudge(-step);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") nudge(step);
        else if (e.key === "Home") onChange(min);
        else onChange(max);
      }}
    >
      {/* The rail. Uniform, end to end — no fill, no gradient. Nothing accrues. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />

      {/* Where the study's number sits. Dragging away from it is visibly leaving the research. */}
      {citedAt !== undefined && span > 0 && (
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `calc(${PAD}px + ${(citedAt - min) / span} * (100% - ${2 * PAD}px))` }}
        >
          <div className="mx-auto h-4 w-0.5 rounded-full bg-blue-500/40" />
        </div>
      )}

      {children}

      <div
        className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold tabular-nums text-white shadow-md shadow-blue-500/25"
        style={{ left: `calc(${PAD}px + ${t} * (100% - ${2 * PAD}px))` }}
      >
        {thumbLabel}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The money
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Count-up on first reveal only; live drags update immediately. A fresh 0→N
 * animation on every drag tick reads as broken, not as live recompute.
 *
 * The animating value sits over an invisible copy of the final string in the same
 * grid cell, so the layout reserves the final width and never reflows mid-count.
 * Size is a viewport clamp rather than a step scale: the widest reachable figure
 * is 10 × €300k × 60% × 3x = €5.400.000 (11 glyphs), and a clamp keeps that
 * inside 320px without shrinking the number on the viewports where it fits.
 */
function WindowMoney({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // Anchored to the figure itself, not to the section. The section is ~2200px tall
  // on mobile, so a section-level `amount` threshold can never be satisfied in a
  // 700px viewport and the count-up silently never fires — the figure sits at €0
  // forever. Caught by rendering it; a small element with its own threshold is the
  // only reliable trigger here.
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [val, setVal] = useState(reduce ? target : 0);
  const revealed = useRef(false);

  useEffect(() => {
    if (reduce) {
      setVal(target);
      return;
    }
    if (!inView) return;
    if (!revealed.current) {
      revealed.current = true;
      const controls = animate(0, target, {
        duration: 1.1,
        ease: "easeOut",
        onUpdate: (v) => setVal(Math.round(v)),
      });
      return () => controls.stop();
    }
    setVal(target);
  }, [inView, target, reduce]);

  return (
    <span
      ref={ref}
      className="inline-grid whitespace-nowrap font-bold tracking-tight tabular-nums text-blue-500 [font-size:clamp(2.25rem,11.5vw,5.5rem)] [line-height:1.05]"
    >
      <span className="col-start-1 row-start-1">{formatEur(val)}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

/** Count-up for the unchanged 46% headline — P987/program-page treatment, ported. */
function WindowPercent({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return <span ref={ref}>{val}%</span>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The section
 * ──────────────────────────────────────────────────────────────────────────── */

export function R2Clock() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [month, setMonth] = useState<number>(WINDOW.min);
  const [failureOpen, setFailureOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);

  const reduce = useReducedMotion();
  // Anchored to the band, not the section — same reason as WindowMoney: a
  // threshold on a 2200px-tall section is unsatisfiable in a phone viewport, so
  // the sweep would never fire and the section would never demonstrate itself.
  const bandRef = useRef<HTMLDivElement>(null);
  const bandInView = useInView(bandRef, { once: true, amount: 0.5 });

  const money = computeRisk(inputs);
  const failurePct = Math.round(inputs.failureRate * 100);
  const failureCited = inputs.failureRate === CITED.failureRate;
  const replacementCited = inputs.replacementMultiple === CITED.replacementMultiple;

  /**
   * The section demonstrates itself once, then gets out of the way.
   *
   * This replaces round 1's "click either multiplier to adjust it" — instruction
   * text sitting where the affordance should speak. One sweep of the cursor
   * teaches both things wordlessly: that the cursor moves, and that the number
   * above it does not. It returns to month 1 because every resting position is an
   * assertion, and month 1 — the day the window opens — is the only one that
   * asserts nothing about when the failure lands. Parking at 18 would quietly
   * restate the paraphrase this spec already rejected ("you won't know for 18
   * months"); the source says failure OCCURS within 18 months, not at 18.
   */
  const swept = useRef(false);
  const sweeps = useRef<ReturnType<typeof animate>[]>([]);
  const stopSweep = useCallback(() => {
    sweeps.current.forEach((c) => c.stop());
    sweeps.current = [];
  }, []);

  useEffect(() => {
    if (reduce || !bandInView || swept.current) return;
    swept.current = true;
    let cancelled = false;
    const forward = animate(WINDOW.min, WINDOW.max, {
      duration: 1.4,
      delay: 0.5,
      ease: "easeInOut",
      onUpdate: (v) => setMonth(Math.round(v)),
      onComplete: () => {
        if (cancelled) return;
        const back = animate(WINDOW.max, WINDOW.min, {
          duration: 0.7,
          delay: 0.4,
          ease: "easeInOut",
          onUpdate: (v) => setMonth(Math.round(v)),
        });
        sweeps.current.push(back);
      },
    });
    sweeps.current.push(forward);
    return () => {
      cancelled = true;
      stopSweep();
    };
  }, [bandInView, reduce, stopSweep]);

  return (
    <section className="px-4 py-16 lg:py-24">
      <div className="container mx-auto max-w-md space-y-10">
        {/* ── Beat 1 — SIZE. The rate. Unchanged from P987; the clause is verbatim
            and the axis below is its visual continuation. ── */}
        <div className="text-center">
          <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
            <WindowPercent target={Math.round(CITED.failureRate * 100)} />
          </p>
          <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug sm:text-xl">
            {COPY.failureStat.sourced}
            <Cite n={COPY.failureStat.ref} />
          </p>
        </div>

        {/* ── Beat 2 — SIZE. The money, and the window it sits in. ──

            The label answers round 1's flag: the total was unlabelled and the
            reader could not tell what the number WAS. It is replacement cost —
            Gallup's noun, the cost to re-recruit and ramp. Not revenue at risk,
            not value destroyed. Relabelling it into something bigger-sounding is
            the exact shape of the logged incident. */}
        <div className="text-center" aria-label={derivationLine(inputs)}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            replacement cost, {COPY.moneyFraming}
          </p>
          <p className="mt-2">
            <WindowMoney target={money} />
          </p>

          {/* The derivation, legible at rest. Each factor keeps its own attribution;
              the product keeps none, because no study published the product. */}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {inputs.hires} key hire{inputs.hires === 1 ? "" : "s"} × {formatEur(inputs.salary)} ×{" "}
            <button
              type="button"
              onClick={() => setFailureOpen((v) => !v)}
              aria-expanded={failureOpen}
              // As bare inline text these are 20px tall — the same defect class as
              // round 1's 16px slider thumbs. The ::before overlay expands the hit box
              // to ~44px WITHOUT touching layout; real vertical padding was tried first
              // and grew the line boxes, splitting the derivation's two factors across
              // a visible gap. The overlay is invisible, inherits the button's clicks,
              // and leaves the sentence set exactly as it reads.
              className="relative rounded-sm font-medium text-foreground underline decoration-dotted decoration-blue-500/60 underline-offset-4 before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {failurePct}% fail
            </button>
            <SourceTag n={1} cited={failureCited} /> ×{" "}
            <button
              type="button"
              onClick={() => setReplacementOpen((v) => !v)}
              aria-expanded={replacementOpen}
              // As bare inline text these are 20px tall — the same defect class as
              // round 1's 16px slider thumbs. The ::before overlay expands the hit box
              // to ~44px WITHOUT touching layout; real vertical padding was tried first
              // and grew the line boxes, splitting the derivation's two factors across
              // a visible gap. The overlay is invisible, inherits the button's clicks,
              // and leaves the sentence set exactly as it reads.
              className="relative rounded-sm font-medium text-foreground underline decoration-dotted decoration-blue-500/60 underline-offset-4 before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {formatMultiple(inputs.replacementMultiple)} to replace
            </button>
            <SourceTag n={2} cited={replacementCited} />
          </p>

          {/* The compound-claim mitigation, stated once and plainly. 46% × 2x is a
              figure neither study asserts; saying so is cheaper than hoping the
              per-factor citations imply it. */}
          <p className="mt-2 text-xs text-muted-foreground/70">
            our arithmetic — neither study published this figure
          </p>

          {/* The skeptic's door. Cited by default, revealed by a deliberate reach,
              and the cited tick stays on the rail while you drag away from it. */}
          {(failureOpen || replacementOpen) && (
            <div className="mt-4 space-y-4 rounded-xl border border-border bg-card p-4 text-left">
              {failureOpen && (
                <div>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>{Math.round(BOUNDS.failureRate.min * 100)}%</span>
                    <span>{Math.round(BOUNDS.failureRate.max * 100)}%</span>
                  </div>
                  <Scrub
                    value={inputs.failureRate}
                    min={BOUNDS.failureRate.min}
                    max={BOUNDS.failureRate.max}
                    step={BOUNDS.failureRate.step}
                    citedAt={CITED.failureRate}
                    onChange={(v) => setInputs((s) => ({ ...s, failureRate: v }))}
                    ariaLabel="Share of new hires that fail (Leadership IQ's figure is 46%)"
                    valueText={`${failurePct} percent`}
                    thumbLabel={`${failurePct}%`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {failureCited ? "Leadership IQ's figure" : `Leadership IQ published ${Math.round(CITED.failureRate * 100)}%`}
                  </p>
                </div>
              )}
              {replacementOpen && (
                <div>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>{formatMultiple(BOUNDS.replacementMultiple.min)}</span>
                    <span>{formatMultiple(BOUNDS.replacementMultiple.max)}</span>
                  </div>
                  <Scrub
                    value={inputs.replacementMultiple}
                    min={BOUNDS.replacementMultiple.min}
                    max={BOUNDS.replacementMultiple.max}
                    step={BOUNDS.replacementMultiple.step}
                    citedAt={CITED.replacementMultiple}
                    onChange={(v) => setInputs((s) => ({ ...s, replacementMultiple: v }))}
                    ariaLabel="Cost to replace, as a multiple of annual salary (Gallup's figure is 2x)"
                    valueText={`${formatMultiple(inputs.replacementMultiple)} of annual salary`}
                    thumbLabel={formatMultiple(inputs.replacementMultiple)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {replacementCited ? "Gallup's figure" : `Gallup published ${formatMultiple(CITED.replacementMultiple)}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── The window. An axis, not a chart. ──

            18 identical ticks. No y-axis, no fill, no bars — the studies publish
            nothing to plot against time, so there is nothing here but the axis
            itself. The cursor moves; the figure above it does not. That contrast
            is the whole point and it is shown, never asserted. */}
        <div ref={bandRef}>
          <Scrub
            value={month}
            min={WINDOW.min}
            max={WINDOW.max}
            step={WINDOW.step}
            onChange={setMonth}
            onInteractStart={stopSweep}
            ariaLabel="A month inside the 18-month window. The replacement cost above does not depend on it."
            valueText={`month ${month} of 18`}
            thumbLabel={String(month)}
          />

          {/* The ruler. Rendered as tick marks rather than cells or bars: a tick
              asserts a position on an axis, a bar asserts a quantity at it. We
              have no quantity — and evenly-shaded cells would read as "equally
              likely", which is a distribution claim the study does not make. */}
          <div className="relative h-2" aria-hidden>
            {Array.from({ length: WINDOW.max }, (_, i) => {
              const m = i + 1;
              const frac = (m - 1) / (WINDOW.max - WINDOW.min);
              const major = m === 1 || m % 6 === 0;
              return (
                <div
                  key={m}
                  className={`absolute top-0 w-px -translate-x-1/2 rounded-full ${major ? "h-2 bg-muted-foreground/50" : "h-1 bg-muted-foreground/25"}`}
                  style={{ left: `calc(${PAD}px + ${frac} * (100% - ${2 * PAD}px))` }}
                />
              );
            })}
          </div>

          <div className="mt-2 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>day one</span>
            <span>
              18 months
              <Cite n={COPY.failureStat.ref} />
            </span>
          </div>

          {/* Ours, and deliberately not cited. It characterises what the study
              GIVES (a bound) versus what it withholds (a date). Attaching a
              superscript here would make Leadership IQ appear to have said it. */}
          <p className="mt-1 text-center text-xs text-muted-foreground/70">a window, not a date</p>
        </div>

        {/* ── Your facts. Zero sliders. ──

            The founder's read on round 1 was that four sliders would be boring and
            ugly. A stepper counts people and a chip picks a rough salary; both are
            thumb-sized, both say what they do without a caption, and neither can
            express a precision this figure does not have. */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium tabular-nums">
              {inputs.hires} key hire{inputs.hires === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="One fewer key hire"
                disabled={inputs.hires <= BOUNDS.hires.min}
                onClick={() => setInputs((s) => ({ ...s, hires: Math.max(BOUNDS.hires.min, s.hires - 1) }))}
                className="h-11 w-11 rounded-full border border-border text-lg leading-none transition-colors hover:border-blue-500 hover:text-blue-500 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                −
              </button>
              <button
                type="button"
                aria-label="One more key hire"
                disabled={inputs.hires >= BOUNDS.hires.max}
                onClick={() => setInputs((s) => ({ ...s, hires: Math.min(BOUNDS.hires.max, s.hires + 1) }))}
                className="h-11 w-11 rounded-full border border-border text-lg leading-none transition-colors hover:border-blue-500 hover:text-blue-500 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                +
              </button>
            </div>
          </div>

          <div>
            {/* "annual salary" alone left round 1's reader asking "per hire?".
                "each" answers it in one word — and only appears when there is more
                than one person for it to distribute over. */}
            <p className="text-sm font-medium">
              annual salary{inputs.hires === 1 ? "" : ", each"}
            </p>
            {/* A grid, not flex-wrap: with flex-1 the wrapped last row stretched its
                two chips to double the width of the four above them — equal options
                rendered at unequal weight. A 3-column grid keeps every option the
                same size at every viewport. */}
            <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Annual salary per key hire">
              {SALARY_CHIPS.map((s) => {
                const active = inputs.salary === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInputs((prev) => ({ ...prev, salary: s }))}
                    className={`h-11 rounded-full border px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      active
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-500"
                    }`}
                  >
                    {chipLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Beat 3 — CAUSE. The reframe: from recruiting to talking. ──
            The 89% is prose and only prose. It re-labels the cause; it never
            reduces the amount, and it is nowhere in the formula above. The
            superscript closes on Leadership IQ's clause; the line beneath carries
            no citation because it is ours. */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.reframe.lead} {COPY.reframe.sourced}
          <Cite n={COPY.reframe.ref} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.reframe.claim}</span>
        </p>

        {/* ── Beat 4 — DELAY. The clock, and the section's close. ──
            The axis above has been sitting under this line the whole time; this is
            where it cashes out. Same construction: sourced clause cited, claim
            visibly standing on its own. The section closes here and hands to the
            CTA — never on price. */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.clock.sourced}
          <Cite n={COPY.clock.ref} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.clock.claim}</span>
        </p>
      </div>
    </section>
  );
}
