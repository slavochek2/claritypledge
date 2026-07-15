/**
 * @file r2-wild.tsx
 * P992 stakes-section prototype — variant "THE AD".
 *
 * Thesis: the other variants argue about the hire. This one argues about the
 * founder. The section's job is to redirect from "I need better recruiting" to
 * "I need to say the hard thing out loud" — so the object on screen is the
 * founder's OWN artifact, the job ad they wrote. A job ad is a list of skills;
 * that is what job ads are. The research then says failures are not about skill.
 * The ad does not have to be wrong for the argument to land — it just has to be
 * a skill document with nothing on it about the thing that decides. That gap is
 * the silence, and it is drawn as a blank requirement at the bottom of the list.
 *
 * The money is framed as "you run this again" — Gallup's 200% IS the cost to
 * re-recruit, onboard, and ramp, so the picture of re-running the ad labels the
 * total truthfully without the words "replacement cost" and without inflating it
 * into "value destroyed" (spec invariant; docs/decisions.md 2026-06-05 incident).
 *
 * Shares math + the verbatim sourced copy with every other /tree/stakes variant
 * via model.ts. See features/p992_key_hire_risk_calculator.md for the spec.
 */
import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "framer-motion";
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
 * LOCAL COPY — [FOUNDER DECISION: wording]. Defined here rather than in model.ts
 * because three other variants share that file. Every `sourced` string still
 * comes from model.ts, unedited — only framing and labels are local.
 *
 * Nothing below carries a citation, and that is the point: the ad is the
 * founder's own document, not a research finding. The claim "your hiring bar is
 * a skill bar" is an observation about the artifact on screen, not something
 * Leadership IQ asserts, so it must never sit inside a citation's scope.
 */
const AD = {
  eyebrow: "We're hiring",
  needHeading: "You need",
  /**
   * Illustrative requirements — swap for the founder's real language. They are
   * the evidence for beat 3: every line is a skill line, which is what makes the
   * blank at the bottom legible without a caption.
   */
  requirements: [
    "8+ years shipping product",
    "Led a team through a scale-up",
    "Owns the roadmap end to end",
    "Fluent in our stack",
    "References we can call",
  ],
  /**
   * The total's label. Gallup's 200% is the cost to re-recruit, onboard and ramp
   * — "you run this again" says exactly that in the founder's own words and
   * understates rather than inflates. Never "value destroyed", never "revenue at
   * risk". This replaces the unlabeled total round 1 shipped.
   */
  moneyLabel: "If it doesn't work out, you run this again.",
};

/**
 * Coarse choice sets — derived from BOUNDS so the endpoints stay exactly
 * reachable: the floor (0.2 x 1x) and the widest money figure (10 x EUR 300k)
 * are both still reachable, so the floor test and the overflow case are
 * unchanged. This DOES reduce the reachable interior (salary: 27 steps -> 8;
 * research: continuous -> 3 each). Reported, not silent.
 *
 * Coarseness is the point rather than a compromise: you cannot express EUR
 * 137,500 here, so no input implies a precision this modeled figure lacks.
 */
const HIRES_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALARY_CHOICES = [
  BOUNDS.salary.min,
  60_000,
  80_000,
  100_000,
  120_000,
  150_000,
  200_000,
  BOUNDS.salary.max,
];
const FAILURE_CHOICES = [CITED.failureRate, 0.3, BOUNDS.failureRate.min];
const REPLACEMENT_CHOICES = [CITED.replacementMultiple, 1.5, BOUNDS.replacementMultiple.min];

type OpenToken = "hires" | "salary" | "failure" | "replacement" | null;

/** Superscript citation — closes on a SOURCE NAME or a SOURCED CLAUSE, never on a numeral. */
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

/** Count-up for the unchanged 46% headline (P987/program-page treatment, ported). */
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
 * Count-up for the money. The animating value sits on an invisible copy of the
 * final formatted string in the same grid cell, so nothing reflows mid-count.
 *
 * Only the FIRST reveal counts up from zero; once revealed, chip taps update the
 * figure immediately — a fresh 0->N animation on every tap would read as broken
 * rather than as live recompute.
 *
 * Type size is clamped rather than stepped: the widest reachable figure is
 * "2.760.000 EUR" (10 x EUR 300k), ~5.6em wide in tabular bold. The 4.5rem cap
 * keeps that inside max-w-md on desktop; the 2rem floor keeps it inside 320px.
 * The 46% above stays larger because no type size fits both that figure and
 * text-8xl — an honest ceiling, not a choice.
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
    <span
      ref={ref}
      className="inline-grid whitespace-nowrap text-[clamp(2rem,10vw,4.5rem)] font-bold leading-none tabular-nums tracking-tight text-blue-500"
    >
      <span className="col-start-1 row-start-1">{formatEur(val)}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {formatEur(target)}
      </span>
    </span>
  );
}

