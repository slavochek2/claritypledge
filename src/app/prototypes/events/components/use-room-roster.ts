/**
 * @file use-room-roster.ts
 * @description P1562 §3.2: the room roster with its read state — the subscription's own `onStatus` (P1586): `pending`
 * until the first read answers, `failed` when that first read failed (the subscription's poll retries it), `ready` once
 * any read succeeded. A later failure changes nothing: the last good rows stay (subscribeToRoomRoster applies nothing on
 * a failed read).
 *
 * The viewer's own row: the subscription's first read can run before the viewer's join has written that row (the join
 * and the subscription start together). Once the viewer's row is known (`self`), the subscription's first read has
 * succeeded and that snapshot lacks the viewer, the hook asks the subscription for ONE more read (`refresh()`) — sent
 * through the subscription's own serialized loop, so it is ordered after every read already out (its answer is the
 * last applied; an older response can never erase the viewer) and hidden-tab aware (now, or on becoming visible).
 * At most one refresh per event and viewer, marked when it is asked for. No cache, no dedupe (decisions.md P1527).
 */
import { useEffect, useRef, useState } from 'react';
import { subscribeToRoomRoster, type RoomRosterSubscription, type RosterStatus } from '@/app/data/event-room-service';
import { whenVisible } from '../when-visible';
import type { EventRoomMember } from '@/app/types';

/** One event's roster as last applied: everything is keyed to the event it was read for. */
type Snapshot = { eventId: string | undefined; roster: EventRoomMember[]; status: RosterStatus };

/** `onRoster` runs after every successful subscription read (the room refreshes its own `self` alongside). */
export function useRoomRoster(eventId: string | undefined, onRoster: () => void, self?: { id: string } | null) {
  const selfMemberId = self?.id;
  const [snap, setSnap] = useState<Snapshot>({ eventId, roster: [], status: 'pending' });
  // Derived for THIS event: another event's rows or status never show, not even for the render before an effect runs.
  const current = snap.eventId === eventId ? snap : { eventId, roster: [] as EventRoomMember[], status: 'pending' as RosterStatus };
  const onRosterRef = useRef(onRoster);
  useEffect(() => { onRosterRef.current = onRoster; }, [onRoster]);
  const rosterRef = useRef(current.roster);
  rosterRef.current = current.roster;
  const subscriptionRef = useRef<RoomRosterSubscription | null>(null);
  // Event + viewer pairs already refreshed: at most one each.
  const reReadRef = useRef(new Set<string>());
  // The subscription said `ready` (it does so before handing over the rows of a successful read).
  const readyRef = useRef(false);

  useEffect(() => {
    setSnap({ eventId, roster: [], status: 'pending' });
    readyRef.current = false;
    if (!eventId) return;
    // `onRoster` (the room refreshes the viewer's own row: an RPC, maybe a join) waits for a visible tab — a snapshot
    // that lands after the tab hid is applied, but its follow-up is not sent while hidden. Several snapshots while
    // hidden ask once.
    let followUpWaiting = false;
    let cancelFollowUp = () => {};
    const subscription = subscribeToRoomRoster(
      eventId,
      (next) => {
        // Before the first success the subscription reports [] with `failed`: rows only, no follow-up.
        setSnap((s) => ({ eventId, roster: next, status: s.eventId === eventId ? s.status : 'pending' }));
        if (!readyRef.current) return;
        if (followUpWaiting) return;
        followUpWaiting = true;
        cancelFollowUp = whenVisible(() => {
          followUpWaiting = false;
          onRosterRef.current();
        });
      },
      (status) => {
        readyRef.current = status === 'ready';
        setSnap((s) => (s.eventId === eventId ? { ...s, status } : { eventId, roster: [], status }));
      },
    );
    subscriptionRef.current = subscription;
    return () => {
      subscriptionRef.current = null;
      cancelFollowUp();
      subscription();
    };
  }, [eventId]);

  // Keyed to the event: a success of the previous event never asks for a refresh of this one.
  const firstSucceeded = current.status === 'ready';
  useEffect(() => {
    if (!eventId || !selfMemberId || !firstSucceeded || !subscriptionRef.current) return;
    const pair = `${eventId}|${selfMemberId}`;
    if (reReadRef.current.has(pair) || rosterRef.current.some((m) => m.id === selfMemberId)) return;
    reReadRef.current.add(pair);
    subscriptionRef.current.refresh();
  }, [eventId, selfMemberId, firstSucceeded]);

  return { roster: current.roster, status: current.status };
}
