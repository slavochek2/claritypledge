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
import { useState, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import type { EventWithHost } from '@/app/types';
import { RoomSteps, type RoomStep } from '../rounds/RoomSteps';
import { hiddenRoomSteps } from '../rounds/hidden-room-steps';
import { eventCanvasTiming, useMyCanvasShared } from '../rounds/canvas-setup';
import { feedbackOpenAnytime, recipeForEvent } from '../series-recipes';
import { useLearned } from '../prep/use-learned';
import { rememberReadySkipped } from './ready-skip-memory';

/** What the bar's ticks need from the server: the learning and the Canvas. */
export interface ReadyStepBarReads {
  learned: boolean;
  canvasShared: boolean | undefined;
}

/**
 * The step bar's reads, held by the screen (EventRoomReady) rather than the bar. Review round 14 (Codex, metered rule 4):
 * the screen keeps its state through the access check's loader on a reconnect, which unmounts the bar, so read here the
 * Learn and Canvas reads are counted once a visit however often that loader shows. `enabled` is the screen's "the
 * question has shown": none of these reads for the host, a seated person or a past evening, who never see it.
 */
export function useReadyStepBarReads(event: EventWithHost | null, viewerId: string | null | undefined, enabled: boolean): ReadyStepBarReads {
  const recipe = recipeForEvent(event);
  const learnLabel = recipe.room.steps?.learn;
  // Review round 8: only the two reads the Learn tick needs, not the preparation page's plan (use-learned.ts).
  const learnState = useLearned(enabled && learnLabel && event ? event : null, viewerId ?? undefined);
  const withCanvas = !!event && !!recipe.mastermind && eventCanvasTiming(event) === 'at_event';
  // Review round 12 (Codex): no Canvas read while known offline. Round 13 (Codex, metered rule 4): once asked online it
  // stays asked, so going offline and back does not read it again. Round 14 (Gemini): asked per event. Round 15 (Gemini):
  // and per viewer, as useLearned is, so another person signed in on this screen gets their own Canvas read.
  const { offline } = useConnectivity();
  const canvasKey = event && viewerId ? `${event.id}:${viewerId}` : null;
  const [canvasAskedFor, setCanvasAskedFor] = useState<string | null>(null);
  if (enabled && withCanvas && !offline && canvasKey && canvasAskedFor !== canvasKey) setCanvasAskedFor(canvasKey);
  const [canvasShared] = useMyCanvasShared(event?.id, withCanvas && !!canvasKey && canvasAskedFor === canvasKey, viewerId ?? null);
  return {
    learned: !learnState.loading && !learnState.error && learnState.learned,
    canvasShared: withCanvas ? canvasShared : undefined,
  };
}

export function ReadyStepBar({ event, slug, fromEvent, viewerId, readyDone, leaving, reads }: {
  event: EventWithHost | null;
  slug: string | undefined;
  fromEvent: boolean | undefined;
  /** The caller's profile id (their room row's), for the skip it remembers. */
  viewerId: string | null | undefined;
  /** P1718 R10: a stored readiness value — the same Ready tick /meet draws. */
  readyDone: boolean;
  /** EventRoomReady's one-tap guard (R3): set once the person is leaving by any control. */
  leaving: MutableRefObject<boolean>;
  /** The ticks' reads, from `useReadyStepBarReads` in the screen. */
  reads: ReadyStepBarReads;
}) {
  const navigate = useNavigate();
  const recipe = recipeForEvent(event);
  const learnLabel = recipe.room.steps?.learn;
  const withCanvas = !!event && !!recipe.mastermind && eventCanvasTiming(event) === 'at_event';
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
      phoneTicks={!recipe.mastermind}
      closeOpen={feedbackOpenAnytime(event)}
      tableOpen={recipe.mastermind}
      withCanvas={withCanvas}
      canvasDone={withCanvas ? reads.canvasShared : undefined}
      labels={recipe.room.steps ? { principle: recipe.room.steps.principle, close: recipe.room.steps.close } : undefined}
      learn={learnLabel && event
        ? {
            done: reads.learned,
            label: learnLabel,
            active: false,
            onOpen: () => toMeet('?view=learn'),
          }
        : undefined}
      className="min-w-0 flex-1"
    />
  );
}
