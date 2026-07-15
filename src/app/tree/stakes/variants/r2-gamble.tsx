/**
 * @file r2-gamble.tsx
 * P992 stakes-section prototype — variant "THE GAMBLE" (round 2 seed: expected value).
 *
 * THESIS
 * Nobody has 0.46 of a hire fail. At hires=1, €110,400 is the average of a future
 * the founder will never live: the real outcome is ~€240,000 or €0. A bill hides
 * that. So this variant refuses to multiply the odds into the amount.
 *
 * The payoff is bigger than honesty. Multiplying 46% × 2× produces a figure NEITHER
 * study asserts — the spec's own "compound-claim overreach" risk, arriving in the
 * headline number. Keeping the two factors orthogonal dissolves it:
 *
 *   - Leadership IQ owns the ODDS   → 46%, pictured as the bar. Never a euro.
 *   - Gallup owns the PRICE         → salary × 2x = the money. Never a probability.
 *
 * They sit on screen together and never meet in an equation. The reader joins them
 * in their gut, which is where the argument was always supposed to land.
 *
 * THE INTERACTION THAT CARRIES THE ARGUMENT
 * Drag the failure rate down to 20% and the money DOES NOT MOVE. That is the whole
 * point: the rate was never a discount on the amount. The skeptic's own concession
 * ("fine, 20%") leaves them looking at a one-in-five chance of losing a quarter
 * million — an argument that gets stronger under their numbers, not weaker.
 *
 * Shares math + copy with every other /tree/stakes variant via model.ts.
 * See features/p992_key_hire_risk_calculator.md for the spec this implements.
 */
import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import {
  BOUNDS,
  CITED,
  COPY,
  DEFAULTS,
  REFS,
  computeRisk,
  formatEur,
  formatMultiple,
  type RiskInputs,
} from "@/app/tree/stakes/model";

/**
 * LOCAL COPY — model.ts is shared by four agents, so per the brief this variant's
 * own framing lives here. Every `sourced` string still comes from model.ts; only
 * the founder's own (uncited) framing is defined locally.
 *
 * Why this variant needs its own strings rather than model.ts's:
 *
 * - `conditional` replaces the receipt's unlabelled total. The founder flagged that
 *   the reader doesn't know what the number IS. "If yours is one of them, replacing
 *   them costs roughly" answers all three flags at once: it names the conditional
 *   (the expected-value fix — "if" is exactly what €110,400 erased), it resolves
 *   "46% of what?", and it labels the total truthfully as REPLACEMENT COST rather
 *   than relabelling it into something bigger-sounding. It names no number, so it
 *   stays coherent at any failure rate the skeptic drags to.
 *
 * - `gallup` is model.ts's REFS[2] claim written as prose. Round 1's "× 2x to
 *   replace²" collided because a superscript inside a FORMULA reads as an exponent
 *   ("replace²" = replace-squared). The fix isn't a smaller superscript — it's to
 *   state the sourced claim as a sentence, where ² is unambiguously a footnote, and
 *   keep the arithmetic on a separate, deliberately UNCITED line. 200% → 2x is a
 *   units change, explicitly in scope per the spec's Non-Goals.
 *
 * - `barCaption` is the sourced clause's own subject noun, echoed under the picture
 *   of it. Uncited on purpose: it restates beat 1, which carries the citation 100px
 *   above. A superscript here would close on a fragment, not a clause.
 */
