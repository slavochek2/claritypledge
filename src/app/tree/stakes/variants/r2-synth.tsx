/**
 * @file r2-synth.tsx
 * P992 stakes-section prototype — variant "R2 · SYNTHESIS".
 *
 * The founder's pick, assembled from three round-2 variants and round 1's
 * winner. Not a fifth exploration — the convergence of what survived review.
 *
 * TWO SECTIONS, ONE SPLIT: what is TRUE (the finding) / what it COSTS YOU (the
 * calculator). The finding is P987's shipped headline verbatim and carries no
 * controls at all; the calculator holds every adjustable number and no uncited
 * prose. Round 1 interleaved them, which is why a reader could not tell whether
 * the money was a finding or an estimate. The seam is now the point.
 *
 * SCOPE, ONCE THIS INTEGRATES: P992 deletes P987's 200% count-up block and puts
 * the calculator in its place. The 46% block above it is untouched. The 200% was
 * an abstract multiplier the reader had to convert into money themselves; the
 * calculator does it in their own numbers, which is the whole feature.
 *
 * ONE CITATION STYLE, PAGE-WIDE [FOUNDER DECISION 2026-07-15]: source names
 * replace P987's bare superscripts everywhere, not only here — a page showing
 * "[1]" in one section and "(Leadership IQ)" in the next reads as an oversight.
 * That couples P992 to P987: this cannot ship until P987 does, and integration
 * must convert P987's remaining refs (Axios and the rest) in the same pass, or
 * the inconsistency it fixes is the inconsistency it leaves behind.
 *
 * FROM r2-wild ("the ad"): THE INPUT IS ONE SENTENCE. Founder, on the annotated
 * screenshot: "i like this one!" against `1 key hire at 120.000 € a year.` So
 * headcount is a pill in that sentence, and r2-direct's ten-figure row is GONE.
 * The row was answering "46% of WHAT?" pictorially, but it cost a whole visual
 * system to say what four words say in place.
 *
 * FROM the receipt (round 1's winner): THE MATH IS A STACKED BILL. Founder:
 * "i like this calcuation it feels like math!" Factors stack, each on its own
 * line, closing on a ruled total. The AD's sentence IS the stack's first line,
 * so the two compose without restating anything.
 *
 * FROM r2-clock: THE SOURCE IS NAMED, NOT NUMBERED. r2-direct bound the citation
 * to the cited VALUE — scrub 46% to 38% and the marker detaches, so a study is
 * never credited for a number it never published. Correct, and r2-direct's own
 * review named its fatal flaw: a 4x13px "[1]" vanishing is below the threshold
 * of attention — "epistemically exact and communicatively silent." Rendering the
 * source's NAME fixes exactly that: "(Leadership IQ)" becoming "(yours)" is
 * unmissable. Same gate, now perceptible. It also retires the founder's
 * "reads as replace-squared" flag at the root — a name cannot be an exponent.
 *
 * WHAT THE HEADER MAY NOT SAY. The total is COST TO REPLACE — Gallup's 200% is
 * re-recruiting, onboarding and ramp. It is not "revenue at risk" (money not
 * earned; neither study measured it) and the 46% is not "turnover" (that
 * includes tenured staff quitting — a different population). Both were proposed
 * and both were rejected here: relabelling a spend as forgone income is the
 * exact trade docs/decisions.md 2026-06-05 logs as the page's thesis smuggled
 * into a stat. The header states the noun the sources actually support.
 *
 * Math + every `sourced` string come from model.ts, which this file never edits.
 * Framing/label copy defined locally is marked LOCAL COPY with its reason.
 *
 * Spec: features/p992_key_hire_risk_calculator.md
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
  derivationLine,
  formatEur,
  formatMultiple,
  type RiskInputs,
} from "@/app/tree/stakes/model";

type Bounds = { readonly min: number; readonly max: number; readonly step: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Snap to the bound's step and strip float dust (0.1-steps accumulate it fast). */
function snap(n: number, b: Bounds): number {
  const decimals = (String(b.step).split(".")[1] ?? "").length;
  const stepped = Math.round((n - b.min) / b.step) * b.step + b.min;
  return clamp(Number(stepped.toFixed(decimals)), b.min, b.max);
}

/** LOCAL COPY — the calculator's header. [FOUNDER DECISION: chosen 2026-07-15
 *  over "revenue at risk due to turnover", which the sources do not support.] */
const CALC_HEADER = "What it costs to replace them";

/** The published name behind each reference. REFS carries URL + full label; the
 *  prose needs the short name a reader already recognises. */
const SOURCE_NAME = { 1: "Leadership IQ", 2: "Gallup" } as const;

/**
 * A source, named and linked. Never rendered inside a control: a citation is
 * evidence, not an affordance — so it is never tinted, and never sits within
 * the pill it attributes.
 */
