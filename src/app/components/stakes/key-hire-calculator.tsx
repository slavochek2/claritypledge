/**
 * @file key-hire-calculator.tsx
 * The key-hire risk calculator — production component on the homepage
 * (`program-page.tsx`, `#stakes` section, rendered after the 46% finding).
 *
 * TWO SECTIONS, ONE SPLIT: what is TRUE (the finding, owned by program-page.tsx
 * itself) / what it COSTS YOU (this calculator). The finding carries no
 * controls at all; the calculator holds every adjustable number and no uncited
 * prose. Round 1 interleaved them, which is why a reader could not tell whether
 * the money was a finding or an estimate. The seam is the point.
 *
 * ONE CITATION STYLE, PAGE-WIDE [FOUNDER DECISION 2026-07-15]: source names
 * replace bare superscripts everywhere on the page, not only here — a page
 * showing "[1]" in one section and "(Leadership IQ)" in the next reads as an
 * oversight.
 *
 * THE INPUT IS ONE SENTENCE. Founder, on the annotated screenshot: "i like this
 * one!" against `1 key hire at 120.000 € a year.` So headcount is a pill in
 * that sentence, not a slider row.
 *
 * THE MATH IS A STACKED BILL. Founder: "i like this calcuation it feels like
 * math!" Factors stack, each on its own line, closing on a ruled total. The
 * input sentence IS the stack's first line, so the two compose without
 * restating anything.
 *
 * THE SOURCE IS NAMED, NOT NUMBERED. Binding the citation to the cited VALUE
 * means scrub 46% to 38% and the marker detaches, so a study is never credited
 * for a number it never published. A bare "[1]" vanishing at 4x13px is below
 * the threshold of attention — "epistemically exact and communicatively
 * silent." Rendering the source's NAME fixes exactly that: "(Leadership IQ)"
 * becoming "(yours)" is unmissable. Same gate, now perceptible. It also retires
 * the "reads as replace-squared" flag at the root — a name cannot be an
 * exponent.
 *
 * WHAT THE HEADER MAY NOT SAY. The total is COST TO REPLACE — Gallup's 200% is
 * re-recruiting, onboarding and ramp. It is not "revenue at risk" (money not
 * earned; neither study measured it) and the 46% is not "turnover" (that
 * includes tenured staff quitting — a different population). Both were proposed
 * and both were rejected here: relabelling a spend as forgone income is the
 * exact trade docs/decisions.md 2026-06-05 logs as the page's thesis smuggled
 * into a stat. The header states the noun the sources actually support.
 *
 * Math + every cited value come from ./risk-model, which this file never edits.
 * Framing/label copy defined locally is marked LOCAL COPY with its reason.
 *
 * Spec: features/p992_key_hire_risk_calculator.md
 *
 * REF NUMBERING: this component's citations must resolve against
 * program-page.tsx's own `REFERENCES` numbering (ref 1 = Gallup, ref 2 =
 * Leadership IQ) — see ./risk-model's `REFS` doc comment. SOURCE_NAME and both
 * SourceTag call sites below are keyed to that numbering, not to the order the
 * factors appear on screen.
 */
import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";
import {
  BOUNDS,
  CITED,
  DEFAULTS,
  REFS,
  computeRisk,
  derivationLine,
  formatEur,
  formatMultiple,
  type RiskInputs,
} from "./risk-model";

