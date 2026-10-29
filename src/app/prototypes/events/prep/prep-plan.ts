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
  /** P1542: the series recipe's steps; absent = every step (today's list). */
  steps?: PlanStep[];
  /** P1542 founder decision (A): keep the steps whose part was finished elsewhere (see `finishedSteps`). */
  keepFinished?: boolean;
}

export function buildPlan({ parts, startedAt, hasStatementTag, eventPointCount, steps = ALL_STEPS, keepFinished = false }: PlanInput): PlanStep[] {
  return steps.filter((s) => {
    const part = STEP_PART[s];
    if (part) return keepFinished || partInPlan(parts, part, startedAt);
    if (s === 'stake') return hasStatementTag && eventPointCount !== 0;
    return true;
  });
}

/**
 * P1542 founder UAT round 5 (2026-10-23): "learned" counts wherever it was done — this event's learning, another
 * event's preparation, or the general /prepare. The per-account record of that is the two once-per-person parts every
 * one of those flows completes: the cognitive-understanding video and the cmp7 statements (the principle intro can be
 * skipped, so it is not proof). This event's own completed learning counts too.
 */
export function hasLearned(parts: PrepPartRow[], completedAt: string | null | undefined): boolean {
  return !!completedAt || (isPartDone(parts, 'cognitive_video') && isPartDone(parts, 'cmp7'));
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

/** P1542 founder decision (A): this registration's finished steps plus every plan step whose once-per-person part is
 *  already completed (done in another event's learning or on /prepare) — shown ticked, never asked again by default. */
export function finishedSteps(plan: PlanStep[], stepsDone: PrepStepKey[], parts: PrepPartRow[]): PrepStepKey[] {
  const inPlan = plan.filter((s) => { const p = STEP_PART[s]; return stepsDone.includes(s) || (!!p && isPartDone(parts, p)); });
  // In plan order; a recorded step no longer in the plan is kept after them (it is saved back as it was).
  return [...inPlan, ...stepsDone.filter((s) => !(inPlan as PrepStepKey[]).includes(s))];
}

/** `prev` plus any step of `incoming` not in it, in plan order; returns `prev` itself when nothing is new. */
export function mergeDone(plan: PlanStep[], prev: PrepStepKey[], incoming: PrepStepKey[]): PrepStepKey[] {
  const added = incoming.filter((s) => !prev.includes(s));
  if (added.length === 0) return prev;
  const all = [...prev, ...added];
  return [...plan.filter((s) => all.includes(s)), ...all.filter((s) => !(plan as PrepStepKey[]).includes(s))];
}

/** A statements card is answered once it carries the person's position. */
/** The same card ids, in any order (a snapshot is stale when its ids differ, even at the same count). */
export function sameIds(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** The card ids a statements step should snapshot now, or null to keep `prev`. First entry snapshots the unanswered
 *  cards; a hike's finished step (`reopened`, P1542 decision A) shows every card, whatever an earlier snapshot held —
 *  compared by id, so two replaced cards at the same count still refresh (review round 2). */
export function nextSnapshot(prev: string[] | undefined, points: { id: string; userPosition?: unknown }[] | null, reopened: boolean): string[] | null {
  if (!points) return null;
  const ids = cardsToShow(points, reopened);
  if (prev && (!reopened || sameIds(prev, ids))) return null;
  return ids;
}

export const isAnswered = (p: { userPosition?: unknown }) => !!p.userPosition;

/** P1542 (A) review: where Continue goes from `screen` — the next unfinished step after it; where the recipe keeps
 *  finished steps (a hike, reopened out of order) else the first unfinished step anywhere in the plan; 'end' (and
 *  completion) only once every step is finished. `skippedOver` are the passed-over statements steps between. */
export function nextTarget(plan: PlanStep[], screen: PlanStep, done: PrepStepKey[], keepFinished: boolean, isSkippable: (s: PlanStep) => boolean) {
  const rest = plan.slice(plan.indexOf(screen) + 1);
  const ahead = rest.find((s) => !done.includes(s) && !isSkippable(s));
  const skippedOver = rest.slice(0, ahead ? rest.indexOf(ahead) : rest.length).filter((s) => !done.includes(s));
  const all = [...done, ...skippedOver];
  const earlier = !ahead && keepFinished ? plan.find((s) => !all.includes(s) && !isSkippable(s)) : undefined;
  return { target: (ahead ?? earlier ?? 'end') as PlanStep | 'end', skippedOver };
}

/** P1542 decision (A): the step Back opens from `screen`. Where the recipe keeps finished steps (a hike), the step just
 *  before, finished or not ("they can go back"); otherwise a statements step with nothing left to answer is passed over. */
export function backTarget(plan: PlanStep[], screen: PlanStep, keepFinished: boolean, isSkippable: (s: PlanStep) => boolean): PlanStep | 'plan' {
  const before = plan.slice(0, Math.max(plan.indexOf(screen), 0)).reverse();
  return before.find((s) => keepFinished || !isSkippable(s)) ?? 'plan';
}

/** The cards a statements step lists: on first entry the unanswered ones. A finished step reopened where the recipe
 *  keeps finished steps (a hike) lists every card, whatever an earlier visit's snapshot held. */
export function cardsToShow(points: { id: string; userPosition?: unknown }[], finishedAndKept: boolean): string[] {
  // Chosen (review H3): a finished step reopened shows ALL its cards — the answered ones with their answers, plus any
  // card added since, which is the only one it asks.
  return finishedAndKept ? points.map((p) => p.id) : points.filter((p) => !isAnswered(p)).map((p) => p.id);
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
