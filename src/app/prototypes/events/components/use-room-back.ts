/**
 * @file use-room-back.ts
 * @description P1562 §2, the room's Back table, read from the route state the room's parents set:
 *
 *  - `fromEvent` — the event page opened the room (copied forward through /room's redirect, Ready → Meet, and every
 *    replace between room views);
 *  - `fromReady` — Ready opened Meet (Clarity Night), so Ready is the entry below;
 *  - `roomDepth` — how many entries a hike room pushed above its first one (its Learn view, see EventRoomMeet).
 *
 * Clarity Night's Meet goes to Ready ("Back to readiness": pop when Ready opened it, else replace, carrying
 * `fromEvent`). Every other room view — a hike's, a frozen Meet, Ready itself — goes to the event, past every room
 * entry above it (useBackToEvent). `closeState` is what the room hands /close, so the thank-you can do the same.
 */
import { useLocation } from 'react-router-dom';
import { useBackPast, useBackToEvent } from '../use-back-to-event';

/** [FOUNDER DECISION: copy, proposed — today's accessible name] Clarity Night Meet's Back, to /ready. */
export const BACK_TO_READINESS = 'Back to readiness';
export const BACK_TO_EVENT = 'Back to the event';

export type RoomNavState = { fromEvent?: boolean; fromReady?: boolean; roomDepth?: number };

export function readRoomNav(state: unknown) {
  const s = (state ?? {}) as RoomNavState;
  const fromEvent = s.fromEvent === true;
  const fromReady = s.fromReady === true;
  const roomDepth = typeof s.roomDepth === 'number' ? s.roomDepth : 0;
  // Entries above the event page's own entry before this one: the room's pushes, plus Ready when it opened Meet.
  return { fromEvent, fromReady, roomDepth, depth: roomDepth + (fromReady ? 1 : 0) };
}

export function useRoomBack(slug: string | undefined) {
  const location = useLocation();
  const nav = readRoomNav(location.state);
  const backToEvent = useBackToEvent(slug, nav.fromEvent, nav.depth);
  // P1542 review C1: Ready sits below every entry the room pushed (its in-page views), not just one.
  const backToReady = useBackPast(`/events/${slug}/ready`, nav.fromReady, nav.roomDepth, nav.fromEvent ? { fromEvent: true } : undefined);
  return {
    backToEvent,
    backToReady,
    /** The header's Back: to readiness (Clarity Night's open Meet), else to the event. */
    header: (toReadiness: boolean) =>
      toReadiness ? { onBack: backToReady, label: BACK_TO_READINESS } : { onBack: backToEvent, label: BACK_TO_EVENT },
    /** Route state for the room's pushes of /close: the room is below it, and so is everything under the room. */
    closeState: { fromRoom: true, fromEvent: nav.fromEvent, roomDepth: nav.depth },
    /** The same, as navigate options for a push (the room's Join: /close?join=1, or the learning before it). */
    closeNav: { state: { fromRoom: true, fromEvent: nav.fromEvent, roomDepth: nav.depth } },
  };
}
