/**
 * @file r2-synth.tsx
 * P992 stakes-section prototype — variant "R2 · SYNTHESIS".
 *
 * The founder's pick, assembled from three round-2 variants. Not a fifth
 * exploration — the convergence of the three treatments that survived review.
 *
 * FROM r2-direct (the base): no sliders, no fields. Headcount is a row of
 * figures you tap; every other value is grabbed and scrubbed where it sits in
 * the sentence. The visualization and the input are the same object.
 *
 * FROM r2-clock: THE SOURCE IS NAMED, NOT NUMBERED. r2-direct bound the
 * citation to the cited VALUE — scrub 46% to 38% and the marker detaches, so
 * the study is never credited for a number it never published. Correct, and
 * r2-direct's own review named its fatal flaw: a 4x13px "[1]" vanishing from a
 * sentence is below the threshold of attention. The mechanism was epistemically
 * exact and communicatively silent. Rendering the source's NAME fixes exactly
 * that — "(Leadership IQ)" becoming "(yours)" is unmissable where a
 * disappearing bracket is not. Same gate, now perceptible. It also kills the
 * "× 2x to replace²" defect at the root: a name cannot be read as an exponent.
 *
 * FROM r2-wild: THE VARIABLES ARE TINTED. r2-direct marked grabbable numbers
 * with a dotted underline and asked the sentence to teach its own grammar. The
 * founder read the tinted-chip treatment as clearer about what is adjustable —
 * a pill is a legible affordance at a glance; a dotted underline is a detail you
 * find after you've decided to look. This is why the section still carries no
 * "click to adjust" instruction: the pill IS the instruction.
 *
 * WHAT IS NOT TINTED IS NOT EDITABLE HERE. "1 key hire" sits plain in the
 * sentence because the row above is its control, and the 46% headline in Beat 1
 * is plain because it is the published finding, not the reader's parameter.
 * The tint has to mean one thing or it means nothing — and blind review caught
 * the first cut meaning two: see THE TINT below, where fill was cut down to
 * carrying whose number it is, and nothing else.
 *
 * Math + every `sourced` string come from model.ts, which this file never edits.
 * Framing/label copy defined locally is marked LOCAL COPY with its reason.
 *
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

type Bounds = { readonly min: number; readonly max: number; readonly step: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Snap to the bound's step and strip float dust (0.1-steps accumulate it fast). */
function snap(n: number, b: Bounds): number {
  const decimals = (String(b.step).split(".")[1] ?? "").length;
  const stepped = Math.round((n - b.min) / b.step) * b.step + b.min;
  return clamp(Number(stepped.toFixed(decimals)), b.min, b.max);
}

/** The published name behind each reference. REFS carries URL + full label; the
 *  prose needs the short name a reader already recognises. */
const SOURCE_NAME = { 1: "Leadership IQ", 2: "Gallup" } as const;

