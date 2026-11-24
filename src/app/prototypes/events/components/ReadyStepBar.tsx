/**
 * @file ReadyStepBar.tsx
 * @description P1718 R7: the room's step bar as /ready draws it. Until P1718 only Clarity Night reached /ready, so
 * the screen drew the bare default bar (Ready · Principle · Table · Compare · Feedback). The mastermind's room has
 * its own: Learn and prepare · Ready · Principle · (Canvas) · Table · Review, with no statement Compare. This
 * passes the same recipe-driven props /meet passes (EventRoomMeet.tsx's stepBar), so walking /ready to /meet
 * never changes the bar.
 *
 * /ready shows only the Ready step. A tap on a step it cannot show opens it in /meet: Learn as ?view=learn,
 * the last step (Feedback, the mastermind's Review) as ?view=feedback (use-room-views.ts), with the marks Continue
 * carries. Leaving Ready by the bar with no answer stored is a skip like Skip itself (R4), so re-entry through /room
 * does not ask again. The bar shares the screen's one-tap guard: a tap while Continue's save is in flight does nothing,
 * so it can neither record a skip over the answer being saved nor be followed by Continue's own navigation.
 */
import type { MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import type { EventWithHost } from '@/app/types';
import { RoomSteps, type RoomStep } from '../rounds/RoomSteps';
import { hiddenRoomSteps } from '../rounds/hidden-room-steps';
import { eventCanvasTiming, useMyCanvasShared } from '../rounds/canvas-setup';
import { feedbackOpenAnytime, recipeForEvent } from '../series-recipes';
import { useLearned } from '../prep/use-learned';
import { rememberReadySkipped } from './ready-skip-memory';

export function ReadyStepBar({ event, slug, fromEvent, viewerId, readyDone, leaving }: {
  event: EventWithHost | null;
  slug: string | undefined;
  fromEvent: boolean | undefined;
  /** The caller's profile id (their room row's), for the learning's tick. */
  viewerId: string | null | undefined;
  /** P1718 R10: a stored readiness value — the same Ready tick /meet draws. */
  readyDone: boolean;
  /** EventRoomReady's one-tap guard (R3): set once the person is leaving by any control. */
  leaving: MutableRefObject<boolean>;
}) {
  const navigate = useNavigate();
  const recipe = recipeForEvent(event);
  const learnLabel = recipe.room.steps?.learn;
  // Review round 8: only the two reads the Learn tick needs, not the preparation page's plan (use-learned.ts).
  const learnState = useLearned(learnLabel && event ? event : null, viewerId ?? undefined);
  const withCanvas = !!event && !!recipe.mastermind && eventCanvasTiming(event) === 'at_event';
  // Review round 12 (Codex): no Canvas read while known offline; coming back online re-renders and asks it then.
  const { offline } = useConnectivity();
  const [canvasShared] = useMyCanvasShared(event?.id, withCanvas && !offline, null);
  const toMeet = (search: string) => {
    if (leaving.current) return;
    leaving.current = true;
    if (!readyDone) rememberReadySkipped(viewerId, event?.id);
    navigate(`/events/${slug}/meet${search}`, { state: { fromReady: true, fromEvent } });
  };
  const onSelect = (step: RoomStep) => {
    if (step === 'close') toMeet('?view=feedback');
    else if (step !== 'ready') toMeet('');
  };
  return (
    <RoomSteps
      current="ready"
      viewing="ready"
      onSelect={onSelect}
      done={{ ready: readyDone }}
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