const LOCAL_COPY = {
  /** [FOUNDER DECISION: wording] — the founder's own conditional. Carries no citation. */
  subject: "The key hire you're about to make",
  /** [FOUNDER DECISION: wording] — uncited. `roughly` is model.ts's COPY.moneyFraming. */
  conditional: `If yours is one of them, replacing them costs ${COPY.moneyFraming}`,
  /**
   * Gallup (REFS[2]) as prose so the ² reads as a footnote, not an exponent.
   *
   * AUTHORED, NOT VERBATIM — flag for founder verification. model.ts's COPY carries
   * no Gallup `sourced` string, so there is nothing to reuse; this renders REFS[2]'s
   * own words ("replacement cost: ~200% of salary for leaders and managers"). Two
   * deliberate departures, both conservative: "and managers" dropped (narrows the
   * claim to leaders), and the source's "~" is preserved as "about" — "costs 2x"
   * would state exactly what the source hedges, which is an overclaim wearing a
   * citation. 200% → 2x is a units change, explicitly in scope per the Non-Goals.
   */
  gallup: "Replacing a leader costs about 2x their annual salary.",
  /** Echoes the sourced clause's subject under its own picture. */
  barCaption: "of new hires",
  /** Label for the one input. "Their" resolves it to the single hire — no ambiguity. */
  salaryLabel: "Their annual salary",
} as const;

/**
 * Salary as five buckets, not a slider.
 *
 * The spec chose sliders to encode roughness ("typed input implies exactness the
 * modeled figure does not have"). Buckets encode MORE roughness than a slider — you
 * cannot land between them — while answering the founder's "4 sliders would be
 * boring and ugly" and giving a 44px touch target instead of round 1's 16px thumb.
 *
 * DEVIATION, reported: BOUNDS.salary spans 40k–300k. These five expose 60k–250k.
 * That RAISES the reachable floor (60k vs 40k) — see the header note on the floor
 * test. Not a silent retune; the founder picks the buckets.
 */
const SALARY_CHOICES = [60_000, 90_000, 120_000, 180_000, 250_000] as const;

/** The replacement multiple's full bound range, exposed only on a deliberate reach. */
const MULTIPLE_CHOICES = [1, 1.5, 2, 2.5, 3] as const;

