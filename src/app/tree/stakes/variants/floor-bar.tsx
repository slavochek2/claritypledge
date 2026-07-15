/**
 * @file floor-bar.tsx
 * P992 stakes-section prototype variant — "THE FLOOR THAT STILL HURTS".
 *
 * Thesis: the argument isn't "here's a scary number", it's "even YOUR most
 * conservative number is scary." A horizontal bar renders the money figure
 * alongside the digits. A persistent floor marker sits on the bar at the
 * position the founder's own most-conservative research assumptions reach —
 * the mechanism itself is dramatized, not just stated.
 *
 * Imports all math + copy from ../model — never duplicates either.
 * See features/p992_key_hire_risk_calculator.md for the spec this implements.
 */
import { useEffect, useRef, useState } from "react";
import { motion, animate, useInView, useReducedMotion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import {
  type RiskInputs,
  DEFAULTS,
  BOUNDS,
  CITED,
  COPY,
  REFS,
  computeRisk,
  computeFloor,
  formatEur,
  formatMultiple,
  derivationLine,
} from "../model";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Shared count-up primitive (presi countUp port, generalized). Animates from
 * whatever was last displayed to the new target — NOT always from zero — so
 * live slider drags recompute smoothly instead of restarting every tick.
 * Reduced motion: jump straight to target, no animation frames at all.
 */
function useCountUp(target: number, active: boolean, reduce: boolean | null): number {
  const [val, setVal] = useState(reduce ? target : 0);
  const prevTarget = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce || !active) {
      setVal(target);
      prevTarget.current = target;
      return;
    }
    const controls = animate(prevTarget.current, target, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    prevTarget.current = target;
    return () => controls.stop();
  }, [active, target, reduce]);
  return val;
}

/** Big number 1 — 46%, unchanged, cited, never bound to the interactive slider. */
function BigFailureRate() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const target = Math.round(CITED.failureRate * 100);
  const val = useCountUp(target, inView, reduce);
  return (
    <span ref={ref} className="text-6xl sm:text-7xl font-bold text-blue-500 tracking-tight">
      {val}%
    </span>
  );
}

/**
 * Big number 2 — the money. Overlays the animating value on an invisible copy
 * of the final value in the same grid cell (CountUpMoney's technique, ported
 * here since this file must not import from program-page.tsx) so the layout
 * never reflows mid-count. tabular-nums keeps digit widths stable.
 */
