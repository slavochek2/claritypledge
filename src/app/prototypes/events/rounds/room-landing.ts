/**
 * @file room-landing.ts
 * @description P1529 (founder 2026-11-13): where a person who has finished the principle lands in the room. Before any round exists, a sales
 * mastermind whose canvas is made at the event lands on Canvas (open from arrival); every other room, and every room once a round exists,
 * keeps landing on Table. A person who has not finished the principle lands on Principle (decided by the caller). Only the DEFAULT:
 * a tab the person picked wins until they are seated at a round, when everyone goes to their table.
 */
import type { RoomStep } from './RoomSteps';

/**
 * What the room stores when a tab is tapped: null ("follow the evening") when it is the current default, so the page moves on with the evening.
 * Any pick is dropped when the person is seated at a round (founder 2026-11-12: everyone goes to their table at round start).
 */
export const pickedStep = (next: RoomStep, defaultView: RoomStep): RoomStep | null => (next === defaultView ? null : next);

export function beforeRoundsStep(a: { canvasTab: boolean; roundsStarted: boolean }): RoomStep {
  return a.canvasTab && !a.roundsStarted ? 'canvas' : 'table';
}