function Source({ n }: { n: 1 | 2 }) {
  const r = REFS[n];
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      title={r.label}
      className="whitespace-nowrap font-normal text-blue-500 hover:text-blue-600"
    >
      ({SOURCE_NAME[n]})
    </a>
  );
}

/**
 * THE CITATION GATE — r2-direct's position A, rendered in r2-clock's treatment.
 *
 * `cited` holds only while the live value still equals the published one. Drift
 * it and the study's name is REPLACED by "(yours)" — not merely dropped. The
 * replacement is the point: an absence is invisible, a substitution is read.
 *
 * Structural, not a matter of remembering to. This is the spec's highest-listed
 * risk (docs/decisions.md 2026-06-05) caught on its return leg: not the thesis
 * wearing the source's citation, but the founder's own number wearing it.
 */
function SourceTag({ live, cited, n }: { live: number; cited: number; n: 1 | 2 }) {
  if (live !== cited) return <span className="font-normal text-muted-foreground/80"> (yours)</span>;
  return (
    <>
      {" "}
      <Source n={n} />
    </>
  );
}

/** Count-up for the 46% headline — P987/program-page treatment, ported unchanged. */
function CountPercent({ target }: { target: number }) {
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
 * Count-up for the total. Only the first scroll-in reveal animates from zero —
 * after that, scrubbing updates the figure immediately, because a fresh 0→N
 * count on every drag tick reads as broken rather than as live. The animating
 * value overlays an invisible copy of the final string in the same grid cell so
 * the line never reflows mid-count; tabular-nums holds digit widths.
 */
function CountMoney({ target }: { target: number }) {
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
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

/**
 * THE TINT — and the one distinction it is allowed to encode.
 *
 * Blind review found the defect this fixes: tinting every adjustable number
 * identically made "46%" (Leadership IQ's finding) and "120.000 €" (the
 * founder's own figure) the same kind of object. Its words: identical styling
 * "risks a founder trying to overwrite a source-backed number as if it were
 * their own assumption — blurring 'the study says' from 'you get to change
 * this'." Both ARE adjustable, so the affordance was honest; but the section's
 * claim to credibility rests on whose number is whose, and one costume erased it.
 *
 * So the fill carries exactly what the source tag carries:
 *
 *   FILLED  = yours. You set this, or you moved it off what was published.
 *   OUTLINE = theirs. Still the study's number, still grabbable — the dashed
 *             edge says the door is open without claiming the number as yours.
 *
 * One mechanism, not two: a research value FILLS at the same instant its tag
 * stops saying "(Leadership IQ)" and starts saying "(yours)". State and
 * attribution change together because they are the same fact.
 */
const PILL = "inline-flex min-h-[44px] select-none items-center rounded-md px-1.5 align-middle font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PILL_YOURS = "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20";
const PILL_THEIRS = "border border-dashed border-blue-500/50 text-foreground hover:bg-blue-500/10";
const PILL_ACTIVE = "bg-blue-500 text-white";

/** Whose number this is — the only thing the fill is permitted to mean. */
type Tone = "yours" | "theirs";
const toneClass = (tone: Tone) => (tone === "yours" ? PILL_YOURS : PILL_THEIRS);

/**
 * THE SCRUBBER — the only input primitive in this variant.
 *
 * The number in the sentence IS the control: press it and drag sideways and it
 * moves. No track, no thumb, no rail, nothing to fill in. The founder's
 * annotated screenshot picked this sentence over a row of sliders; sliders are
 * form controls wearing a costume, and this section is not a form.
 *
 * Semantically a spinbutton, which is what makes it keyboard- and
 * screen-reader-operable without a visible form control existing anywhere:
 * arrows step, PageUp/PageDown jump ten, Home/End reach the bounds. Removing the
 * widget must not remove the operability — see the spec's accessibility invariant.
 *
 * touch-pan-y (not touch-none): a thumb dragging sideways scrubs, a thumb
 * dragging down still scrolls the page. Trapping page scroll on a number would
 * be a worse defect than the slider this replaces.
 */
function Scrubber({
  value,
  bounds,
  onChange,
  format,
  label,
  valueText,
  pxPerStep,
  tone,
  autoFocus = false,
}: {
  value: number;
  bounds: Bounds;
  onChange: (n: number) => void;
  format: (n: number) => string;
  label: string;
  valueText: (n: number) => string;
  pxPerStep: number;
  tone: Tone;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, v: value };
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current?.focus();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = snap(d.v + ((e.clientX - d.x) / pxPerStep) * bounds.step, bounds);
    if (next !== value) onChange(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setActive(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + bounds.step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - bounds.step;
    else if (e.key === "PageUp") next = value + bounds.step * 10;
    else if (e.key === "PageDown") next = value - bounds.step * 10;
    else if (e.key === "Home") next = bounds.min;
    else if (e.key === "End") next = bounds.max;
    if (next === null) return;
    e.preventDefault();
    onChange(snap(next, bounds));
  };

  return (
    <span
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuetext={valueText(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={`${PILL} cursor-ew-resize touch-pan-y ${active ? PILL_ACTIVE : toneClass(tone)}`}
    >
      {format(value)}
    </span>
  );
}

/**
 * A research figure at rest: stated as cited fact, and outlined rather than
 * filled, because it is still the study's number — adjustable, but not yours
 * until you move it. The founder chose to keep the skeptic's door open rather
 * than render the studies as untouchable text. Press it and it becomes a
 * Scrubber in place. The spec's reason for not shipping a prominent control is
 * that fiddling must not look like the main event; the reason for opening at all
 * is that a claim you cannot interrogate is a claim you can only take or leave.
 *
 * The SR label carries "Press to adjust" because the outline can't.
 */
function ResearchValue({
  locked,
  onUnlock,
  display,
  scrubber,
  lockedLabel,
  tone,
}: {
  locked: boolean;
  onUnlock: () => void;
  display: string;
  scrubber: React.ReactNode;
  lockedLabel: string;
  tone: Tone;
}) {
  if (!locked) return <>{scrubber}</>;
  return (
    <button type="button" onClick={onUnlock} aria-label={lockedLabel} className={`${PILL} ${toneClass(tone)}`}>
      {display}
    </button>
  );
}

/**
 * ── SECTION 1 · THE FINDING ────────────────────────────────────────────────
 * P987's shipped stakes headline, unchanged: the 46% count-up over one sentence
 * carrying the whole Leadership IQ finding. [FOUNDER DECISION 2026-07-15: this
 * section is exactly what already ships in w1 — P992 replaces only the 200%
 * block that used to sit beneath it.]
 *
 * Published research only. No controls, no adjustable value, no arithmetic —
 * every number here is CITED.*, so nothing here can drift and no citation here
 * can detach. That is what makes it the section a skeptic checks first.
 *
 * The separate reframe and clock beats are GONE, not relocated: "within 18
 * months" and "attitude, not a lack of technical skills" are already inside this
 * sentence, so rendering them again below was the same finding stated three
 * times. The founder's "Small gaps compound." bridge is dropped for the same
 * reason — the calculator following the finding already says the cost lands on
 * you, without a line telling the reader so.
 */
function StakesFinding() {
  return (
    <section className="px-4 pb-8 pt-16 lg:pt-24">
      <div className="container mx-auto max-w-lg text-center">
        <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
          <CountPercent target={Math.round(CITED.failureRate * 100)} />
        </p>
        <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug sm:text-xl">
          {COPY.stakesHeadline.sourced} <Source n={COPY.stakesHeadline.ref as 1} />
        </p>
      </div>
    </section>
  );
}

/**
 * ── SECTION 2 · THE CALCULATOR ─────────────────────────────────────────────
 * The bill. Owns every adjustable number on the page and no uncited prose.
 * Reads top-to-bottom as arithmetic — the founder's test was "it feels like
 * math" — with the input sentence as line one, the two research factors
 * stacked under it, and a ruled total.
 */
function StakesCalculator() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  const [failureOpen, setFailureOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const money = computeRisk(inputs);
  const failurePct = Math.round(inputs.failureRate * 100);
  const plural = inputs.hires === 1 ? "" : "s";

  // Whose each research figure currently is. One expression drives both the
  // pill's fill and the tag's name — they cannot disagree.
  const failureTone: Tone = inputs.failureRate === CITED.failureRate ? "theirs" : "yours";
  const replacementTone: Tone =
    inputs.replacementMultiple === CITED.replacementMultiple ? "theirs" : "yours";

  // One polite live region, debounced. Without the debounce a drag announces
  // sixty times a second; without the region a keyboard user changes a number and
  // never learns what it did to the total.
  useEffect(() => {
    const t = setTimeout(
      () => setAnnouncement(`${derivationLine(inputs)} — roughly ${formatEur(money)} to replace the ones who fail`),
      400,
    );
    return () => clearTimeout(t);
  }, [inputs, money]);

  return (
    <section className="px-4 pb-16 pt-4 lg:pb-24">
      <div className="container mx-auto max-w-lg">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {CALC_HEADER}
          </h3>

          {/* Line 1 — the input, as one sentence. The founder picked this over a
              row of sliders and over r2-direct's ten-figure row.
              LOCAL COPY: "at €X a year, each" — model.ts's derivationLine renders
              the salary bare, and the founder flagged a standalone "Annual salary"
              label as ambiguous about whether it is per hire. Four words inside the
              sentence resolve both, and cost no label.
              leading-[2.75rem] gives each line room for a 44px touch target
              without the pills colliding across lines. */}
          <p className="mt-4 text-lg leading-[2.75rem] sm:text-xl">
            <Scrubber
              value={inputs.hires}
              bounds={BOUNDS.hires}
              onChange={(hires) => setInputs((s) => ({ ...s, hires }))}
              format={(v) => String(v)}
              label="Number of key hires you are making"
              valueText={(v) => `${v} key hire${v === 1 ? "" : "s"}`}
              pxPerStep={28}
              tone="yours"
            />{" "}
            <span className="font-semibold">key hire{plural}</span> at{" "}
            <Scrubber
              value={inputs.salary}
              bounds={BOUNDS.salary}
              onChange={(salary) => setInputs((s) => ({ ...s, salary }))}
              format={formatEur}
              label="Annual salary per key hire"
              valueText={(v) => `${formatEur(v)} per key hire, per year`}
              pxPerStep={14}
              tone="yours"
            />{" "}
            <span className="font-semibold">a year{inputs.hires === 1 ? "" : " each"}.</span>
          </p>

          {/* Lines 2-3 — the research factors, stacked. The leading × is what
              makes it read as arithmetic rather than as prose with numbers in it. */}
          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
            <span aria-hidden="true">× </span>
            <ResearchValue
              locked={!failureOpen}
              onUnlock={() => setFailureOpen(true)}
              display={`${failurePct}%`}
              tone={failureTone}
              lockedLabel={`${failurePct} percent of them fail. Leadership IQ's figure. Press to adjust.`}
              scrubber={
                <Scrubber
                  autoFocus
                  value={inputs.failureRate}
                  bounds={BOUNDS.failureRate}
                  onChange={(failureRate) => setInputs((s) => ({ ...s, failureRate }))}
                  format={(v) => `${Math.round(v * 100)}%`}
                  label="Share of new hires that fail. Leadership IQ's figure is 46 percent"
                  valueText={(v) => `${Math.round(v * 100)} percent`}
                  pxPerStep={8}
                  tone={failureTone}
                />
              }
            />{" "}
            {/* LOCAL COPY: "fail" is the factor's label, per the spec's UI
                Contract line "1 key hire × €120,000 × 46% fail × 2× to replace".
                It is NOT a render of COPY.failureStat.sourced — that renders
                verbatim in section 1. */}
            <span>fail</span>
            <SourceTag live={inputs.failureRate} cited={CITED.failureRate} n={1} />
          </p>

          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
            <span aria-hidden="true">× </span>
            <ResearchValue
              locked={!replacementOpen}
              onUnlock={() => setReplacementOpen(true)}
              display={formatMultiple(inputs.replacementMultiple)}
              tone={replacementTone}
              lockedLabel={`${formatMultiple(
                inputs.replacementMultiple,
              )} annual salary to replace one. Gallup's figure. Press to adjust.`}
              scrubber={
                <Scrubber
                  autoFocus
                  value={inputs.replacementMultiple}
                  bounds={BOUNDS.replacementMultiple}
                  onChange={(replacementMultiple) => setInputs((s) => ({ ...s, replacementMultiple }))}
                  format={formatMultiple}
                  label="Cost to replace, as a multiple of annual salary. Gallup's figure is 2 times"
                  valueText={formatMultiple}
                  pxPerStep={16}
                  tone={replacementTone}
                />
              }
            />{" "}
            {/* LOCAL COPY: founder flagged "2x to replace²" as reading like
                "replace-squared". The superscript is gone (a name cannot be an
                exponent), and their own suggested wording — "2x annual salary to
                replace" — resolves the remaining ambiguity about what the
                multiple is OF. The clause the tag closes on IS Gallup's claim,
                units-converted only (200% of salary → 2x salary), which the spec
                puts in scope; the attribution is untouched. */}
            <span>annual salary to replace</span>
            <SourceTag live={inputs.replacementMultiple} cited={CITED.replacementMultiple} n={2} />
          </p>

          <div className="mt-4 border-t border-border pt-4">
            {/* LOCAL COPY: the total's label. Round 1 shipped it unlabeled and a
                reader could not tell what the number WAS. "roughly" is the spec's
                hedge on a product neither study published; it carries no source
                name for the same reason — the product of four factors is the
                founder's rough estimate, not a finding. */}
            <p className="text-sm text-muted-foreground">= roughly</p>
            <p className="mt-1 font-bold tracking-tight text-blue-500 text-[clamp(2.25rem,12vw,4rem)]">
              <CountMoney target={money} />
            </p>
          </div>

          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
    </section>
  );
}

export function R2Synth() {
  return (
    <>
      <StakesFinding />
      <StakesCalculator />
    </>
  );
}
