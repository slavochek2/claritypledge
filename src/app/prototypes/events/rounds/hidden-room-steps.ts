/** @file hidden-room-steps.ts @description Which of the room's steps a recipe's room does not have. */
import type { SeriesRecipe } from '../series-recipes';
import type { RoomStep } from './RoomSteps';

/** The steps a recipe's room does not have. P1529: the mastermind's room is Principle · Table · Feedback (no statement Compare). */
export function hiddenRoomSteps(recipe: Pick<SeriesRecipe, 'mastermind'> & { room: Pick<SeriesRecipe['room'], 'readiness' | 'rounds'> }): RoomStep[] {
  return [
    ...(recipe.room.readiness ? [] : (['ready'] as RoomStep[])),
    ...(recipe.room.rounds ? [] : (['table', 'compare'] as RoomStep[])),
    ...(recipe.mastermind ? (['compare'] as RoomStep[]) : []),
  ];
}
