/**
 * @file risk-model.ts
 * The risk model backing the key-hire calculator on the production homepage
 * (`program-page.tsx`, `#stakes` section).
 *
 * THE INVARIANTS (spec: features/p992_key_hire_risk_calculator.md)
 *
 * 1. The 89% is NOT in the formula. Leadership IQ says 9 of 10 failures are
 *    attitude, not skill. It does NOT say attitude is fixable — that is
 *    ClarityPledge's thesis. Multiplying it in would make it an invisible knob
 *    and would repeat the logged "thesis smuggled into a stat" incident
 *    (docs/decisions.md:2455) on the same page with a bigger number attached.
 *    It re-labels the CAUSE; it never reduces the AMOUNT.
 *
 * 2. Sliders snap coarsely on purpose. Precise input implies a precision this
 *    modeled figure does not have — that is the compound-claim risk arriving
 *    through the input rather than the output.
 *
 * 3. Salary is ANNUAL. Gallup's "200% of salary" is annual salary; a monthly
 *    input needs an invisible x12 between their number and the stat's meaning.
 */

export interface RiskInputs {
  /** Number of key hires. Your fact — slider, integer snap. */
  hires: number;
  /** ANNUAL salary per key hire, EUR. Your fact — slider, 10k snap. */
  salary: number;
  /** Share of new hires that fail within 18 months. The research — locked at CITED default. */
  failureRate: number;
  /** Cost to replace a leader, as a multiple of annual salary. The research — locked at CITED default. */
  replacementMultiple: number;
}

/**
 * The cited values. These are the defaults, and per the spec the defaults ARE
 * the content: most visitors never touch a slider, so whatever ships here is
 * the stat for ~90% of traffic.
 *
 * [FOUNDER DECISION: defaultHires + defaultSalary]
 * Tension on record: hires=1 matches the wedge (H-FounderWince's trigger is an
 * ACTIVE key hire, singular) and ends with the founder thinking about a specific
 * person rather than a spreadsheet — but hires=1 weakens the floor test below.
 */
export const CITED = {
  /** Leadership IQ — Hiring for Attitude study. Ref [1]. */
  failureRate: 0.46,
  /** Gallup — replacement cost ~200% of salary for leaders/managers. Ref [2]. */
  replacementMultiple: 2,
} as const;

export const DEFAULTS: RiskInputs = {
  hires: 1,
  salary: 120_000,
  failureRate: CITED.failureRate,
  replacementMultiple: CITED.replacementMultiple,
};

/**
 * Slider bounds.
 *
 * [FOUNDER DECISION: multiplier bounds] — these are a STARTING POINT to tune
 * against rendered numbers, not a settled answer. The floor test (below) is the
 * pass/fail for the whole section and it is currently UNRESOLVED at hires=1.
 */
export const BOUNDS = {
  hires: { min: 1, max: 10, step: 1 },
  salary: { min: 40_000, max: 300_000, step: 10_000 },
  failureRate: { min: 0.2, max: 0.6, step: 0.01 },
  replacementMultiple: { min: 1, max: 3, step: 0.1 },
} as const;

/** money = hires x annual salary x failureRate x replacementMultiple */
export function computeRisk(i: RiskInputs): number {
  return i.hires * i.salary * i.failureRate * i.replacementMultiple;
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "2x" not "2.0x"; "1.5x" keeps its decimal. */
export function formatMultiple(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}x`;
}

/** The derivation, legible at rest under the money. Never a hidden formula. */
export function derivationLine(i: RiskInputs): string {
  const hires = `${i.hires} key hire${i.hires === 1 ? "" : "s"}`;
  return `${hires} × ${formatEur(i.salary)} × ${Math.round(i.failureRate * 100)}% fail × ${formatMultiple(i.replacementMultiple)} to replace`;
}

/**
 * Keyed to match program-page.tsx's own `REFERENCES` numbering (ref 1 = Gallup,
 * ref 2 = Leadership IQ), NOT the standalone prototype's original numbering —
 * both pages must resolve the same footnote number to the same source.
 */
export const REFS = {
  1: {
    label: "Gallup — This Fixable Problem Costs U.S. Businesses $1 Trillion (replacement cost: ~200% of salary for leaders and managers)",
    url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx",
  },
  2: {
    label: "Leadership IQ — Why New Hires Fail (Hiring for Attitude study, 5,247 hiring managers / 20,000+ new hires)",
    url: "https://www.leadershipiq.com/blogs/leadershipiq/35354241-why-new-hires-fail-emotional-intelligence-vs-skills",
  },
} as const;
