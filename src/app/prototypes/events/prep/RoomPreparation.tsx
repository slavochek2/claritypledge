/**
 * @file RoomPreparation.tsx
 * @description P1529: the room's preparation line. In the mastermind it is optional, so once rounds have started it steps aside
 * and the round's own task is the only thing asked. The mastermind's "Your Clarity Canvas for this event" card is drawn
 * by the room in the column of the round card, so every card shares one width.
 */
import type { EventWithHost } from '@/app/types';
import { recipeForEvent } from '../series-recipes';
import { PrepRoomBanner } from './PrepRoom';

export function RoomPreparation({ event, roundsStarted = false }: { event: EventWithHost | null; roundsStarted?: boolean }) {
  if (event && roundsStarted && recipeForEvent(event).mastermind) return null;
  return <PrepRoomBanner event={event} />;
}
