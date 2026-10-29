/**
 * @file use-close-back.ts
 * @description The close's two ways out, from the route state its opener set (`arrival`: fromRoom, fromEvent,
 * roomDepth). Read once at mount from the router's location; the close keeps it on its own entry — every search-param
 * replace inside /close passes `arrival` back as the state — so a reload, after ?done=1 included, still knows it.
 *
 *  - `backToRoom` (the first question's Back): pop when the room opened the close (`fromRoom`), else replace with the
 *    room, carrying `fromEvent` so the room's own Back can still pop to the event page below it. The replace goes to
 *    /room, the room's gate, which opens the series' own view (a hike's room; Clarity Night's readiness or table).
 *  - `backToEvent` (the thank-you's "Back to the event", P1562 §2): with the room below (`fromRoom`) and the event page
 *    below the room (`fromEvent`), return past every room entry to the event in one traversal — a plain replace would
 *    leave [event, room, event] and browser Back would reopen the room. Only `fromEvent`: pop. Otherwise replace.
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { useBackToEvent } from '../use-back-to-event';
import { withRoomMarks } from './close-arrival';

export type CloseArrival = { fromRoom?: boolean; fromEvent?: boolean; roomDepth?: number } | null;

export function useCloseBack(slug: string) {
  const location = useLocation();
  // Only the room's marks: a transient flag (joinViaLearning) must never be re-written by a later replace.
  const [arrival] = useState(() => withRoomMarks(location.state) as NonNullable<CloseArrival>);
  const fromRoom = arrival?.fromRoom === true;
  const fromEvent = arrival?.fromEvent === true;
  const backToRoom = useReturnToParent(`/events/${slug}/room`, fromRoom, fromEvent ? { fromEvent: true } : undefined);
  // The room sits `roomDepth` entries above its first one; the close is one more.
  const depth = fromRoom ? (arrival?.roomDepth ?? 0) + 1 : 0;
  const backToEvent = useBackToEvent(slug, fromEvent, depth);
  return { backToRoom, backToEvent, arrival };
}