/** Superscript citation — closes on a SOURCED CLAUSE only, never a founder claim. */
function Citation({ n }: { n: 1 | 2 }) {
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

/** Count-up for the unchanged 46% headline (P987/program-page treatment, ported). */
function CountUpPercent({ target }: { target: number }) {
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

/**
 * Count-up for the money. Same overlay technique as program-page's CountUpMoney: the
 * animating value sits on an invisible copy of the final formatted string in the same
 * grid cell, so the layout reserves the final width and never reflows mid-count.
 *
 * Only the FIRST reveal counts up from zero. Once revealed, a chip tap updates the
 * figure immediately — a fresh 0→N animation on every change would read as broken.
 */
function CountUpMoney({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
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
    <span ref={ref} className="inline-grid whitespace-nowrap tabular-nums">
      <span className="col-start-1 row-start-1">{formatEur(val)}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

/**
 * 44px-tall bucket. The only input affordance in this variant.
 *
 * `w-full min-w-0` inside a `grid-cols-5` parent, NOT `flex-1`. Measured defect at
 * a real 320px: `flex-1` is `flex: 1 1 0%` but `min-width` still defaults to `auto`,
 * so a chip cannot shrink below its own content — five 62px chips + gaps forced
 * documentElement.scrollWidth to 334 and the whole page scrolled sideways. Tailwind's
 * grid-cols-N is `repeat(5, minmax(0, 1fr))`; the explicit 0 minimum is what removes
 * the content floor. `min-w-0` keeps that true if this is ever re-parented to flex.
 */
function Chip({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`h-11 w-full min-w-0 rounded-md border px-1 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-border bg-card text-muted-foreground hover:border-blue-500/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function R2Gamble() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [rateUnlocked, setRateUnlocked] = useState(false);
  const [multipleUnlocked, setMultipleUnlocked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  /**
   * THE INVARIANT THIS VARIANT IS BUILT ON.
   *
   * The money is the cost IF IT HAPPENS — salary × Gallup's multiple. The failure
   * rate is deliberately neutralised to 1 so it can never enter the amount: it is
   * the odds, not a discount. computeRisk stays the single source of the arithmetic
   * (model.ts is not reimplemented here), it is just handed a probability of one.
   *
   * Consequence: at hires=1 the money is a pure Gallup figure applied to one user
   * input — no compound claim in the headline number at all.
   */
  const money = computeRisk({ ...inputs, failureRate: 1 });

  const ratePct = Math.round(inputs.failureRate * 100);
  const citedPct = Math.round(CITED.failureRate * 100);
  const offCited = inputs.failureRate !== CITED.failureRate;

  const commitRate = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const { min, max, step } = BOUNDS.failureRate;
    const raw = (clientX - rect.left) / rect.width;
    const snapped = Math.round(raw / step) * step;
    const next = Math.min(max, Math.max(min, snapped));
    setInputs((s) => ({ ...s, failureRate: next }));
  };

  const nudgeRate = (delta: number) => {
    const { min, max, step } = BOUNDS.failureRate;
    setInputs((s) => {
      const next = Math.min(max, Math.max(min, s.failureRate + delta * step));
      // Kill float drift from repeated ±0.01 so the cited-tick equality check holds.
      return { ...s, failureRate: Math.round(next * 100) / 100 };
    });
  };

  const onRateKeyDown = (e: React.KeyboardEvent) => {
    const { min, max } = BOUNDS.failureRate;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudgeRate(-1);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") nudgeRate(1);
    else if (e.key === "Home") setInputs((s) => ({ ...s, failureRate: min }));
    else if (e.key === "End") setInputs((s) => ({ ...s, failureRate: max }));
    else return;
    e.preventDefault();
  };

  return (
    <section className="px-4 py-16 lg:py-24">
      <div className="container mx-auto max-w-md space-y-10 text-center">
        {/* ── Beat 1 — SIZE: the rate. Unchanged from P987. Big number 1 is the CITED
            constant, never the draggable one below. Leadership IQ owns this beat. ── */}
        <div>
          <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
            <CountUpPercent target={citedPct} />
          </p>
          <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug sm:text-xl">
            {COPY.failureStat.sourced}
            <Citation n={COPY.failureStat.ref as 1} />
          </p>
        </div>

        {/* ── Beat 2 — SIZE: the money. Gallup owns this beat. The two studies sit
            together and never meet in an equation. ── */}
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {LOCAL_COPY.subject}
          </p>

          {/* The conditional. Uncited — visibly the founder's framing, standing
              beside the research rather than wearing its citation. */}
          <p className="mx-auto max-w-xs text-base leading-snug text-muted-foreground">
            {LOCAL_COPY.conditional}
          </p>

          <p className="text-5xl font-bold tracking-tight text-blue-500 sm:text-6xl">
            <CountUpMoney target={money} />
          </p>

          {/* The founder's own arithmetic on their own input. NO citation, on purpose:
              this is the line that would collide, and it is not a research claim.
              The multiple is the control — no instruction text tells you to tap it.

              The multiple renders as a 44px pill, not an underlined inline word.
              Measured defect: as inline text it was 16x20px. Round 1's real defect was
              never "shadcn Slider" — it was tiny inline controls, and dropping sliders
              did not address it. A control that is the size of a word is a word. */}
          <p className="flex items-center justify-center gap-2 text-sm tabular-nums text-muted-foreground">
            <span>{formatEur(inputs.salary)} ×</span>
            <button
              type="button"
              onClick={() => setMultipleUnlocked((v) => !v)}
              aria-expanded={multipleUnlocked}
              aria-label={`Replacement cost: ${formatMultiple(inputs.replacementMultiple)} annual salary (Gallup). Adjust.`}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-md border border-border bg-card px-3 font-medium text-foreground underline decoration-dotted decoration-blue-500/60 underline-offset-4 transition-colors hover:border-blue-500/50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {formatMultiple(inputs.replacementMultiple)}
            </button>
          </p>

          {multipleUnlocked && (
            <div className="grid grid-cols-5 gap-1">
              {MULTIPLE_CHOICES.map((m) => (
                <Chip
                  key={m}
                  selected={inputs.replacementMultiple === m}
                  onSelect={() => setInputs((s) => ({ ...s, replacementMultiple: m }))}
                >
                  {formatMultiple(m)}
                </Chip>
              ))}
            </div>
          )}

          {/* ── THE BAR — Leadership IQ's rate, pictured. The blue zone's WIDTH is the
              probability; the money above is the price. Same blue, so the eye reads
              "that number belongs to that zone" — without the two ever multiplying.
              The money above does not move when this is dragged. That is the argument. ── */}
          <div className="pt-1">
            <div
              ref={trackRef}
              className="relative h-12 w-full overflow-hidden rounded-md border border-border bg-card"
            >
              <div
                className={`absolute inset-y-0 left-0 flex items-center justify-center bg-blue-500 ${
                  dragging || reduce ? "" : "transition-[width] duration-300 ease-out"
                }`}
                style={{ width: `${ratePct}%` }}
              >
                {/* The number is the control. Tapping it unlocks the divider.
                    Fills the zone (h-full = the track's 48px) rather than sitting in
                    it as 40x20px text — the zone IS the affordance, so the whole zone
                    should be the target. At the 20% lower bound the zone is still
                    ~58px wide at 320px, so the target stays above the 40px floor. */}
                <button
                  type="button"
                  onClick={() => setRateUnlocked((v) => !v)}
                  aria-expanded={rateUnlocked}
                  aria-label={`Failure rate: ${ratePct}% (Leadership IQ). Adjust.`}
                  className="flex h-full w-full items-center justify-center px-1 text-sm font-semibold tabular-nums text-white underline decoration-dotted decoration-white/60 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                >
                  {ratePct}%
                </button>
              </div>

              {/* The cited value stays visible as a tick once you walk away from it.
                  Defends against trivialization: you can SEE how far off the research
                  you have dragged, so dragging to the floor is a deliberate reach. */}
              {offCited && (
                <div
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-foreground/40"
                  style={{ left: `${citedPct}%` }}
                />
              )}

              {rateUnlocked && (
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Failure rate (Leadership IQ study)"
                  aria-valuemin={Math.round(BOUNDS.failureRate.min * 100)}
                  aria-valuemax={Math.round(BOUNDS.failureRate.max * 100)}
                  aria-valuenow={ratePct}
                  aria-valuetext={`${ratePct} percent`}
                  onKeyDown={onRateKeyDown}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(true);
                    commitRate(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (dragging) commitRate(e.clientX);
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    setDragging(false);
                  }}
                  onPointerCancel={() => setDragging(false)}
                  className="absolute inset-y-0 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-none"
                  style={{ left: `${ratePct}%` }}
                >
                  <span className="h-full w-1 rounded-full bg-foreground shadow-sm" />
                </div>
              )}
            </div>
            <p className="mt-2 text-left text-xs text-muted-foreground">
              {LOCAL_COPY.barCaption}
            </p>
          </div>

          {/* Gallup, as a SENTENCE. The ² lands after a full stop in prose, where it
              reads as a footnote — never inside a formula, where it reads as squared. */}
          <p className="text-sm text-muted-foreground">
            {LOCAL_COPY.gallup}
            <Citation n={2} />
          </p>

          {/* Your fact — the one input. A layer beneath the two big numbers. */}
          <div className="space-y-2 pt-2 text-left">
            <p className="text-sm font-medium">{LOCAL_COPY.salaryLabel}</p>
            <div className="grid grid-cols-5 gap-1">
              {SALARY_CHOICES.map((s) => (
                <Chip
                  key={s}
                  selected={inputs.salary === s}
                  onSelect={() => setInputs((prev) => ({ ...prev, salary: s }))}
                >
                  €{s / 1000}k
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* ── Beat 3 — CAUSE: the reframe. Citation closes on the sourced clause; the
            founder's claim sits visibly separate, carrying none. ── */}
        <p className="text-lg font-semibold leading-snug sm:text-xl">
          {COPY.reframe.lead} {COPY.reframe.sourced}
          <Citation n={COPY.reframe.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.reframe.claim}</span>
        </p>

        {/* ── Beat 4 — DELAY: the clock. The section's close. Same construction. ── */}
        <p className="text-lg font-semibold leading-snug sm:text-xl">
          {COPY.clock.sourced}
          <Citation n={COPY.clock.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.clock.claim}</span>
        </p>
      </div>
    </section>
  );
}
