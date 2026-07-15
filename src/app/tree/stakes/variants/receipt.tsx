/**
 * @file receipt.tsx
 * P992 stakes-section prototype — variant "THE RECEIPT".
 *
 * Thesis: the derivation IS the design. The money figure dominates, but its
 * legibility comes from reading like a bill the founder is already paying —
 * a stacked set of line-items, each carrying its own citation, closing on a
 * ruled total — rather than a single formula sentence.
 *
 * Shares math + copy with every other /tree/stakes variant via model.ts.
 * See features/p992_key_hire_risk_calculator.md for the spec this implements.
 */
import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
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

/** Superscript citation — links straight to the source (this variant has no local #references list). */
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
function ReceiptPercent({ target }: { target: number }) {
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
 * Count-up for the receipt total. Same overlay technique as program-page's
 * CountUpMoney: the animating value sits on an invisible copy of the final
 * formatted string in the same grid cell, so the surrounding layout never
 * reflows mid-count. tabular-nums keeps digit widths stable.
 *
 * Only the FIRST reveal (scroll into view) counts up from zero. Once revealed,
 * live slider drags update the figure immediately — a fresh 0→N animation on
 * every drag tick would read as broken, not as "live recompute."
 */
function ReceiptMoney({ target }: { target: number }) {
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
      <span className="col-start-1 row-start-1 text-left">{formatEur(val)}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

export function Receipt() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [failureRevealed, setFailureRevealed] = useState(false);
  const [replacementRevealed, setReplacementRevealed] = useState(false);

  const money = computeRisk(inputs);
  const hiresLabel = `${inputs.hires} key hire${inputs.hires === 1 ? "" : "s"}`;
  const failurePct = Math.round(inputs.failureRate * 100);

  return (
    <section className="px-4 py-16 lg:py-24">
      <div className="container mx-auto max-w-md space-y-8 text-center">
        {/* Beat 1 — size, the unchanged 46% (Big number 1 is the CITED constant, not the slider-adjustable receipt line below). */}
        <div>
          <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
            <ReceiptPercent target={Math.round(CITED.failureRate * 100)} />
          </p>
          <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug sm:text-xl">
            {COPY.failureStat.sourced}
            <Citation n={COPY.failureStat.ref as 1} />
          </p>
        </div>

        {/* Beat 2 — the receipt. The derivation is the design: a stacked bill, not a formula sentence. */}
        <div
          className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm sm:p-6"
          aria-label={derivationLine(inputs)}
        >
          <ul className="space-y-3 text-sm sm:text-base">
            <li className="text-muted-foreground">
              {hiresLabel} <span className="tabular-nums font-medium text-foreground">× {formatEur(inputs.salary)}</span>
            </li>
            <li className="text-muted-foreground">
              ×{" "}
              <button
                type="button"
                onClick={() => setFailureRevealed((v) => !v)}
                aria-expanded={failureRevealed}
                className="rounded-sm font-medium text-foreground underline decoration-dotted decoration-blue-500/60 underline-offset-4 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {failurePct}% fail
              </button>
              <Citation n={1} />
              {failureRevealed && (
                <div className="mt-3 mb-1 pl-1">
                  <Slider
                    value={[inputs.failureRate]}
                    min={BOUNDS.failureRate.min}
                    max={BOUNDS.failureRate.max}
                    step={BOUNDS.failureRate.step}
                    onValueChange={(vals) => setInputs((s) => ({ ...s, failureRate: vals[0] ?? s.failureRate }))}
                    aria-label="Failure rate (Leadership IQ study)"
                  />
                </div>
              )}
            </li>
            <li className="text-muted-foreground">
              ×{" "}
              <button
                type="button"
                onClick={() => setReplacementRevealed((v) => !v)}
                aria-expanded={replacementRevealed}
                className="rounded-sm font-medium text-foreground underline decoration-dotted decoration-blue-500/60 underline-offset-4 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {formatMultiple(inputs.replacementMultiple)} to replace
              </button>
              <Citation n={2} />
              {replacementRevealed && (
                <div className="mt-3 mb-1 pl-1">
                  <Slider
                    value={[inputs.replacementMultiple]}
                    min={BOUNDS.replacementMultiple.min}
                    max={BOUNDS.replacementMultiple.max}
                    step={BOUNDS.replacementMultiple.step}
                    onValueChange={(vals) => setInputs((s) => ({ ...s, replacementMultiple: vals[0] ?? s.replacementMultiple }))}
                    aria-label="Replacement cost multiple (Gallup)"
                  />
                </div>
              )}
            </li>
          </ul>

          <div className="my-4 border-t border-border" />

          <p>
            <span className="text-sm text-muted-foreground">= {COPY.moneyFraming}</span>
            <br />
            <span className="text-2xl font-bold text-blue-500 sm:text-3xl">
              <ReceiptMoney target={money} />
            </span>
          </p>

          <p className="mt-3 text-xs text-muted-foreground">
            Cited defaults above — click either multiplier to adjust it.
          </p>
        </div>

        {/* Your facts — sliders. Draggable = invited to change; coarse snap encodes the roughness. */}
        <div className="space-y-5 text-left">
          <div>
            <div className="flex items-baseline justify-between text-sm font-medium">
              <span>Key hires</span>
              <span className="tabular-nums text-muted-foreground">{inputs.hires}</span>
            </div>
            <Slider
              className="mt-2"
              value={[inputs.hires]}
              min={BOUNDS.hires.min}
              max={BOUNDS.hires.max}
              step={BOUNDS.hires.step}
              onValueChange={(vals) => setInputs((s) => ({ ...s, hires: vals[0] ?? s.hires }))}
              aria-label="Number of key hires"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between text-sm font-medium">
              <span>Annual salary</span>
              <span className="tabular-nums text-muted-foreground">{formatEur(inputs.salary)}</span>
            </div>
            <Slider
              className="mt-2"
              value={[inputs.salary]}
              min={BOUNDS.salary.min}
              max={BOUNDS.salary.max}
              step={BOUNDS.salary.step}
              onValueChange={(vals) => setInputs((s) => ({ ...s, salary: vals[0] ?? s.salary }))}
              aria-label="Annual salary per key hire"
            />
          </div>
        </div>

        {/* Beat 3 — cause. The reframe. Citation closes on the sourced clause; the claim is visibly separate, uncited. */}
        <p className="text-lg font-semibold leading-snug sm:text-xl">
          {COPY.reframe.lead} {COPY.reframe.sourced}
          <Citation n={COPY.reframe.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.reframe.claim}</span>
        </p>

        {/* Beat 4 — delay. The clock. Same citation construction: sourced clause cited, claim uncited. */}
        <p className="text-lg font-semibold leading-snug sm:text-xl">
          {COPY.clock.sourced}
          <Citation n={COPY.clock.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.clock.claim}</span>
        </p>
      </div>
    </section>
  );
}