function BigMoney({ target, reduce }: { target: number; reduce: boolean | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const val = useCountUp(target, inView, reduce);
  return (
    <span
      ref={ref}
      className="inline-grid tabular-nums text-4xl sm:text-5xl font-bold tracking-tight text-foreground"
    >
      <span className="col-start-1 row-start-1 text-left">{formatEur(val)}</span>
      <span aria-hidden className="col-start-1 row-start-1 invisible text-left">
        {formatEur(target)}
      </span>
    </span>
  );
}

interface LockedMultiplierProps {
  label: string;
  hint: string;
  valueLabel: string;
  refNum: 1 | 2;
  revealed: boolean;
  onReveal: () => void;
  sliderValue: number;
  bounds: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  ariaLabel: string;
}

/**
 * "The research" affordance — locked, stated as cited fact. One line of hint
 * text; clicking the NUMBER ITSELF reveals its slider. No box, no unlock
 * chrome. This is the door the skeptic gets, not a toy presented up front.
 */
function LockedMultiplier({
  label,
  hint,
  valueLabel,
  refNum,
  revealed,
  onReveal,
  sliderValue,
  bounds,
  onChange,
  ariaLabel,
}: LockedMultiplierProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {label}{" "}
        <button
          type="button"
          onClick={onReveal}
          className="rounded px-1 py-1.5 -mx-1 font-semibold text-blue-600 underline decoration-dotted underline-offset-4 hover:text-blue-700"
        >
          {valueLabel}
        </button>
        <sup className="ml-0.5 text-[0.65em] font-normal">
          <a href={`#ref-${refNum}`} className="text-blue-600 hover:text-blue-700">
            {refNum}
          </a>
        </sup>
      </p>
      {!revealed && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {revealed && (
        <div className="mt-2">
          <Slider
            aria-label={ariaLabel}
            value={[sliderValue]}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            onValueChange={(v) => {
              if (v[0] !== undefined) onChange(v[0]);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function FloorBar() {
  const reduce = useReducedMotion();
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [failureRevealed, setFailureRevealed] = useState(false);
  const [replacementRevealed, setReplacementRevealed] = useState(false);

  const money = computeRisk(inputs);
  const floor = computeFloor(inputs);
  // Reference scale for the bar: money at the CITED defaults — "the number
  // you were first shown." Dragging both multipliers to their conservative
  // bound shrinks the bar toward the floor marker; it can never cross it,
  // because the floor is computed at those same bounds.
  const ceiling = inputs.hires * inputs.salary * CITED.failureRate * CITED.replacementMultiple;
  const fillPct = clamp((money / ceiling) * 100, 0, 100);
  const floorPct = clamp((floor / ceiling) * 100, 0, 100);

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16 text-center space-y-10">
      {/* Beat 1 — size, the rate. Unchanged from P987. */}
      <div>
        <BigFailureRate />
        <p className="mt-4 text-lg font-semibold leading-snug">
          {COPY.failureStat.sourced}
          <sup className="ml-0.5 text-[0.6em] font-normal">
            <a href="#ref-1" className="text-blue-600 hover:text-blue-700">
              {COPY.failureStat.ref}
            </a>
          </sup>
        </p>
      </div>

      {/* Beat 2 — size, the money. Bar + figure + derivation + facts + research. */}
      <div className="text-left space-y-4">
        <p className="text-center text-sm font-medium text-muted-foreground">
          {COPY.moneyFraming}, this is what it costs you
        </p>
        <div className="text-center">
          <BigMoney target={Math.round(money)} reduce={reduce} />
        </div>

        <div className="relative pt-1 pb-5">
          <div className="relative h-8 sm:h-9 w-full overflow-hidden rounded-full border border-border bg-muted/40">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
              initial={false}
              animate={{ width: `${fillPct}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/50"
              style={{ left: `${floorPct}%` }}
              aria-hidden
            />
          </div>
          <div
            className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
            style={{ left: `${floorPct}%` }}
          >
            floor: {formatEur(floor)}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">{derivationLine(inputs)}</p>

        <div className="space-y-5 pt-2">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Key hires</span>
              <span className="font-semibold tabular-nums">{inputs.hires}</span>
            </div>
            <Slider
              aria-label="Number of key hires"
              className="mt-2"
              value={[inputs.hires]}
              min={BOUNDS.hires.min}
              max={BOUNDS.hires.max}
              step={BOUNDS.hires.step}
              onValueChange={(v) => {
                if (v[0] !== undefined) setInputs((p) => ({ ...p, hires: v[0] as number }));
              }}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Annual salary</span>
              <span className="font-semibold tabular-nums">{formatEur(inputs.salary)}</span>
            </div>
            <Slider
              aria-label="Annual salary per key hire"
              className="mt-2"
              value={[inputs.salary]}
              min={BOUNDS.salary.min}
              max={BOUNDS.salary.max}
              step={BOUNDS.salary.step}
              onValueChange={(v) => {
                if (v[0] !== undefined) setInputs((p) => ({ ...p, salary: v[0] as number }));
              }}
            />
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <LockedMultiplier
              label="Fail rate:"
              hint="Leadership IQ's own number — click to test how low you're willing to go."
              valueLabel={`${Math.round(inputs.failureRate * 100)}%`}
              refNum={1}
              revealed={failureRevealed}
              onReveal={() => setFailureRevealed(true)}
              sliderValue={inputs.failureRate}
              bounds={BOUNDS.failureRate}
              onChange={(v) => setInputs((p) => ({ ...p, failureRate: v }))}
              ariaLabel="Failure rate assumption"
            />
            <LockedMultiplier
              label="Replacement cost:"
              hint="Gallup's own number — click to test how low you're willing to go."
              valueLabel={formatMultiple(inputs.replacementMultiple)}
              refNum={2}
              revealed={replacementRevealed}
              onReveal={() => setReplacementRevealed(true)}
              sliderValue={inputs.replacementMultiple}
              bounds={BOUNDS.replacementMultiple}
              onChange={(v) => setInputs((p) => ({ ...p, replacementMultiple: v }))}
              ariaLabel="Replacement cost multiplier"
            />
          </div>
        </div>
      </div>

      {/* Beat 3 — cause, the reframe. Citation closes on the sourced clause only;
          the claim renders as visibly separate, uncited prose. */}
      <div className="text-left space-y-2">
        <p className="text-base leading-relaxed">
          {COPY.reframe.lead} {COPY.reframe.sourced}
          <sup className="ml-0.5 text-[0.6em] font-normal">
            <a href="#ref-1" className="text-blue-600 hover:text-blue-700">
              {COPY.reframe.ref}
            </a>
          </sup>
        </p>
        <p className="text-base leading-relaxed italic text-muted-foreground">
          {COPY.reframe.claim}
        </p>
      </div>

      {/* Beat 4 — delay, the clock. Same citation construction. Section's close. */}
      <div className="text-left space-y-2">
        <p className="text-base leading-relaxed">
          {COPY.clock.sourced}
          <sup className="ml-0.5 text-[0.6em] font-normal">
            <a href="#ref-1" className="text-blue-600 hover:text-blue-700">
              {COPY.clock.ref}
            </a>
          </sup>
        </p>
        <p className="text-base leading-relaxed italic text-muted-foreground">
          {COPY.clock.claim}
        </p>
      </div>

      <div id="references" className="border-t border-border pt-4 text-left text-xs text-muted-foreground space-y-1">
        <p id="ref-1">
          [1] {REFS[1].label}
        </p>
        <p id="ref-2">
          [2] {REFS[2].label}
        </p>
      </div>
    </section>
  );
}
