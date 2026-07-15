/**
 * @file person-tiles.tsx
 * P992 stakes-section prototype — "PERSON TILES" variant.
 *
 * Thesis: a percentage is abstract; people are not. The 46% failure rate stops
 * being a statistic and becomes "these two, out of your five" — headcount
 * renders as a row of person-shaped tiles, and the failing share is drawn as a
 * literal region of each tile (hollow outline + a crack line + reduced
 * opacity), never a red/amber/orange fill. The fractional remainder (e.g.
 * 46% of 5 = 2.3 people) is rendered as a partial tile: the failed treatment
 * fills only the bottom `frac` share of that one tile's height, so a reader
 * sees two whole failures and one hire "partway there" rather than a
 * rounded-off number.
 *
 * Reads against features/p992_key_hire_risk_calculator.md + model.ts's
 * invariants: the 89% never enters computeRisk(), the two research
 * multipliers (46%, 2x) are locked-by-default and revealed only by clicking
 * the number itself, and every `sourced` string from model.ts renders
 * verbatim with its citation closing on that clause — never the sentence.
 */
import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import {
  BOUNDS,
  COPY,
  DEFAULTS,
  REFS,
  computeRisk,
  derivationLine,
  formatEur,
  formatMultiple,
  type RiskInputs,
} from "@/app/tree/stakes/model";

/** A tile is fully healthy, fully failed, or partly failed (the fractional remainder). */
type TileState = "healthy" | "failed" | number;

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

/** Head + torso silhouette. Fill/stroke come from the wrapping className so the
 * same shape can render as a solid blue "healthy" fill or a hollow outline. */
