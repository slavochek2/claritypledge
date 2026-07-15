/**
 * @file twin-countups.tsx
 * P992 stakes-section prototype — "TWIN COUNT-UPS" variant.
 *
 * Thesis: the live section already has two giant count-ups and they work.
 * Change WHAT the second number says (money instead of an abstract 200%
 * multiplier), not how the section feels. Same rhythm, same type scale,
 * same beat order as program-page.tsx's #stakes section.
 *
 * Self-contained: owns its own RiskInputs state, imports all math/copy from
 * ../model (never duplicated), does not import from or edit program-page.tsx.
 */
import { useRef, useState, useEffect } from "react";
import { motion, useInView, useReducedMotion, animate, MotionConfig } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import {
  type RiskInputs,
  DEFAULTS,
  BOUNDS,
  CITED,
  computeRisk,
  formatEur,
  formatMultiple,
  derivationLine,
  COPY,
} from "@/app/tree/stakes/model";

const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;

/** Fade + rise when scrolled into view, once (program-page.tsx Reveal, copied). */
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

/**
 * Shared count-up mechanics (program-page.tsx CountUpPercent/CountUpMoney
 * technique, copied — not imported, per the task's file-isolation contract).
 * First entry into view counts up from 0. Later target changes (slider drags)
 * recompute with a short tween instead of restarting from 0 — "live recompute",
 * not a re-run of the full reveal animation.
 */
function useCountUp(target: number, reduce: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(reduce ? target : 0);
  const valRef = useRef(reduce ? target : 0);
  const hasEntered = useRef(false);

  useEffect(() => {
    if (reduce) {
      valRef.current = target;
      setVal(target);
      return;
    }
    if (!inView) return;
    const from = hasEntered.current ? valRef.current : 0;
    const duration = hasEntered.current ? 0.3 : 1.1;
    hasEntered.current = true;
    const controls = animate(from, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        valRef.current = v;
        setVal(v);
      },
    });
    return () => controls.stop();
  }, [inView, target, reduce]);

  return { ref, val };
}

function CountUpPercent({ target }: { target: number }) {
  const reduce = useReducedMotion();
  const { ref, val } = useCountUp(target, !!reduce);
  return <span ref={ref}>{Math.round(val)}%</span>;
}

/**
 * Overlays the animating value on an invisible copy of the final value in the
 * same grid cell, so the surrounding layout reserves final width and never
 * reflows mid-count. tabular-nums keeps digit widths stable as they change.
 */
function CountUpMoney({ target, className }: { target: number; className?: string }) {
  const reduce = useReducedMotion();
  const { ref, val } = useCountUp(target, !!reduce);
  return (
    <span ref={ref} className={`inline-grid tabular-nums ${className ?? ""}`}>
      <span className="col-start-1 row-start-1">{formatEur(Math.round(val))}</span>
      <span aria-hidden className="col-start-1 row-start-1 invisible">{formatEur(target)}</span>
    </span>
  );
}

/**
 * The "twin" type scale. Deliberately smaller than program-page.tsx's literal
 * text-7xl sm:text-8xl at the narrowest breakpoint: the money figure must not
 * overflow at max inputs (10 x EUR300k -> EUR2,760,000) at 320px, and both
 * numbers use the SAME scale so they read as twins. Matches the live rhythm
 * from sm: up.
 */
const BIG_NUMBER_CLASS = "text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-blue-500 tracking-tight";

