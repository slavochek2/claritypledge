/**
 * @file FlowRoundCard.tsx
 * @description P1529: the one place the room page chooses its round card. The sales mastermind gets its own screen; every
 * other flow renders RoundCard with exactly the props the page always gave it. The flow comes from the one resolver
 * (`recipeForEvent`), never from a series name.
 */
import type { EventRoomMember, EventRoomSelf, EventWithHost } from '@/app/types';
import { recipeForEvent } from '../series-recipes';
import { MastermindRoundCard } from './MastermindRoundCard';
import { RoundCard, type RoundMoment } from './RoundCard';

export type { RoundMoment };

export function FlowRoundCard({
  event,
  self,
  roster,
  ended,
  view,
  onMoment,
  onRoundsStarted,
}: {
  event: EventWithHost;
  self: EventRoomSelf | null;
  roster: EventRoomMember[];
  ended?: boolean;
  view: 'table' | 'compare' | 'hidden';
  onMoment?: (moment: RoundMoment) => void;
  /** Mastermind only: whether any round has started. */
  onRoundsStarted?: (started: boolean) => void;
}) {
  return recipeForEvent(event).mastermind ? (
    <MastermindRoundCard eventId={event.id} self={self} roster={roster} ended={ended} view={view} onMoment={onMoment} onRoundsStarted={onRoundsStarted} />
  ) : (
    <RoundCard
      eventId={event.id}
      statementTag={event.statementTag}
      eventTitle={event.title}
      self={self}
      roster={roster}
      ended={ended}
      view={view}
      onMoment={onMoment}
    />
  );
}
