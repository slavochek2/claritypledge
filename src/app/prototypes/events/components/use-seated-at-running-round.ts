/**
 * @file use-seated-at-running-round.ts
 * @description P1718 R8: is this room member seated in the round running now? Ready never stands at a running table
 * (P1529: "the event room never stands between two people talking"), so /ready forwards to /meet when they are. One
 * read on arrival, no subscription. A failed read, or one that has not answered within ROUNDS_READ_MS, answers
 * `false`: Ready is a note, not a gate, so a stalled connection never holds the person on the loader.
 *
 * The read keys on the event only, so it runs alongside the room row's read rather than after it; the member is
 * matched once both are in. Seats are room-member rows (host_set_round_seats joins event_room_members), so the
 * match is on the room row's id.
 */
import { useEffect, useState } from 'react';
import { currentRound, getEventRoundsState } from '@/app/data/event-rounds-service';
import { settleWithin } from './settle-within';

/** How long /ready waits for the rounds read before it shows the question anyway. */
export const ROUNDS_READ_MS = 4000;

/** `null` while the read or the member is pending (or not asked); then whether `memberId` holds a seat in the current round. */
export function useSeatedAtRunningRound(eventId: string | undefined, memberId: string | undefined, enabled: boolean): boolean | null {
  // The member ids seated in the running round, or `null` when the read failed (counts as not seated).
  const [seats, setSeats] = useState<{ eventId: string; ids: Set<string> | null } | null>(null);
  const key = enabled && eventId ? eventId : null;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    settleWithin(getEventRoundsState(key), ROUNDS_READ_MS)
      .then((state) => {
        const round = currentRound(state);
        const ids = new Set(round ? (state.seatsByRound.get(round.id) ?? []).map((seat) => seat.id) : []);
        if (!cancelled) setSeats({ eventId: key, ids });
      })
      .catch(() => {
        if (!cancelled) setSeats({ eventId: key, ids: null });
      });
    return () => { cancelled = true; };
  }, [key]);
  if (!key || !memberId || seats?.eventId !== key) return null;
  return seats.ids ? seats.ids.has(memberId) : false;
}
