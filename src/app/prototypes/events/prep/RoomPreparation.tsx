/**
 * @file RoomPreparation.tsx
 * @description P1529: the room's preparation line; the mastermind adds "Your Clarity Canvas for this event".
 */
import type { EventWithHost } from '@/app/types';
import { recipeForEvent } from '../series-recipes';
import { EventCanvasCard } from './EventCanvasCard';
import { PrepRoomBanner } from './PrepRoom';

export function RoomPreparation({ event }: { event: EventWithHost | null }) {
  return (
    <>
      <PrepRoomBanner event={event} />
      {event && recipeForEvent(event).mastermind && <EventCanvasCard eventId={event.id} />}
    </>
  );
}
