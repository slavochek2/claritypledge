/**
 * @file prep-timing.ts
 * @description P1529 E2: what the sales mastermind's preparation holds depends on where the Clarity Canvas is made. At the event
 * (the default) the preparation is the communication part only: the two videos, the Clarity Meeting Principle and its points, and the
 * misunderstanding statements the "join as a member" learning (/prepare) uses. Before the event it is today's flow, ending in the
 * canvas step. Every other flow is untouched. The misunderstanding statements ride the plan's existing statements step ('stake'),
 * whose tag they supply, so counts, snapshots, skipping and Back behave as they do for any statement tag.
 */
import { canvasTimingOf } from '@/app/types/event-fields';
import { eventFlow, recipeForEvent, type FlowEvent } from '../series-recipes';
import type { PlanStep } from './prep-plan';

export const MISUNDERSTANDING_TAG = 'misunderstanding';
/** Said once, here: what the statements step is called and asks when it carries the misunderstanding points. [FOUNDER DECISION: copy, taken from /prepare's own labels] */
export const MISUNDERSTANDING_LABEL = 'Share how you think understanding works between people';
export const MISUNDERSTANDING_TITLE = "Let's find out how you think understanding works between people";

type TimedEvent = NonNullable<FlowEvent> & { canvasTiming?: string | null; statementTag?: string | null };

/** A sales mastermind whose canvas is made at the event (the default for that flow). */
export function canvasAtEvent(event: FlowEvent): boolean {
  const e = event as TimedEvent | null | undefined;
  return eventFlow(event) === 'sales-mastermind' && canvasTimingOf(e?.canvasTiming) === 'at_event';
}

/** The plan's step list for this event. */
export function prepareStepsFor(event: FlowEvent): PlanStep[] {
  const { steps, listeningGame } = recipeForEvent(event).prepare;
  const list: PlanStep[] = canvasAtEvent(event) ? ['story', 'principle', 'game', 'cmp7', 'stake'] : steps;
  // P1685: the recipe's switch removes the game step from the plan.
  return listeningGame ? list : list.filter((s) => s !== 'game');
}

/** The statement tag the plan's statements step reads. */
export function prepStatementTag(event: FlowEvent): string | null {
  if (canvasAtEvent(event)) return MISUNDERSTANDING_TAG;
  return (event as TimedEvent | null | undefined)?.statementTag ?? null;
}