/**
 * A fill-in blank in the ad's own first line. A highlighted, dotted-underlined
 * value inside a document is the most legible "change me" idiom there is — no
 * instruction line required, which is what round 1's "click either multiplier to
 * adjust it" was compensating for.
 *
 * The ::after extends the hit area to 40px without changing the visual box; the
 * sentence uses leading-loose so hit areas never overlap across wrapped lines.
 */
function Blank({
  children,
  open,
  onToggle,
  label,
}: {
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className={`relative rounded-md px-2 py-0.5 font-bold underline decoration-dotted underline-offset-[6px] transition-colors after:absolute after:inset-x-0 after:-top-2 after:-bottom-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        open
          ? "bg-blue-500 text-white decoration-white/60"
          : "bg-blue-500/10 text-blue-600 decoration-blue-500/60 hover:bg-blue-500/20"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A research value, stated as fact with a door. Dashed border + its source named
 * directly beneath it: the skeptic can reach the conservative end, but they have
 * to move deliberately away from a value tagged "cited" and standing next to the
 * study that produced it. Prominent controls would make fiddling look like the
 * main event; this keeps the claim's authority and still opens.
 */
function ResearchToken({
  children,
  open,
  onToggle,
  label,
}: {
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className={`inline-flex min-h-[40px] items-center rounded-md border border-dashed px-2.5 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        open
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The picker every blank opens. A radiogroup with roving tabindex — arrow keys
 * step through the values exactly as they would step a slider, which is the real
 * keyboard equivalent the removed slider owed.
 */
function ChipRow({
  options,
  value,
  onChange,
  label,
  format,
  citedValue,
}: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  format: (v: number) => string;
  citedValue?: number;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.indexOf(value));

  const move = (next: number) => {
    const i = (next + options.length) % options.length;
    const opt = options[i];
    if (opt === undefined) return;
    onChange(opt);
    refs.current[i]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="mt-3 flex flex-wrap gap-1.5">
      {options.map((o, i) => {
        const selected = o === value;
        const cited = o === citedValue;
        return (
          <button
            key={o}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={cited ? `${format(o)} — cited default` : format(o)}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(o)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(idx + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(idx - 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                move(0);
              } else if (e.key === "End") {
                e.preventDefault();
                move(options.length - 1);
              }
            }}
            className={`inline-flex min-h-[40px] min-w-[44px] items-center justify-center rounded-md border px-2.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              selected
                ? "border-blue-500 bg-blue-500 font-semibold text-white"
                : "border-border bg-background text-muted-foreground hover:border-blue-500/60 hover:text-foreground"
            }`}
          >
            <span aria-hidden>{format(o)}</span>
            {cited && (
              <span
                aria-hidden
                className="ml-1.5 text-[0.6rem] font-medium uppercase tracking-wide opacity-70"
              >
                cited
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function R2Wild() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS);
  /** One blank open at a time — the section stays a document, not a control panel. */
  const [open, setOpen] = useState<OpenToken>(null);
  const reduce = useReducedMotion();

  const money = computeRisk(inputs);
  const many = inputs.hires !== 1;
  const hiresLabel = `${inputs.hires} key hire${many ? "s" : ""}`;
  const toggle = (t: Exclude<OpenToken, null>) => setOpen((o) => (o === t ? null : t));

  return (
    <section className="px-4 py-16 lg:py-24">
      <div className="container mx-auto max-w-md space-y-10">
        {/* Beat 1 — SIZE. The unchanged 46%: the CITED constant, never the adjustable value. */}
        <div className="text-center">
          <p className="text-7xl font-bold tracking-tight text-blue-500 sm:text-8xl">
            <CountPercent target={Math.round(CITED.failureRate * 100)} />
          </p>
          <p className="mt-4 text-lg font-semibold leading-snug sm:text-xl">
            {COPY.failureStat.sourced}
            <Cite n={COPY.failureStat.ref as 1} />
          </p>
        </div>

        {/* Beat 2 — SIZE, the money. The ad is the vehicle: the founder's own document,
            carrying their own two facts as blanks, and their own hiring bar as a list
            that turns out to be entirely about skill. */}
        <div className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm sm:p-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {AD.eyebrow}
          </p>

          <p className="mt-3 text-xl font-semibold leading-loose sm:text-2xl">
            <Blank
              open={open === "hires"}
              onToggle={() => toggle("hires")}
              label={`${hiresLabel} — change how many`}
            >
              {inputs.hires}
            </Blank>{" "}
            {many ? "key hires at" : "key hire at"}{" "}
            <Blank
              open={open === "salary"}
              onToggle={() => toggle("salary")}
              label={`${formatEur(inputs.salary)} a year — change the salary`}
            >
              {formatEur(inputs.salary)}
            </Blank>{" "}
            {many ? "a year each." : "a year."}
          </p>

          {open === "hires" && (
            <ChipRow
              options={HIRES_CHOICES}
              value={inputs.hires}
              onChange={(v) => setInputs((s) => ({ ...s, hires: v }))}
              label="How many key hires"
              format={(v) => String(v)}
            />
          )}
          {open === "salary" && (
            <ChipRow
              options={SALARY_CHOICES}
              value={inputs.salary}
              onChange={(v) => setInputs((s) => ({ ...s, salary: v }))}
              label="Annual salary per key hire"
              format={(v) => `€${Math.round(v / 1000)}k`}
            />
          )}

          <p className="mt-7 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {AD.needHeading}
          </p>
          <ul className="mt-3 space-y-2 text-sm sm:text-base">
            {AD.requirements.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.15em] shrink-0 text-muted-foreground">
                  ✓
                </span>
                <span>{r}</span>
              </li>
            ))}
            {/* The silence, drawn. It arrives a beat after the list completes: one more
                requirement, and there is nothing on it. No caption — beat 3 below pays it
                off. Reduced motion gets it immediately, without the beat. */}
            <motion.li
              className="flex items-center gap-2.5 pt-1"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ delay: 0.7, duration: 0.6 }}
            >
              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                ✓
              </span>
              <span className="sr-only">(blank)</span>
              <span aria-hidden className="h-0 flex-1 border-t border-dashed border-muted-foreground/40" />
            </motion.li>
          </ul>
        </div>

        {/* The money. Labelled by what it buys back — running the whole thing again —
            which is what Gallup's 200% measures: re-recruit, onboard, ramp. */}
        <div className="text-center">
          <p className="text-base font-medium sm:text-lg">{AD.moneyLabel}</p>
          <p className="mt-4 text-sm text-muted-foreground">{COPY.moneyFraming}</p>
          <p className="mt-1">
            <CountMoney target={money} />
          </p>

          {/* The derivation, legible at rest. The founder's two facts sit as plain text;
              the two research factors sit in dashed tokens with their source named
              underneath. The superscript lands on the SOURCE NAME, never beside a
              numeral — round 1's "2x to replace²" read as "replace squared". */}
          <div className="mt-6 flex flex-wrap items-start justify-center gap-x-2.5 gap-y-3 text-sm text-muted-foreground">
            <span className="pt-2 tabular-nums">{hiresLabel}</span>
            <span className="pt-2">×</span>
            <span className="pt-2 tabular-nums">{formatEur(inputs.salary)} a year</span>
            <span className="pt-2">×</span>
            <span className="flex flex-col items-center gap-1">
              <ResearchToken
                open={open === "failure"}
                onToggle={() => toggle("failure")}
                label={`${Math.round(inputs.failureRate * 100)}% fail — change the failure rate`}
              >
                {Math.round(inputs.failureRate * 100)}%&nbsp;fail
              </ResearchToken>
              <span className="text-[0.65rem] leading-tight">
                Leadership IQ
                <Cite n={1} />
              </span>
            </span>
            <span className="pt-2">×</span>
            <span className="flex flex-col items-center gap-1">
              <ResearchToken
                open={open === "replacement"}
                onToggle={() => toggle("replacement")}
                label={`${formatMultiple(inputs.replacementMultiple)} to replace — change the replacement multiple`}
              >
                {formatMultiple(inputs.replacementMultiple)}&nbsp;to&nbsp;replace
              </ResearchToken>
              <span className="text-[0.65rem] leading-tight">
                Gallup
                <Cite n={2} />
              </span>
            </span>
          </div>

          {open === "failure" && (
            <div className="mt-1 flex justify-center">
              <ChipRow
                options={FAILURE_CHOICES}
                value={inputs.failureRate}
                onChange={(v) => setInputs((s) => ({ ...s, failureRate: v }))}
                label="Share of new hires that fail (Leadership IQ)"
                format={(v) => `${Math.round(v * 100)}%`}
                citedValue={CITED.failureRate}
              />
            </div>
          )}
          {open === "replacement" && (
            <div className="mt-1 flex justify-center">
              <ChipRow
                options={REPLACEMENT_CHOICES}
                value={inputs.replacementMultiple}
                onChange={(v) => setInputs((s) => ({ ...s, replacementMultiple: v }))}
                label="Cost to replace, as a multiple of annual salary (Gallup)"
                format={(v) => formatMultiple(v)}
                citedValue={CITED.replacementMultiple}
              />
            </div>
          )}
        </div>

        {/* Beat 3 — CAUSE. The reframe, and the payoff for the blank line in the ad.
            The citation closes on the sourced clause; the founder's claim sits visibly
            outside it, uncited, in its own line. The 89% re-labels the cause here and
            never touches the arithmetic above. */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.reframe.lead} {COPY.reframe.sourced}
          <Cite n={COPY.reframe.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.reframe.claim}</span>
        </p>

        {/* Beat 4 — DELAY. The close: the clock, not the price. Same construction. */}
        <p className="text-center text-lg font-semibold leading-snug sm:text-xl">
          {COPY.clock.sourced}
          <Cite n={COPY.clock.ref as 1} />
          <span className="mt-2 block font-normal text-muted-foreground">{COPY.clock.claim}</span>
        </p>
      </div>
    </section>
  );
}