/**
 * A source, named and linked. Never rendered inside a control: a citation is
 * evidence, not an affordance — so it is never tinted, and it never sits within
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
 * THE CITATION GATE — the merge point of r2-direct's position A and r2-clock's
 * treatment of it.
 *
 * `cited` holds only while the live value still equals the published one. Drift
 * it and the study's name is REPLACED by "(yours)" — not merely dropped. The
 * replacement is the point: an absence is invisible, a substitution is read.
 * The reader who scrubbed 46% to 38% is told, in the sentence, that 38% is now
 * their own assumption standing on its own.
 *
 * Structural, not a matter of remembering to. This is the spec's highest-listed
 * risk (docs/decisions.md 2026-06-05 — the page's thesis smuggled into a stat)
 * caught on its return leg: not the thesis wearing the source's citation, but
 * the founder's own number wearing it.
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

const GLYPH_BODY = "M12 15.2c-5.1 0-9.2 3.7-9.2 8.2V31h18.4v-7.6c0-4.5-4.1-8.2-9.2-8.2z";

type GlyphProps = { className?: string; style?: React.CSSProperties };

function PersonSolid({ className, style }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 32" aria-hidden="true" focusable="false" className={className} style={style}>
      <circle cx="12" cy="8" r="5.4" fill="currentColor" />
      <path d={GLYPH_BODY} fill="currentColor" />
    </svg>
  );
}

function PersonGhost({ className, style }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 32" aria-hidden="true" focusable="false" className={className} style={style}>
      <circle cx="12" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" />
      <path d={GLYPH_BODY} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" />
    </svg>
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
 * Blind review of the first cut found the defect this now fixes: tinting every
 * adjustable number identically made "46%" (Leadership IQ's finding) and
 * "120.000 €" (the founder's own figure) the same kind of object. Its words:
 * the identical styling "risks a founder trying to overwrite a source-backed
 * number as if it were their own assumption — blurring 'the study says' from
 * 'you get to change this'." Both are adjustable, so the affordance was honest;
 * but the section's entire claim to credibility rests on WHOSE number is whose,
 * and one costume for both erased it.
 *
 * So the fill carries exactly the distinction the source tag carries:
 *
 *   FILLED  = yours. You set this, or you have moved it off what was published.
 *   OUTLINE = theirs. Still the study's number, still grabbable — the dashed
 *             edge says the door is open without claiming the number as yours.
 *
 * The two are one mechanism, not two: a research value scrubbed off its
 * published figure FILLS at the same instant its tag stops saying
 * "(Leadership IQ)" and starts saying "(yours)". State and attribution change
 * together, because they are the same fact.
 *
 * `active` goes solid so the pill under your thumb is unambiguous mid-drag.
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
 * moves. No track, no thumb, no rail, nothing to fill in.
 *
 * Semantically a spinbutton, which is what makes it keyboard- and
 * screen-reader-operable without a visible form control existing anywhere:
 * arrows step, PageUp/PageDown jump ten, Home/End reach the bounds. Removing the
 * widget must not remove the operability — see the spec's accessibility invariant.
 *
 * touch-pan-y (not touch-none): a thumb dragging sideways scrubs, a thumb
 * dragging down still scrolls the page. Trapping the page scroll on a number
 * would be a worse defect than the slider this replaces.
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
 * THE ROW — headcount as an object rather than a parameter.
 *
 * Ten slots. Tap slot 7 and you have seven key hires; the row does not
 * "represent" the count, it IS the count. Dragging across the row scrubs it.
 * This is the star-rating idiom, which is why it needs no label and no
 * instruction — and why it needs no tint: nothing else on the page looks like
 * this, so nothing else could be mistaken for it.
 *
 * It also answers the founder's "46% of WHAT?" flag without a word of prose: the
 * failing share is drawn onto the figures themselves as a crossfade from solid to
 * dashed ghost, carried fractionally. At one hire and 46%, that single figure is
 * 46% gone — which is the honest picture, because 46% of one person is a
 * probability, not a body. Rounding it to a whole person would say "nobody fails".
 *
 * Semantically a radiogroup with roving tabindex: arrows change the headcount,
 * Home/End reach the bounds, and every slot announces itself as "N key hires".
 * The glyphs are aria-hidden — the prose beneath states what they show.
 *
 * No red, no amber: a failing hire is drawn by losing substance, not by turning a
 * warning colour. Those hues are outside the design system, and the person is not
 * an error state.
 */
