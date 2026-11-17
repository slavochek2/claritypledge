/**
 * @file use-hike-minutes.ts
 * @description P1675 R10: the hike introduction's length for someone who has done none of it yet, the number the registration
 * form prints ("I have N minutes"). It is the recipe's stated value (`prepare.statedMinutes`), never computed and never read
 * from points; null when the event's series states none. A plain function (no React hook).
 */
import type { EventWithHost } from '@/app/types';
import { recipeForEvent } from '../series-recipes';

export function hikeStatedMinutes(event: EventWithHost | null | undefined, enabled: boolean): number | null {
  if (!enabled || !event) return null;
  return recipeForEvent(event).prepare.statedMinutes ?? null;
}
