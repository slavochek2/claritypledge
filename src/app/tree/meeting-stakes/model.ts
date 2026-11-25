/** Data and the verdict rule for the /tree/meeting-stakes prototype. Sources and caveats: see MeetingStakes.tsx. */

export type DimensionKey = "fuzzy" | "late" | "damage" | "undo" | "split";
/** 1 low … 5 high; null = not set yet (nothing is pre-set). */
export type Level = 1 | 2 | 3 | 4 | 5;
export type Levels = Record<DimensionKey, Level | null>;
export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

/**
 * The five dimensions of high stakes, each on a scale (features/p1727, the five-bar card of demo film 4.7).
 * Every one reads the same way: further right is higher stakes.
 * [FOUNDER DECISION: the hint under each name.]
 */
export const DIMENSIONS: ReadonlyArray<{ key: DimensionKey; name: string; hint: string }> = [
  { key: "fuzzy", name: "Fuzzy intent", hint: "Hard to say exactly what is meant" },
  { key: "late", name: "Delayed feedback", hint: "You would find out late that it went wrong" },
  { key: "damage", name: "Serious damage", hint: "Getting it wrong would hurt badly" },
  { key: "undo", name: "Irreversible", hint: "Hard to undo once decided" },
  { key: "split", name: "Explanatory divergence", hint: "Each side would explain the result its own way" },
];

export const NO_LEVELS: Levels = { fuzzy: null, late: null, damage: null, undo: null, split: null };
export const isComplete = (levels: Levels) => DIMENSIONS.every((d) => levels[d.key] !== null);

/** Kinds of high-stakes meeting from docs/high-stakes-examples.md. Picking one only names the meeting. */
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

/** A level that counts as high. */
const HIGH = 4;
export const highOf = (levels: Levels) => DIMENSIONS.filter((d) => (levels[d.key] ?? 0) >= HIGH);

export type Verdict = "high" | "some" | "low";

/**
 * [FOUNDER DECISION: the threshold is open in p1727; this rule is an agent placeholder.]
 * High stakes: serious damage is high and at least one other dimension is too. Some: any one is high.
 */
export function verdictOf(levels: Levels): Verdict {
  const high = highOf(levels);
  if (high.length === 0) return "low";
  return high.some((d) => d.key === "damage") && high.length >= 2 ? "high" : "some";
}

/** "a, b and c". */
export const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** [FOUNDER DECISION: all wording.] */
export function verdictCopy(levels: Levels): { title: string; body: string } {
  const names = list(highOf(levels).map((d) => d.name.toLowerCase()));
  switch (verdictOf(levels)) {
    case "high":
      return { title: "High stakes", body: `High on ${names}. Check that everyone understood the same thing before it is decided.` };
    case "some":
      // Says why it is not "high", so two cards with three high bars each never look inconsistent.
      return {
        title: "Some stakes",
        body: levels.damage !== null && levels.damage >= HIGH ? "Serious damage is high, nothing else is. A short check may be worth it." : `High on ${names}, but serious damage is not. A short check may be worth it.`,
      };
    case "low":
      return { title: "Low stakes", body: "Nothing is high. A gap in understanding here would likely show up early and cost little." };
  }
}
