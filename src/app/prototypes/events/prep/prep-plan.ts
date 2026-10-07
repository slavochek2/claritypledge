/**
 * @file prep-plan.ts
 * @description P1336 — which preparation steps a person has, how long they take, and how far
 * they got. Pure functions only (unit-tested in src/tests/p1336-prep-plan.test.ts); the page,
 * the confirmation block and the room gate all read the same answers from here.
 *
 * Once per person: the intro video, the cognitive-understanding video, the principle's intro
 * screen and the cmp7 statements. Every event: the opt-in decision, the event's positions and
 * the research question. A part counts as done only when COMPLETED against its current content
 * version — a skip is not completion, and bumping a version re-shows that part.
 */
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
import type { PrepPart, PrepPartRow, PrepStepKey } from '@/app/data/event-prep-service';

/** Bump one of these to re-show that part to everyone who completed an older version. */
export const PART_VERSIONS: Record<PrepPart, number> = {
  intro_video: 1,
  cognitive_video: 1,
  principle_intro: 1,
  cmp7: 1,
};

/** The steps after the plan screen, in order. */
export type PlanStep = Exclude<PrepStepKey, 'plan'>;
export const ALL_STEPS: PlanStep[] = ['welcome', 'story', 'principle', 'cmp7', 'stake', 'research'];

/** The once-per-person part each whole step stands for. The principle step is every-event;
 * only its first screen (the intro clip) is the `principle_intro` part. */
export const STEP_PART: Partial<Record<PlanStep, PrepPart>> = {
  welcome: 'intro_video',
  story: 'cognitive_video',
  cmp7: 'cmp7',
};

export const CMP7_TAG = 'cmp7';

/** /meet's standard level (DEFAULT_LEVEL = 3 in meeting-terms-page.tsx). */
export const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;

export const STEP_LABELS: Record<PlanStep, string> = {
  welcome: 'See how this event is different',
  story: 'Learn the definition of cognitive understanding',
  principle: 'Decide about your participation in a new social norm',
  cmp7: 'Share your view on the expected benefits',
  stake: 'Set your positions on the points we discuss',
  research: "Decide if you'd like to volunteer in R&D",
};

/** Step 5 names the event's point count and topic. */
export function stepLabel(step: PlanStep, eventPointCount: number | null, topic: string): string {
  if (step === 'stake' && eventPointCount) {
    return `Set your positions on ${eventPointCount} points about “${topic}”`;
  }
  return STEP_LABELS[step];
}

/** Completed against the current version. */
export function isPartDone(rows: PrepPartRow[], part: PrepPart): boolean {
  const row = rows.find((r) => r.part === part);
  return !!row?.completedAt && row.contentVersion >= PART_VERSIONS[part];
}

/**
 * A part completed DURING this registration's preparation still belongs to this plan (shown
 * ticked) — otherwise finishing step 1 would remove it and the person's "Step 2 of 6" would
 * turn into "Step 1 of 5" mid-flow.
 */
function partInPlan(rows: PrepPartRow[], part: PrepPart, startedAt: string | null): boolean {
  if (!isPartDone(rows, part)) return true;
  const row = rows.find((r) => r.part === part);
  return !!startedAt && !!row?.completedAt && row.completedAt >= startedAt;
}

export interface PlanInput {
  parts: PrepPartRow[];
  /** This registration's started_at (null before Prepare now). */
  startedAt: string | null;
  /** The event has a statement tag. */
  hasStatementTag: boolean;
  /** The tag's point count; null while loading (the step is kept until known). */
  eventPointCount: number | null;
}

export function buildPlan({ parts, startedAt, hasStatementTag, eventPointCount }: PlanInput): PlanStep[] {
  return ALL_STEPS.filter((s) => {
    const part = STEP_PART[s];
    if (part) return partInPlan(parts, part, startedAt);
    if (s === 'stake') return hasStatementTag && eventPointCount !== 0;
    return true;
  });
}

/** Whether the principle step opens on its intro clip (3a) for this person. */
export function showsPrincipleIntro(parts: PrepPartRow[], startedAt: string | null): boolean {
  return partInPlan(parts, 'principle_intro', startedAt);
}