type Bounds = { readonly min: number; readonly max: number; readonly step: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Snap to the bound's step and strip float dust (0.1-steps accumulate it fast). */
function snap(n: number, b: Bounds): number {
  const decimals = (String(b.step).split(".")[1] ?? "").length;
  const stepped = Math.round((n - b.min) / b.step) * b.step + b.min;
  return clamp(Number(stepped.toFixed(decimals)), b.min, b.max);
}

/**
 * LOCAL COPY — the calculator's title and the total's label.
 * [FOUNDER DECISION: title is the question form "What is your key-hire risk?"
 * (chosen over the imperative "Quantify…", which presumes the reader has already
 * agreed there is a risk to measure); total label stays "your key-hire risk".]
 *
 * WHY "RISK" AND NOT "COSTS". The total is an EXPECTED VALUE — 46% odds on
 * €240,000, not a bill for €110,400. At one hire nobody pays €110,400; they pay
 * €240,000 or nothing. "What it costs you" asserts a spend already incurred and
 * overstates a coin flip; "risk" is the honest noun for a probability times a
 * price, and it is what the arithmetic on screen actually computes.
 *
 * WHY "KEY-HIRE" AND NOT "TURNOVER". Rejected twice, same reason both times:
 * Leadership IQ counts NEW HIRES failing within 18 months. Turnover counts
 * anyone leaving — a six-year CTO resigning is turnover and is nowhere in the
 * 46%. A turnover header would license summing the whole headcount; this
 * calculator sums key hires. Wrong population, wrong number, and the source
 * does not carry the claim. See also "revenue at risk", rejected for the
 * adjacent reason (Gallup priced a spend, not forgone income) —
 * docs/decisions.md 2026-06-05, the page's thesis smuggled into a stat.
 */
const CALC_TITLE = "What is your key-hire risk?";
const TOTAL_LABEL = "= your key-hire risk, roughly";

/** The published name behind each reference. REFS carries URL + full label; the
 *  prose needs the short name a reader already recognises. Keyed to
 *  program-page.tsx's numbering (1 = Gallup, 2 = Leadership IQ). */
const SOURCE_NAME = { 1: "Gallup", 2: "Leadership IQ" } as const;

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
 * THE CITATION GATE.
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
/* Every pill carries a border — transparent unless a tone paints it. Without
 * this the outlined pills measured 46px against the filled pills' 44px: the
 * border is drawn OUTSIDE the 44px line box, so only the bordered ones grew.
 * Two pixels is invisible on its own and misaligns every row it touches. */
/* PILL sets border WIDTH only; every tone sets its own border COLOUR. Never put
 * a border-colour utility in PILL: base and tone would both be utilities of
 * equal specificity, so Tailwind's emit order — not the class order in the
 * string — picks the winner. `border-transparent` in the base silently erased
 * the dashed outline that way. Mutually exclusive tones cannot collide. */
const PILL = "inline-flex min-h-11 select-none items-center rounded-md border border-solid px-1.5 align-middle font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const PILL_YOURS = "border-transparent bg-blue-500/10 text-blue-600 hover:bg-blue-500/20";
const PILL_THEIRS = "border-dashed border-blue-500/50 text-foreground hover:bg-blue-500/10";
const PILL_ACTIVE = "border-transparent bg-blue-500 text-white";

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
 * THE CALCULATOR. The bill. Owns every adjustable number on the page and no
 * uncited prose. Reads top-to-bottom as arithmetic — the founder's test was
 * "it feels like math" — with the input sentence as line one, the two research
 * factors stacked under it, and a ruled total.
 */
export function KeyHireCalculator() {
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

  // border-t + py-20/lg:py-28 match every other top-level section's divider
  // and vertical rhythm on this page (see program-page.tsx's section list) —
  // this is its own section now, not glued to #stakes above it.
  return (
    <section className="px-4 py-20 lg:py-28 border-t border-border">
      <div className="container mx-auto max-w-lg">
        {/* The title sits ABOVE the card [FOUNDER DECISION]: it announces the
            section to a scanner before they enter the border, which a label
            inside the card cannot do. The card is then only math.
            SectionHeader is the same title component every other section on
            this page uses (text-3xl sm:text-5xl font-bold) — this section's
            heading now matches their size instead of a smaller ad-hoc h3. */}
        <SectionHeader title={CALC_TITLE} />

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {/* Line 1 — the input, as one sentence. The founder picked this over a
              row of sliders and over a ten-figure row.
              LOCAL COPY: "at €X a year, each" — risk-model.ts's derivationLine
              renders the salary bare, and the founder flagged a standalone
              "Annual salary" label as ambiguous about whether it is per hire.
              Four words inside the sentence resolve both, and cost no label.
              leading-[2.75rem] gives each line room for a 44px touch target
              without the pills colliding across lines. */}
          {/* THE RAIL. Operators live in their own column so every operand
              starts on one left edge and a wrapped line indents UNDER its own
              row instead of colliding with the × column. Before this, row 1
              (no operator) started where rows 2-3's × sat, so the stack never
              read as arithmetic — and at 320px the wrapped fragments landed
              flush against the operators as ragged prose. */}
          <div className="mt-4 grid grid-cols-[1.25rem_1fr] items-start">
          <span aria-hidden="true" className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl" />
          <p className="text-lg leading-[2.75rem] sm:text-xl">
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
            {/* Glued to the salary: a bold "a year." alone on its own line at
                320px reads as a new sentence, not as the unit of the number
                above it. */}
            <span className="whitespace-nowrap font-semibold">
              a year{inputs.hires === 1 ? "" : " each"}.
            </span>
          </p>

          {/* Lines 2-3 — the research factors, stacked. The leading × is what
              makes it read as arithmetic rather than as prose with numbers in it. */}
          <span aria-hidden="true" className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">×</span>
          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
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
                It is a label, not a render of the page's own finding sentence —
                that renders verbatim above, in program-page.tsx.
                Ref numbering: this factor is Leadership IQ's figure, which is
                program-page's ref 2 (see ./risk-model REFS doc comment). */}
            {/* The label and its citation are ONE unbreakable unit. At 320px
                "(Leadership IQ)" was orphaning onto its own line, detaching the
                source from the number it attributes — which is the whole
                mitigation. A citation floating free of its figure is worse than
                a ragged line: it reads as attributing the row above it. */}
            <span className="whitespace-nowrap">
              fail
              <SourceTag live={inputs.failureRate} cited={CITED.failureRate} n={2} />
            </span>
          </p>

          <span aria-hidden="true" className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">×</span>
          <p className="text-lg leading-[2.75rem] text-muted-foreground sm:text-xl">
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
                puts in scope; the attribution is untouched.
                Ref numbering: this factor is Gallup's figure, which is
                program-page's ref 1 (see ./risk-model REFS doc comment). */}
            {/* Only the last word joins the citation — gluing the whole clause
                would overflow 320px. "replace (Gallup)" stays together. */}
            <span>annual salary to </span>
            <span className="whitespace-nowrap">
              replace
              <SourceTag live={inputs.replacementMultiple} cited={CITED.replacementMultiple} n={1} />
            </span>
          </p>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {/* LOCAL COPY: the total's label. Round 1 shipped it unlabeled and a
                reader could not tell what the number WAS. It carries no source
                name on purpose — the product of four factors is the founder's
                own estimate, not a finding, and naming a study here would be the
                logged incident exactly. "roughly" is the spec's named mitigation
                for compound-claim overreach (features/p992 line 95): 46% x 2x is
                a figure neither study published, and it renders to the last euro.
                Rounding the number instead would break the derivation the reader
                can currently audit — 120.000 x 46% x 2 must equal what they see. */}
            {/* Contrast raised off muted-foreground: this label was the faintest
                text in the card while naming the largest number in it. The
                wording is unchanged — still a founder decision. */}
            <p className="text-sm font-medium text-foreground/80">{TOTAL_LABEL}</p>
            {/* clamp floor keyed to the WIDEST possible total, not the default:
                at max bounds the string is "5.400.000 €" (11 chars), which at
                12vw overflowed the max-w-lg card at 320px. 10vw keeps the widest
                value inside the card while the default (€110.400) stays large. */}
            <p className="mt-1 font-bold tracking-tight text-blue-500 text-[clamp(2rem,10vw,4rem)]">
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
