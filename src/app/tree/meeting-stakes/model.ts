/** Data and arithmetic for the /tree/meeting-stakes prototype. Sources and caveats: see MeetingStakes.tsx. */
import { POSITION_LABELS } from "@/app/components/shared/presentational/position-groups";

export type ConditionKey = "fuzzy" | "late" | "damage" | "undo" | "blame";
/** -2 strongly disagree … +2 strongly agree; null = not answered (never the same as Unsure). */
export type Answer = -2 | -1 | 0 | 1 | 2;
export type Answers = Record<ConditionKey, Answer | null>;
export type Gate = "yes" | "no";

/** The product's own position labels (the 5 of its 7 that make a -2..+2 scale). */
export const SCALE: ReadonlyArray<{ value: Answer; label: string }> = [
  { value: -2, label: POSITION_LABELS.strongly_disagree },
  { value: -1, label: POSITION_LABELS.disagree },
  { value: 0, label: POSITION_LABELS.unsure },
  { value: 1, label: POSITION_LABELS.agree },
  { value: 2, label: POSITION_LABELS.strongly_agree },
];
export const labelOf = (a: Answer) => SCALE.find((s) => s.value === a)?.label ?? "";

/**
 * The five conditions, each a point to agree or disagree with. `reverse`: agreeing LOWERS the risk
 * (the founder's own wording for fuzzy intent is a positive statement), so its risk is the negated answer.
 */
export const CONDITIONS: ReadonlyArray<{ key: ConditionKey; name: string; point: string; reverse?: boolean }> = [
  { key: "fuzzy", name: "Fuzzy intent", point: "Everyone in this meeting can express what they mean so the others understand it as intended.", reverse: true },
  { key: "late", name: "Late results", point: "If this goes wrong, we would find out too late to fix it cheaply." },
  { key: "damage", name: "Concentrated cost", point: "If this goes wrong, specific people pay for it, so we cannot just try it and see." },
  { key: "undo", name: "Hard to undo", point: "Once decided, this is hard or impossible to undo." },
  { key: "blame", name: "Two explanations", point: "If this goes wrong, each side would explain the result its own way." },
];

export const NO_ANSWERS: Answers = { fuzzy: null, late: null, damage: null, undo: null, blame: null };

/** Kinds of meeting from docs/high-stakes-examples.md. Picking one only names the meeting: nothing is prefilled. */
export const ANOTHER = "Another meeting";
export const MEETINGS: ReadonlyArray<{ group: string; items: readonly string[] }> = [
  {
    group: "Meetings",
    items: ["Project kickoff", "Pre-mortem", "Hiring decision", "Onboarding a new employee", "Rollout kickoff (AI rollout, reorganisation)", "Post-mortem", "Quarterly or yearly review", "Firing meeting"],
  },
  {
    group: "Shareholder and board decisions",
    items: ["Issuing new shares", "Amending the articles of association", "Sale of the company or a merger", "Taking on major debt", "Approving the annual budget or plan", "Appointing or removing a director or the CEO", "Paying dividends", "Related-party transaction", "Winding up the company"],
  },
  { group: "Other", items: [ANOTHER] },
];

export const riskOf = (key: ConditionKey, a: Answer) => (CONDITIONS.find((c) => c.key === key)?.reverse ? -a : a);
/** The conditions whose answer raises the risk (Agree or Strongly agree on the risk side). Opposite answers never cancel them. */
export const flaggedOf = (answers: Answers) =>
  CONDITIONS.filter((c) => {
    const a = answers[c.key];
    return a !== null && riskOf(c.key, a) > 0;
  });
export const isComplete = (answers: Answers) => CONDITIONS.every((c) => answers[c.key] !== null);

export type VerdictKind = "skip" | "settles" | "borderline" | "worth";

/** [FOUNDER DECISION: thresholds are agent-proposed] No at the gate skips; otherwise the count of flagged points decides. */
export function verdictOf(gate: Gate | null, answers: Answers): VerdictKind {
  if (gate === "no") return "skip";
  const n = flaggedOf(answers).length;
  return n === 0 ? "settles" : n === 1 ? "borderline" : "worth";
}

export const worthChecking = (v: VerdictKind) => v === "worth" || v === "borderline";

const COUNT: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four", 5: "All five" };
/** "a, b and c". */
export const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export const VERDICT_TITLE: Record<VerdictKind, string> = { skip: "No check needed", settles: "Probably settles itself", borderline: "Borderline", worth: "Worth a check" };

