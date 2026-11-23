/**
 * @file ReadyStepBar.tsx
 * @description P1718 R7: the room's step bar as /ready draws it. Until P1718 only Clarity Night reached /ready, so
 * the screen drew the bare default bar (Ready · Principle · Table · Compare · Feedback). The mastermind's room has
 * its own: Learn and prepare · Ready · Principle · (Canvas) · Table · Feedback, with no statement Compare. This
 * passes the same recipe-driven props /meet passes (EventRoomMeet.tsx's stepBar), so walking /ready to /meet
 * never changes the bar.
 *
 * /ready shows only the Ready step. A tap on a step it cannot show opens it in /meet: Learn as ?view=learn,
 * Feedback as ?view=feedback (use-room-views.ts), with the marks Continue carries.
 */
import { useNavigate } from 'react-router-dom';
import type { EventWithHost } from '@/app/types';
import { RoomSteps, type RoomStep } from '../rounds/RoomSteps';
import { hiddenRoomSteps } from '../rounds/hidden-room-steps';
import { eventCanvasTiming, useMyCanvasShared } from '../rounds/canvas-setup';
import { feedbackOpenAnytime, recipeForEvent } from '../series-recipes';
import { usePrepState } from '../prep/use-prep-state';

export function ReadyStepBar({ event, slug, fromEvent, viewerId }: {
  event: EventWithHost | null;
  slug: string | undefined;
  fromEvent: boolean | undefined;
  /** The caller's profile id (their room row's), for the learning's tick. */
  viewerId: string | null | undefined;
}) {
  const navigate = useNavigate();
  const recipe = recipeForEvent(event);
  const learnLabel = recipe.room.steps?.learn;
  const learnState = usePrepState(learnLabel && event ? event : null, viewerId ?? undefined);
  const withCanvas = !!event && !!recipe.mastermind && eventCanvasTiming(event) === 'at_event';
  const [canvasShared] = useMyCanvasShared(event?.id, withCanvas, null);
  const toMeet = (search: string) => navigate(`/events/${slug}/meet${search}`, { state: { fromReady: true, fromEvent } });
  const onSelect = (step: RoomStep) => {
    if (step === 'close') toMeet('?view=feedback');
    else if (step !== 'ready') toMeet('');
  };
  return (
    <RoomSteps
      current="ready"
      viewing="ready"
      onSelect={onSelect}
      hidden={hiddenRoomSteps(recipe)}
      closeOpen={feedbackOpenAnytime(event)}
      tableOpen={recipe.mastermind}
      withCanvas={withCanvas}
      canvasDone={withCanvas ? canvasShared : undefined}
      labels={recipe.room.steps ? { principle: recipe.room.steps.principle, close: recipe.room.steps.close } : undefined}
      learn={learnLabel && event
        ? {
            done: !learnState.loading && !learnState.error && learnState.learned,
            label: learnLabel,
            active: false,
            onOpen: () => toMeet('?view=learn'),
          }
        : undefined}
      className="min-w-0 flex-1"
    />
  );
}