export function TwinCountUps() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [revealed, setRevealed] = useState({ failureRate: false, replacementMultiple: false });

  const money = computeRisk(inputs);

  return (
    <MotionConfig reducedMotion="user">
      <section className="px-4 py-20 lg:py-28 border-t border-border">
        <Reveal className="container mx-auto max-w-3xl text-center">
          {/* Beat 1 — size, number 1: 46%, unchanged from P987. Not driven by the
              failureRate slider below — this is the fixed, cited headline stat. */}
          <p className={BIG_NUMBER_CLASS}>
            <CountUpPercent target={CITED.failureRate * 100} />
          </p>
          <p className="mt-4 text-lg sm:text-xl font-semibold leading-snug max-w-md mx-auto">
            {COPY.failureStat.sourced}
            <sup className="ml-0.5 text-[0.6em] font-normal text-blue-500">{COPY.failureStat.ref}</sup>
          </p>

          {/* Beat 2 — size, number 2: the money. Replaces the 200% slot. */}
          <p className="mt-14 text-xs uppercase tracking-widest text-muted-foreground">
            {COPY.moneyFraming}, this is what replacing them costs you
          </p>
          <p className={`mt-2 ${BIG_NUMBER_CLASS}`}>
            <CountUpMoney target={money} />
          </p>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
            {derivationLine(inputs)}
          </p>

          {/* The research — locked by default, click a number to reveal its slider.
              No box, no unlock chrome: the number IS the control. */}
          <p className="mt-3 text-sm text-muted-foreground">
            Not what you&apos;ve seen?{" "}
            <button
              type="button"
              onClick={() => setRevealed((r) => ({ ...r, failureRate: true }))}
              className="text-blue-500 hover:text-blue-600 underline underline-offset-2"
            >
              Adjust the {Math.round(inputs.failureRate * 100)}%<sup className="text-[0.7em]">1</sup>
            </button>{" "}
            or{" "}
            <button
              type="button"
              onClick={() => setRevealed((r) => ({ ...r, replacementMultiple: true }))}
              className="text-blue-500 hover:text-blue-600 underline underline-offset-2"
            >
              the {formatMultiple(inputs.replacementMultiple)}<sup className="text-[0.7em]">2</sup>
            </button>
            .
          </p>

          {(revealed.failureRate || revealed.replacementMultiple) && (
            <div className="mt-4 max-w-xs mx-auto space-y-4 text-left">
              {revealed.failureRate && (
                <div>
                  <label className="flex justify-between text-xs text-muted-foreground">
                    <span>Failure rate — Leadership IQ</span>
                    <span>{Math.round(inputs.failureRate * 100)}%</span>
                  </label>
                  <Slider
                    aria-label="Failure rate"
                    className="mt-2"
                    value={[inputs.failureRate]}
                    min={BOUNDS.failureRate.min}
                    max={BOUNDS.failureRate.max}
                    step={BOUNDS.failureRate.step}
                    onValueChange={(v) => setInputs((i) => ({ ...i, failureRate: v[0] ?? i.failureRate }))}
                  />
                </div>
              )}
              {revealed.replacementMultiple && (
                <div>
                  <label className="flex justify-between text-xs text-muted-foreground">
                    <span>Replacement cost — Gallup</span>
                    <span>{formatMultiple(inputs.replacementMultiple)}</span>
                  </label>
                  <Slider
                    aria-label="Replacement multiple"
                    className="mt-2"
                    value={[inputs.replacementMultiple]}
                    min={BOUNDS.replacementMultiple.min}
                    max={BOUNDS.replacementMultiple.max}
                    step={BOUNDS.replacementMultiple.step}
                    onValueChange={(v) => setInputs((i) => ({ ...i, replacementMultiple: v[0] ?? i.replacementMultiple }))}
                  />
                </div>
              )}
            </div>
          )}

          {/* Your facts — always-visible sliders. Draggable = invited to change. */}
          <div className="mt-8 max-w-xs mx-auto space-y-5 text-left">
            <div>
              <label className="flex justify-between text-sm font-medium">
                <span>Key hires</span>
                <span>{inputs.hires}</span>
              </label>
              <Slider
                aria-label="Key hires"
                className="mt-2"
                value={[inputs.hires]}
                min={BOUNDS.hires.min}
                max={BOUNDS.hires.max}
                step={BOUNDS.hires.step}
                onValueChange={(v) => setInputs((i) => ({ ...i, hires: v[0] ?? i.hires }))}
              />
            </div>
            <div>
              <label className="flex justify-between text-sm font-medium">
                <span>Annual salary, each</span>
                <span>{formatEur(inputs.salary)}</span>
              </label>
              <Slider
                aria-label="Annual salary"
                className="mt-2"
                value={[inputs.salary]}
                min={BOUNDS.salary.min}
                max={BOUNDS.salary.max}
                step={BOUNDS.salary.step}
                onValueChange={(v) => setInputs((i) => ({ ...i, salary: v[0] ?? i.salary }))}
              />
            </div>
          </div>

          {/* Beat 3 — cause. The reframe. Citation closes on the sourced clause;
              the claim carries no citation and renders as visibly separate prose. */}
          <p className="mt-14 text-lg sm:text-xl leading-relaxed max-w-xl mx-auto">
            {COPY.reframe.lead}{" "}
            {COPY.reframe.sourced}
            <sup className="ml-0.5 text-[0.6em] font-normal text-blue-500">{COPY.reframe.ref}</sup>
          </p>
          <p className="mt-2 text-lg sm:text-xl font-medium leading-relaxed max-w-xl mx-auto text-foreground/80">
            {COPY.reframe.claim}
          </p>

          {/* Beat 4 — delay. The clock. Section's close, then hands off to the CTA. */}
          <p className="mt-10 text-lg sm:text-xl leading-relaxed max-w-xl mx-auto">
            {COPY.clock.sourced}
            <sup className="ml-0.5 text-[0.6em] font-normal text-blue-500">{COPY.clock.ref}</sup>
          </p>
          <p className="mt-2 text-lg sm:text-xl font-medium leading-relaxed max-w-xl mx-auto text-foreground/80">
            {COPY.clock.claim}
          </p>
        </Reveal>
      </section>
    </MotionConfig>
  );
}
