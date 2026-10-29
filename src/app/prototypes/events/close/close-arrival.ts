/**
 * @file close-arrival.ts
 * @description P1562 (review O-M2): the room's marks for /close — `fromRoom`, `fromEvent`, `roomDepth` — carried through
 * a page that stands between the room and the close (the room's Join → the learning `?then=join` → the close's group
 * terms), so the close's Back pops to the room and its thank-you's Back lands on the event.
 */
import type { CloseArrival } from './use-close-back';

/** The close-arrival marks in `state` (a route state), merged under `extra`. Anything else in `state` is dropped. */
export function withRoomMarks(state: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const s = (state ?? {}) as NonNullable<CloseArrival>;
  const marks: Record<string, unknown> = {};
  if (s.fromRoom === true) marks.fromRoom = true;
  if (s.fromEvent === true) marks.fromEvent = true;
  if (typeof s.roomDepth === 'number') marks.roomDepth = s.roomDepth;
  return { ...marks, ...extra };
}

/** Navigate options for a replace that keeps the room's marks (see `withRoomMarks`): into /close, or from the close's
 *  Join into the learning that returns to it. */
export function replaceIntoClose(state: unknown, extra?: Record<string, unknown>) {
  return { replace: true, state: withRoomMarks(state, extra) };
}

/** The close's own search params for `step`, or null when they are already right. On /close the thank-you is a
 *  destination with the app menus back (?done=1, immersive-letter-route.ts); inside the room (founder UAT round) the
 *  URL is the room's, so only a ?join=1 the person has left is dropped. */
export function closeSearch(current: URLSearchParams, step: string, inRoom: boolean): URLSearchParams | null {
  const staleJoin = step !== 'join' && current.has('join');
  const doneWrong = !inRoom && (step === 'end') !== (current.get('done') === '1');
  if (!staleJoin && !doneWrong) return null;
  const params = new URLSearchParams(current);
  if (staleJoin) params.delete('join');
  if (!inRoom && step === 'end') params.set('done', '1');
  else if (!inRoom) params.delete('done');
  return params;
}