/** A person with no once-per-person part completed — "new registrant" for the minutes. */
export function isNewPerson(parts: PrepPartRow[]): boolean {
  return !(Object.keys(PART_VERSIONS) as PrepPart[]).some((p) => isPartDone(parts, p));
}

// ─── clips ─────────────────────────────────────────────────────────────────────────────

export type ClipKey = 'welcome' | 'story' | 'principle' | 'research';

/** Each clip's own length (ffprobe of the served files), played at 1.15x. Never read from the
 * loaded media — the minutes must be right before anything loads. */
export const PLAYBACK_RATE = 1.15;
export const CLIP_SECONDS: Record<ClipKey, number> = {
  welcome: 139.4,
  story: 84.4,
  principle: 50.03,
  research: 60.13,
};

/** Real watching time at 1.15x — the poster badge and the minutes both use it. */
export const watchSeconds = (clip: ClipKey) => Math.round(CLIP_SECONDS[clip] / PLAYBACK_RATE);

// ─── minutes ───────────────────────────────────────────────────────────────────────────

export const SECONDS_PER_DECISION = 20;
const READING_WORDS_PER_MINUTE = 200;

export const PRINCIPLE_WORDS = sectionsForLevel(PRINCIPLE_LEVEL)
  .map((s) => `${s.heading} ${s.text}`)
  .join(' ')
  .split(/\s+/)
  .filter(Boolean).length;

export interface CardCounts {
  cmp7: number;
  stake: number;
}

export function stepSeconds(step: PlanStep, cards: CardCounts, withPrincipleIntro: boolean): number {
  switch (step) {
    case 'welcome':
      return watchSeconds('welcome');
    case 'story':
      return watchSeconds('story');
    case 'principle':
      return (
        (withPrincipleIntro ? watchSeconds('principle') : 0) +
        Math.round((PRINCIPLE_WORDS / READING_WORDS_PER_MINUTE) * 60) +
        2 * SECONDS_PER_DECISION
      );
    case 'cmp7':
      return cards.cmp7 * SECONDS_PER_DECISION;
    case 'stake':
      return cards.stake * SECONDS_PER_DECISION;
    case 'research':
      return watchSeconds('research') + SECONDS_PER_DECISION;
  }
}

/** One plan row's minutes: whole minutes, never below 1. */
export const stepMinutes = (step: PlanStep, cards: CardCounts, withPrincipleIntro: boolean) =>
  Math.max(1, Math.round(stepSeconds(step, cards, withPrincipleIntro) / 60));

/** The question's N: the sum of the rows the person still has, so the two always agree. */
export function minutesFor(steps: PlanStep[], cards: CardCounts, withPrincipleIntro: boolean): number {
  return steps.reduce((sum, s) => sum + stepMinutes(s, cards, withPrincipleIntro), 0);
}

// ─── progress ──────────────────────────────────────────────────────────────────────────

export interface Progress {
  done: number;
  total: number;
  complete: boolean;
}

export function progressOf(plan: PlanStep[], stepsDone: PrepStepKey[], completedAt: string | null): Progress {
  const done = plan.filter((s) => stepsDone.includes(s)).length;
  return { done: completedAt ? plan.length : done, total: plan.length, complete: !!completedAt };
}

/** Steps still to do, in order (the resume point is the first). */
export function remainingSteps(plan: PlanStep[], stepsDone: PrepStepKey[]): PlanStep[] {
  return plan.filter((s) => !stepsDone.includes(s));
}

/**
 * The event's topic for "Set your positions on N points about “{topic}”": the title without its
 * series prefix ("Clarity Night #2: "), up to the first sentence end.
 * "Clarity Night #2: AI and Your Ikigai. Sinek, Tan … Disagree" → "AI and Your Ikigai".
 */
export function eventTopic(title: string): string {
  const withoutSeries = title.replace(/^[^:]{0,40}#\s*\d+\s*:\s*/, '').trim();
  // Lookahead, not lookbehind: Safari < 16.4 cannot parse a lookbehind, and the whole page fails to load.
  const firstSentence = withoutSeries.match(/^[\s\S]*?[.?!](?=\s)/)?.[0] ?? withoutSeries;
  return firstSentence.replace(/[.]$/, '').trim() || title;
}