export function verdictCopy(v: VerdictKind, answers: Answers): { title: string; body: string } {
  const names = flaggedOf(answers).map((c) => c.name.toLowerCase());
  const title = VERDICT_TITLE[v];
  switch (v) {
    case "skip":
      return { title, body: "You said the results would not suffer if people left with different understandings of this meeting." };
    case "settles":
      return { title, body: "None of your answers points to a costly or lasting misunderstanding. A check would mostly cost time." };
    case "borderline":
      return { title, body: `One answer raises the risk: ${list(names)}. A short check on that point may be enough.` };
    case "worth":
      return { title, body: `${COUNT[names.length] ?? names.length} of your answers raise the risk: ${list(names)}. A misunderstanding here would be costly and would not sort itself out.` };
  }
}

/** Every money figure is the host's own estimate; null = not given. Nothing is prefilled. */
export type Money = { perYear: number | null; people: number | null; hourly: number | null; minutes: number | null; damage: number | null; oneIn: number | null };
export const NO_MONEY: Money = { perYear: null, people: null, hourly: null, minutes: null, damage: null, oneIn: null };

/** Drops floating-point dust (70.00000000000001), so an exact break-even stays exact and is not floored or tipped over 1. */
const clean = (n: number) => Math.round(n * 1e9) / 1e9;

export function compute(m: Money) {
  // Every figure from the typed inputs, multiplying before dividing, and cleaned once at the end: cleaning
  // a figure and then computing from it would carry the rounding on (€137.50 a year shown as €137).
  /** The check's price times 60: people × hourly × minutes, before the one division by 60. */
  const work = m.people !== null && m.hourly !== null && m.minutes !== null ? m.people * m.hourly * m.minutes : null;
  const checkPerMeeting = work === null ? null : clean(work / 60);
  const usable = work !== null && work > 0;
  /** One prevented misunderstanding in every N meetings pays for the check. */
  const breakEvenEvery = usable && m.damage ? clean((m.damage * 60) / work) : null;
  /** Share of the expected misunderstanding cost the check must prevent to pay for itself (above 1: it cannot). */
  const mustPrevent = usable && m.damage && m.oneIn ? clean((work * m.oneIn) / (60 * m.damage)) : null;
  const checkPerYear = work !== null && m.perYear !== null ? clean((work * m.perYear) / 60) : null;
  const atRiskPerYear = m.perYear !== null && m.oneIn && m.damage !== null ? clean((m.perYear * m.damage) / m.oneIn) : null;
  return { checkPerMeeting, breakEvenEvery, mustPrevent, checkPerYear, atRiskPerYear };
}

/** With cents, for when two whole-euro figures would read the same ("€10 is more than €10"). */
export const cents = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
/** True for the amounts eur() shows with cents: positive and under 50 cents. */
export const shownInCents = (n: number) => n > 0 && n < 0.5;
/** Whole euros; a positive amount under 50 cents keeps its cents, so it never reads as €0. */
export const eur = (n: number) =>
  shownInCents(n) ? cents(n) : new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
/** A count the host typed, with one decimal at most ("1.5 meetings"); "1" is singular. */
export const count = (n: number, noun: string) => {
  const shown = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 }).format(n);
  return `${shown} ${shown === "1" ? noun : `${noun}s`}`;
};
export const whole = (n: number) => new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 }).format(n);
/** "every meeting" / "every 12 meetings" — never "every 1 meetings". */
export const every = (n: number) => (Math.floor(n) <= 1 ? "every meeting" : `every ${whole(Math.floor(n))} meetings`);
/** The host's own rate, kept as entered ("every 1.9 meetings", "every 1.04 meetings"): rounding it would contradict the arithmetic. */
export const rate = (n: number) => {
  const shown = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 2 }).format(n);
  return n <= 1 || shown === "1" ? "every meeting" : `every ${shown} meetings`;
};
/** A share, never "0%" for a positive one: a check that costs anything has to prevent something. */
export const percent = (n: number) => (n > 0 && n < 0.0005 ? "under 0.1%" : new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: n < 0.1 ? 1 : 0 }).format(n));

export type Saved = { id: number; name: string; verdict: VerdictKind; checkPerYear: number | null; atRiskPerYear: number | null };
