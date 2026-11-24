/** Data and arithmetic for the /tree/meeting-stakes prototype. Sources and caveats: see MeetingStakes.tsx. */
export type Level = 0 | 1 | 2;
export type ConditionKey = "fuzzy" | "late" | "damage" | "undo" | "blame";
export type Ratings = Record<ConditionKey, Level>;

export const CONDITIONS: ReadonlyArray<{
  key: ConditionKey;
  name: string;
  question: string;
  options: readonly [string, string, string];
}> = [
  {
    key: "fuzzy",
    name: "Fuzzy intent",
    question: "How clearly can everyone say what is being decided, and why?",
    options: ["Clearly", "Roughly", "Vaguely"],
  },
  {
    key: "late",
    name: "Late results",
    question: "If it went wrong, when would you find out?",
    options: ["Within days", "Within weeks", "Months later"],
  },
  {
    key: "damage",
    name: "Damage",
    question: "If it went wrong, how bad would it be for the people it lands on?",
    options: ["Minor", "Serious", "Severe"],
  },
  {
    key: "undo",
    name: "Hard to undo",
    question: "If it went wrong, could you undo it?",
    options: ["Easily", "At a cost", "No"],
  },
  {
    key: "blame",
    name: "Two explanations",
    question: "If it went wrong, would each side explain it its own way?",
    options: ["No, the cause would be plain", "Maybe", "Yes"],
  },
];

export const NONE: Ratings = { fuzzy: 0, late: 0, damage: 0, undo: 0, blame: 0 };
export const usual = (r: Partial<Ratings>): Ratings => ({ ...NONE, ...r });

/** The usual pattern per meeting. A starting point the visitor is told to correct. */
export const MEETINGS: ReadonlyArray<{ group: string; items: ReadonlyArray<{ name: string; usual: Ratings }> }> = [
  {
    group: "Meetings",
    items: [
      { name: "Project kickoff", usual: usual({ late: 2, blame: 2, damage: 2 }) },
      { name: "Pre-mortem", usual: usual({ fuzzy: 2, late: 2 }) },
      { name: "Hiring decision", usual: usual({ damage: 2, late: 2, undo: 1, fuzzy: 2 }) },
      { name: "Onboarding a new employee", usual: usual({ fuzzy: 2, late: 2 }) },
      { name: "Rollout kickoff (AI rollout, reorganisation)", usual: usual({ late: 2, damage: 2, blame: 2 }) },
      { name: "Post-mortem", usual: usual({ blame: 2, late: 2 }) },
      { name: "Quarterly or yearly review", usual: usual({ fuzzy: 2, damage: 2, late: 2 }) },
      { name: "Firing meeting", usual: usual({ undo: 2, damage: 2 }) },
    ],
  },
  {
    group: "Shareholder and board decisions",
    items: [
      { name: "Issuing new shares", usual: usual({ undo: 2, damage: 2 }) },
      { name: "Amending the articles of association", usual: usual({ undo: 2, damage: 2, late: 2 }) },
      { name: "Sale of the company or a merger", usual: usual({ undo: 2, damage: 2 }) },
      { name: "Taking on major debt", usual: usual({ damage: 2, late: 2 }) },
      { name: "Approving the annual budget or plan", usual: usual({ fuzzy: 2, late: 2 }) },
      { name: "Appointing or removing a director or the CEO", usual: usual({ damage: 2, undo: 1, late: 2 }) },
      { name: "Paying dividends", usual: usual({ damage: 2 }) },
      { name: "Related-party transaction", usual: usual({ damage: 2, blame: 2 }) },
      { name: "Winding up the company", usual: usual({ undo: 2, damage: 2 }) },
    ],
  },
  { group: "Other", items: [{ name: "Another meeting", usual: NONE }] },
];
export const ALL_MEETINGS = MEETINGS.flatMap((g) => g.items);

export type VerdictKind = "skip" | "settles" | "borderline" | "worth";
export const VERDICT: Record<VerdictKind, { title: string; body: string }> = {
  skip: {
    title: "Skip the check",
    body: "You said the result would not suffer if people read this meeting differently.",
  },
  settles: {
    title: "Skip the check: this one settles itself",
    body: "If people misunderstand each other here, you will see it quickly and fix it cheaply.",
  },
  borderline: {
    title: "Borderline",
    body: "Check only the points that the answers below flag.",
  },
  worth: {
    title: "Worth a check",
    body: "At least one of your answers says a misunderstanding here would be costly and would not sort itself out. The bars below show which.",
  },
};

/** Thresholds are agent-proposed: any "strong" answer, or three points in total, is worth a check. */
export function verdictOf(depends: boolean, r: Ratings): VerdictKind {
  if (!depends) return "skip";
  const levels = Object.values(r);
  const sum = levels.reduce<number>((a, b) => a + b, 0);
  if (sum === 0) return "settles";
  if (levels.includes(2) || sum >= 3) return "worth";
  return "borderline";
}

export type Money = { perYear: number; people: number; hourly: number; minutes: number; damage: number; oneIn: number };
export const MONEY_DEFAULTS: Money = { perYear: 4, people: 6, hourly: 60, minutes: 15, damage: 20000, oneIn: 10 };

export function compute(m: Money) {
  const checkPerMeeting = m.people * m.hourly * (m.minutes / 60);
  const checkPerYear = checkPerMeeting * m.perYear;
  const atRiskPerYear = m.oneIn > 0 ? (m.perYear / m.oneIn) * m.damage : 0;
  const breakEven = checkPerMeeting > 0 ? m.damage / checkPerMeeting : Infinity;
  return { checkPerMeeting, checkPerYear, atRiskPerYear, breakEven };
}

export const eur = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
export const whole = (n: number) => new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 }).format(n);

export type Saved = { id: number; name: string; verdict: VerdictKind; perYear: number; checkPerYear: number; atRiskPerYear: number };
