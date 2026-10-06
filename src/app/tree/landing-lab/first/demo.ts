/**
 * Screen 4, the demonstration, as data. A fixed sequence the visitor reveals one step at
 * a time with Next.
 *
 * The rule this file exists to enforce: a number is shown only as a human rating, and
 * every rating names who gave it and what it rates. The type makes `rater` and `rates`
 * required; `ratingForDisplay` refuses, at run time, to hand a number to the page when
 * either is missing, so data that slipped past the type (a cast, JSON, a later edit)
 * still cannot put an unattributed number on screen.
 *
 * Content: the founder is the speaker, writes the statement and rates both explain-backs
 * himself. Until he has, `pending` is true and the page says so.
 *
 * Six beats (see `demoView`): the statement; the first try; a guess at its rating; the
 * rating; the second try, with the first folded to one row; the second rating.
 */
import { TEXT } from "./copy";

export type StepId = "statement" | "explainBack1" | "rating1" | "explainBack2" | "rating2";

export interface Rating {
  /** Who gave the number. Required. A rating without a rater is not rendered. */
  rater: string;
  /** The step being rated. Required. */
  rates: StepId;
  value: number;
  outOf: 10;
}

/** 0 is the statement, shown above both tries. Tries 1 and 2 are explain-back plus rating. */
export type Round = 0 | 1 | 2;

export type DemoStep =
  | { id: "statement"; round: 0; kind: "statement"; label: string; text: string }
  | { id: "explainBack1" | "explainBack2"; round: 1 | 2; kind: "explainBack"; label: string; text: string }
  | { id: "rating1" | "rating2"; round: 1 | 2; kind: "rating"; label: string; rating: Rating; missed?: string };

export interface Demonstration {
  /** True while the content is a sample and the ratings are not the founder's own. */
  pending: boolean;
  steps: readonly DemoStep[];
}

const SPEAKER = TEXT.demoSpeaker;

export const DEMO: Demonstration = {
  pending: true,
  steps: [
    { id: "statement", round: 0, kind: "statement", label: TEXT.demoSpeaker, text: TEXT.demoSampleStatement },
    {
      id: "explainBack1",
      round: 1,
      kind: "explainBack",
      label: TEXT.demoExplainBack,
      text: TEXT.demoSampleExplainBack1,
    },
    {
      id: "rating1",
      round: 1,
      kind: "rating",
      label: TEXT.demoRating,
      rating: { rater: SPEAKER, rates: "explainBack1", value: 4, outOf: 10 },
      missed: TEXT.demoSampleMissed,
    },
    {
      id: "explainBack2",
      round: 2,
      kind: "explainBack",
      label: TEXT.demoSecondExplainBack,
      text: TEXT.demoSampleExplainBack2,
    },
    {
      id: "rating2",
      round: 2,
      kind: "rating",
      label: TEXT.demoRating,
      rating: { rater: SPEAKER, rates: "explainBack2", value: 9, outOf: 10 },
    },
  ],
};

const STEP_IDS = new Set<StepId>(["statement", "explainBack1", "rating1", "explainBack2", "rating2"]);

export interface DisplayRating {
  rater: string;
  rates: StepId;
  value: number;
  outOf: 10;
}

/**
 * The only way a rating reaches the page. Returns null, and so no number, for anything
 * without a non-empty rater, without a known rated step, or with a value that is not a
 * whole number from 0 to 10.
 */
export function ratingForDisplay(candidate: unknown): DisplayRating | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  const { rater, rates, value, outOf } = candidate as Partial<Record<keyof Rating, unknown>>;
  if (typeof rater !== "string" || rater.trim() === "") return null;
  if (typeof rates !== "string" || !STEP_IDS.has(rates as StepId)) return null;
  if (outOf !== 10) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) return null;
  return { rater, rates: rates as StepId, value, outOf: 10 };
}

/**
 * Checks a whole demonstration: every rating step must pass `ratingForDisplay` and must
 * rate a step that comes before it. Returns the problems found, empty when it is sound.
 */
export function validateDemonstration(demo: Demonstration): string[] {
  const problems: string[] = [];
  const seen = new Set<StepId>();
  for (const step of demo.steps) {
    if (step.kind === "rating") {
      const r = ratingForDisplay(step.rating);
      if (!r) problems.push(`${step.id}: rating has no rater, no rated step, or an invalid value`);
      else if (!seen.has(r.rates)) problems.push(`${step.id}: rates ${r.rates}, which is not shown before it`);
    }
    seen.add(step.id);
  }
  return problems;
}

export type RatingStep = Extract<DemoStep, { kind: "rating" }>;
export type ExplainBackStep = Extract<DemoStep, { kind: "explainBack" }>;
export type StatementStep = Extract<DemoStep, { kind: "statement" }>;

/** One explain-back attempt and the speaker's rating of it. */
export interface Try {
  round: 1 | 2;
  label: string;
  explainBack: ExplainBackStep;
  rating: RatingStep;
}

/** What screen 4 shows at a beat. */
export interface DemoView {
  statement: StatementStep;
  /** Finished earlier tries, each folded to one summary row. */
  summaries: Try[];
  /** The try being revealed, or null on the first beat. */
  current: Try | null;
  /** The visitor is asked to guess the current rating before it is revealed. */
  guessing: boolean;
  /** The current try's rating is on screen. */
  ratingShown: boolean;
  /** Every rating on screen, in order, each through the rater check. */
  revealedRatings: Rating[];
}

/** Number of beats on screen 4. */
export const DEMO_BEATS = 6;

function stepOf<K extends DemoStep["kind"]>(kind: K, round: Round): Extract<DemoStep, { kind: K }> {
  const found = DEMO.steps.find((s) => s.kind === kind && s.round === round);
  if (!found) throw new Error(`landing-first: demonstration has no ${kind} in round ${round}`);
  return found as Extract<DemoStep, { kind: K }>;
}

const TRY_LABEL = { 1: TEXT.demoRound1, 2: TEXT.demoRound2 } as const;

function tryOf(round: 1 | 2): Try {
  return { round, label: TRY_LABEL[round], explainBack: stepOf("explainBack", round), rating: stepOf("rating", round) };
}

export function demoView(beat: number): DemoView {
  const b = Math.min(DEMO_BEATS - 1, Math.max(0, beat));
  const first = tryOf(1);
  const second = tryOf(2);
  const current = b === 0 ? null : b <= 3 ? first : second;
  const ratingShown = b === 3 || b === 5;
  const summaries = b >= 4 ? [first] : [];
  const revealed: RatingStep[] = [...summaries.map((t) => t.rating), ...(ratingShown && current ? [current.rating] : [])];
  return {
    statement: stepOf("statement", 0),
    summaries,
    current,
    guessing: b === 2,
    ratingShown,
    revealedRatings: revealed.map((r) => ratingForDisplay(r.rating)).filter((r): r is DisplayRating => r !== null),
  };
}