function PersonShape({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 32"
      strokeWidth={strokeWidth}
      className={`absolute inset-0 h-full w-full ${className ?? ""}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="6" />
      <path d="M2 31c0-9.5 4.5-15 10-15s10 5.5 10 15" />
    </svg>
  );
}

/** A jagged break across the torso — reads as "cracked" without any hue. */
function CrackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 32" className={`absolute inset-0 h-full w-full ${className ?? ""}`} aria-hidden="true">
      <path
        d="M13 12 L10.5 18 L14 21 L11 28"
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One key hire. The healthy (blue-filled) and failed (hollow + cracked, dimmed)
 * versions of the SAME shape are stacked and each clipped to a vertical band —
 * the failed band grows from the bottom, so a partial tile reads as "sinking",
 * not as a rounding artifact.
 */
function PersonTile({ state, index, reduceMotion }: { state: TileState; index: number; reduceMotion: boolean }) {
  const failedPortion = state === "healthy" ? 0 : state === "failed" ? 1 : state;
  const label =
    state === "healthy"
      ? "expected to succeed"
      : state === "failed"
        ? "expected to fail within 18 months"
        : `${Math.round(state * 100)}% likelihood of failing within 18 months`;
  const transitionClass = reduceMotion ? "" : "transition-[clip-path] duration-500 ease-out";

  return (
    <div
      className="relative h-12 w-8 shrink-0 sm:h-16 sm:w-12"
      role="img"
      aria-label={`Key hire ${index + 1}: ${label}`}
    >
      <div
        className={`absolute inset-0 overflow-hidden ${transitionClass}`}
        style={{ clipPath: `inset(0 0 ${failedPortion * 100}% 0)` }}
      >
        <PersonShape className="fill-blue-500" />
      </div>
      {failedPortion > 0 && (
        <div
          className={`absolute inset-0 overflow-hidden ${transitionClass}`}
          style={{ clipPath: `inset(${(1 - failedPortion) * 100}% 0 0 0)` }}
        >
          <PersonShape className="fill-none stroke-muted-foreground opacity-60" strokeWidth={1.5} />
          <CrackMark className="text-muted-foreground/80" />
        </div>
      )}
    </div>
  );
}

/**
 * Count-up for the money figure. Same technique as program-page.tsx's
 * CountUpMoney — overlay the animating value on an invisible copy of the final
 * value in the same grid cell so the surrounding layout never reflows
 * mid-count, tabular-nums keeps digit widths stable. Copied rather than
 * imported per the build brief (variant files are self-contained).
 */
function CountUpMoney({ target }: { target: number }) {
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
  return (
    <span ref={ref} className="inline-grid tabular-nums">
      <span className="col-start-1 row-start-1">{formatEur(val)}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

const NUMBER_BUTTON_CLASS =
  "font-semibold text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm";

export function PersonTiles() {
  const reduceMotion = !!useReducedMotion();
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [failureRevealed, setFailureRevealed] = useState(false);
  const [replacementRevealed, setReplacementRevealed] = useState(false);

  const updateInputs = (patch: Partial<RiskInputs>) => setInputs((prev) => ({ ...prev, ...patch }));

  const money = computeRisk(inputs);
  const failedCount = inputs.hires * inputs.failureRate;
  const fullFailed = Math.min(inputs.hires, Math.floor(failedCount));
  const fracFailed = failedCount - fullFailed;

  const tileStates: TileState[] = Array.from({ length: inputs.hires }, (_, i) => {
    if (i < fullFailed) return "failed";
    if (i === fullFailed && fracFailed > 0.005) return fracFailed;
    return "healthy";
  });

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="container mx-auto max-w-2xl space-y-12 text-center">
        {/* Beat 1 — size, made concrete: headcount slider + person tiles. */}
        <div>
          <label htmlFor="hires-slider" className="block text-sm font-medium text-muted-foreground">
            How many key hires are you making?
          </label>
          <div className="mx-auto mt-3 flex max-w-xs items-center gap-4">
            <Slider
              id="hires-slider"
              value={[inputs.hires]}
              min={BOUNDS.hires.min}
              max={BOUNDS.hires.max}
              step={BOUNDS.hires.step}
              onValueChange={(v) => {
                const next = v[0];
                if (next !== undefined) updateInputs({ hires: next });
              }}
            />
            <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
              {inputs.hires} hire{inputs.hires === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-end justify-center gap-2 sm:gap-3">
            {tileStates.map((state, i) => (
              <PersonTile key={i} state={state} index={i} reduceMotion={reduceMotion} />
            ))}
          </div>
          <p className="sr-only">
            {fullFailed} of {inputs.hires} key hire{inputs.hires === 1 ? "" : "s"} expected to fail within 18 months
            {fracFailed > 0.005 ? `, plus roughly a ${Math.round(fracFailed * 100)}% chance for one more` : ""}.
          </p>

          <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
            <button type="button" onClick={() => setFailureRevealed((v) => !v)} className={NUMBER_BUTTON_CLASS}>
              {Math.round(inputs.failureRate * 100)}%
            </button>{" "}
            {COPY.failureStat.sourced}
            <Cite n={COPY.failureStat.ref} />.
            <span className="mt-0.5 block text-xs">tap the number to adjust</span>
          </p>
          {failureRevealed && (
            <div className="mx-auto mt-3 max-w-xs">
              <Slider
                value={[inputs.failureRate]}
                min={BOUNDS.failureRate.min}
                max={BOUNDS.failureRate.max}
                step={BOUNDS.failureRate.step}
                onValueChange={(v) => {
                  const next = v[0];
                  if (next !== undefined) updateInputs({ failureRate: next });
                }}
              />
            </div>
          )}
        </div>

        {/* Beat 2 — size: the money, derivation legible at rest beneath it. */}
        <div>
          <label htmlFor="salary-slider" className="block text-sm font-medium text-muted-foreground">
            Annual salary, per hire
          </label>
          <div className="mx-auto mt-3 flex max-w-xs items-center gap-4">
            <Slider
              id="salary-slider"
              value={[inputs.salary]}
              min={BOUNDS.salary.min}
              max={BOUNDS.salary.max}
              step={BOUNDS.salary.step}
              onValueChange={(v) => {
                const next = v[0];
                if (next !== undefined) updateInputs({ salary: next });
              }}
            />
            <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums">
              {formatEur(inputs.salary)}
            </span>
          </div>

          <p className="mt-8 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {COPY.moneyFraming}, that costs you
          </p>
          <p className="mt-1 text-4xl font-bold leading-tight tracking-tight text-blue-500 sm:text-6xl lg:text-7xl">
            <CountUpMoney target={money} />
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{derivationLine(inputs)}</p>

          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Replacing them costs about{" "}
            <button type="button" onClick={() => setReplacementRevealed((v) => !v)} className={NUMBER_BUTTON_CLASS}>
              {formatMultiple(inputs.replacementMultiple)}
            </button>{" "}
            their annual salary
            <Cite n={2} />.
            <span className="mt-0.5 block text-xs">tap the number to adjust</span>
          </p>
          {replacementRevealed && (
            <div className="mx-auto mt-3 max-w-xs">
              <Slider
                value={[inputs.replacementMultiple]}
                min={BOUNDS.replacementMultiple.min}
                max={BOUNDS.replacementMultiple.max}
                step={BOUNDS.replacementMultiple.step}
                onValueChange={(v) => {
                  const next = v[0];
                  if (next !== undefined) updateInputs({ replacementMultiple: next });
                }}
              />
            </div>
          )}
        </div>

        {/* Beat 3 — cause, the reframe. `lead` + `sourced` carry ref[1] closing on
            the sourced clause; `claim` is a separate paragraph, uncited, visibly
            the founder's own thesis standing beside the research. */}
        <div className="space-y-2">
          <p className="text-lg font-medium leading-snug sm:text-xl">
            {COPY.reframe.lead}{" "}
            <span>
              {COPY.reframe.sourced}
              <Cite n={COPY.reframe.ref} />
            </span>
          </p>
          <p className="text-lg font-semibold leading-snug text-muted-foreground sm:text-xl">{COPY.reframe.claim}</p>
        </div>

        {/* Beat 4 — delay, the clock. Section's close; same sourced/claim split. */}
        <div className="space-y-2">
          <p className="text-lg font-medium leading-snug sm:text-xl">
            {COPY.clock.sourced}
            <Cite n={COPY.clock.ref} />
          </p>
          <p className="text-lg font-semibold leading-snug text-muted-foreground sm:text-xl">{COPY.clock.claim}</p>
        </div>
      </div>
    </div>
  );
}
