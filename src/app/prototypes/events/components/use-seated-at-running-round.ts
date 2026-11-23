/**
 * @file use-seated-at-running-round.ts
 * @description P1718 R8: is this room member seated in the round running now? Ready never stands at a running
 * table (P1529: "the event room never stands between two people talking"), so /ready forwards to /meet when
 * they are. One read on arrival, no subscription. A failed read answers `false`: Ready is a note, not a gate.
 */
import { useEffect, useState } from 'react';
import { currentRound, getEventRoundsState } from '@/app/data/event-rounds-service';

/** `null` while the read is pending (or not asked); then whether `memberId` holds a seat in the current round. */
export function useSeatedAtRunningRound(eventId: string | undefined, memberId: string | undefined, enabled: boolean): boolean | null {
  const [seated, setSeated] = useState<{ key: string; value: boolean } | null>(null);
  const key = enabled && eventId && memberId ? `${eventId}:${memberId}` : null;
  useEffect(() => {
    if (!key || !eventId || !memberId) return;
    let cancelled = false;
    getEventRoundsState(eventId)
      .then((state) => {
        const round = currentRound(state);
        const value = !!round && (state.seatsByRound.get(round.id) ?? []).some((seat) => seat.id === memberId);
        if (!cancelled) setSeated({ key, value });
      })
      .catch(() => {
        if (!cancelled) setSeated({ key, value: false });
      });
    return () => { cancelled = true; };
  }, [key, eventId, memberId]);
  if (!key) return null;
  return seated?.key === key ? seated.value : null;
}