function HireRow({
  hires,
  failureRate,
  onChange,
}: {
  hires: number;
  failureRate: number;
  onChange: (n: number) => void;
}) {
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const dragging = useRef(false);
  const failing = hires * failureRate;

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const move = useCallback(
    (n: number) => {
      const v = clamp(n, BOUNDS.hires.min, BOUNDS.hires.max);
      onChange(v);
      slots.current[v - 1]?.focus();
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = hires + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = hires - 1;
    else if (e.key === "Home") next = BOUNDS.hires.min;
    else if (e.key === "End") next = BOUNDS.hires.max;
    if (next === null) return;
    e.preventDefault();
    move(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Key hires you are making"
      className="grid touch-pan-y grid-cols-5 gap-1 sm:grid-cols-10"
    >
      {Array.from({ length: BOUNDS.hires.max }, (_, i) => {
        const n = i + 1;
        const filled = n <= hires;
        // Share of THIS figure that fails. Fractional by design — the remainder
        // lands on one figure rather than being rounded away.
        const gone = filled ? clamp(failing - i, 0, 1) : 0;
        return (
          <button
            key={n}
            ref={(el) => {
              slots.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={n === hires}
            tabIndex={n === hires ? 0 : -1}
            aria-label={`${n} key hire${n === 1 ? "" : "s"}`}
            onPointerDown={(e) => {
              dragging.current = true;
              // Release the implicit touch capture so a finger dragging across the
              // row fires pointerenter on its siblings instead of only the origin.
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              onChange(n);
            }}
            onPointerEnter={() => {
              if (dragging.current) onChange(n);
            }}
            onClick={() => onChange(n)}
            onKeyDown={onKeyDown}
            className="flex min-h-[44px] items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {/* Two glyphs cross-fade in one cell: solid → dashed ghost as this
                figure's failing share rises. A half-faded double exposure is
                exactly the right reading — here, and maybe not. An unfilled slot
                is the same ghost held far back, so the row reads at three
                weights: solid hire / failing hire / hire you haven't made. */}
            <span className="inline-grid place-items-center">
              <PersonSolid
                className="col-start-1 row-start-1 h-8 w-6 text-foreground"
                style={{ opacity: filled ? 1 - gone : 0 }}
              />
              <PersonGhost
                className={`col-start-1 row-start-1 h-8 w-6 ${filled ? "text-foreground" : "text-muted-foreground"}`}
                style={{ opacity: filled ? gone : 0.25 }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function R2Synth() {
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
    <section className="px-4 py-16 lg:py-24">
      <div className="container mx-auto max-w-lg space-y-10">
        {/* ── Beat 1 · SIZE — the published finding. Static, and always the CITED
            value: this is what Leadership IQ reports, not what the founder has
            decided to believe. Untinted for that reason — it is the one number
            here that is not the reader's to move. The live figure lives in the
            derivation below and is free to disagree with it. ── */}
        <div className="text-center">
          <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
            <CountPercent target={Math.round(CITED.failureRate * 100)} />
          </p>
          <p className="mx-auto mt-4 max-w-sm text-lg font-semibold leading-snug sm:text-xl">
            {COPY.failureStat.sourced} <Source n={COPY.failureStat.ref as 1} />
          </p>
        </div>

        {/* ── Beat 2 · SIZE — the money. The row is the headcount; the tinted
            numbers in the sentence are the rest. Nothing here is a field. ── */}
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <HireRow
            hires={inputs.hires}
            failureRate={inputs.failureRate}
            onChange={(hires) => setInputs((s) => ({ ...s, hires }))}
          />

          {/* The derivation, legible at rest — and every factor in it is the
              control for that factor. leading-[2.75rem] gives each line room for a
              44px touch target without the pills colliding across lines. */}
          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
            {/* LOCAL COPY: "at €X a year, each" — model.ts's derivationLine renders
                the salary bare, and the founder flagged the standalone "Annual
                salary" label as ambiguous about whether it is per hire. Three words
                inside the sentence resolve both, and cost no label. */}
            <span className="font-semibold text-foreground">
              {inputs.hires} key hire{plural}
            </span>
            , at{" "}
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
            a year{inputs.hires === 1 ? "" : " each"}.
          </p>

          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
            <ResearchValue
              locked={!failureOpen}
              onUnlock={() => setFailureOpen(true)}
              display={`${failurePct}%`}
              tone={failureTone}
              lockedLabel={`${failurePct} percent of new hires fail. Leadership IQ's figure. Press to adjust.`}
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
            />
            {/* LOCAL COPY: "of them fail" resolves the founder's "46% of what?"
                flag — "them" is the row directly above. It is NOT a render of
                COPY.failureStat.sourced (that renders verbatim in Beat 1); it is
                the arithmetic factor's label, per the spec's UI Contract line
                "1 key hire × €120,000 × 46% fail × 2× to replace". The tag below
                stops saying "Leadership IQ" the moment this stops being 46%. */}
            <span> of them fail</span>
            <SourceTag live={inputs.failureRate} cited={CITED.failureRate} n={1} />
            <span>. Replacing one costs</span>{" "}
            <ResearchValue
              locked={!replacementOpen}
              onUnlock={() => setReplacementOpen(true)}
              display={formatMultiple(inputs.replacementMultiple)}
              tone={replacementTone}
              lockedLabel={`Replacing one costs ${formatMultiple(
                inputs.replacementMultiple,
              )} their annual salary. Gallup's figure. Press to adjust.`}
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
            {/* The tag closes on "their annual salary" — clear of the multiplier.
                The founder's "reads as replace-squared" flag was a bare superscript
                colliding with adjacent arithmetic; a source's NAME cannot be read
                as an exponent, which retires that defect rather than mitigating it.
                The clause it closes on IS Gallup's claim, units-converted only
                (200% of salary → 2x salary), which the spec puts in scope; the
                attribution is untouched. */}
            <span>their annual salary</span>
            <SourceTag live={inputs.replacementMultiple} cited={CITED.replacementMultiple} n={2} />
            <span>.</span>
          </p>

          <div className="border-t border-border pt-5">
            {/* LOCAL COPY: the total's label. Round 1 shipped it unlabeled and the
                reader could not tell what the number WAS. It is replacement cost —
                Gallup's 200% is what re-recruiting, onboarding and ramping costs.
                It is not revenue at risk and not value destroyed; naming it as
                either is the exact relabel the logged incident is made of. It
                carries no source name: the product of these four factors is the
                founder's rough estimate, not a published finding. */}
            <p className="text-sm text-muted-foreground">
              To replace the ones who fail — {COPY.moneyFraming}
            </p>
            <p className="mt-1 font-bold tracking-tight text-blue-500 text-[clamp(2.25rem,12vw,4rem)]">
              <CountMoney target={money} />
            </p>
          </div>
        </div>

        {/* ── Beat 3 · CAUSE — the reframe. Redirects from recruiting to talking.
            The source closes on the sourced clause; the founder's claim sits after
            it, unattributed and visually separate, so a reader can see which is
            which. ── */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.reframe.lead} {COPY.reframe.sourced} <Source n={COPY.reframe.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.reframe.claim}</span>
        </p>

        {/* ── Beat 4 · DELAY — the clock, and the section's close. Same
            construction. The section hands off to the CTA here; it never closes on
            price. ── */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.clock.sourced} <Source n={COPY.clock.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.clock.claim}</span>
        </p>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </section>
  );
}
