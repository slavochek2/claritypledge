import { useEffect, useRef } from 'react';
import { touchJoinerSeat } from '@/app/data/api';

/**
 * 30s, matching P511's creator heartbeat. The abandonment timer is 15 minutes, so a guest
 * would have to miss ~30 consecutive writes before their seat is considered free — the
 * margin absorbs tab throttling, a sleeping laptop and a flaky mobile connection without
 * ever letting a live seat expire.
 */
const PRESENCE_INTERVAL_MS = 30_000;

/**
 * P1269: keeps the seated GUEST's presence fresh so their seat is not treated as abandoned
 * while they are still in the room.
 *
 * Only an ANONYMOUS guest needs this. A signed-in joiner's seat is bound to auth.uid() and
 * holds no secret, so `isGuest` must be false for them — touchJoinerSeat would no-op anyway
 * (it returns early with no stored secret), but passing the flag keeps the intent readable
 * and avoids a pointless timer.
 *
 * Deliberately mirrors useSessionHeartbeat rather than extending it: that hook belongs to
 * the CREATOR and keeps the SESSION alive; this one belongs to the GUEST and keeps a SEAT
 * held. Merging them would couple a liveness signal to an authorization one.
 */
export function useGuestSeatPresence(
  sessionId: string | null,
  isGuest: boolean
): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId || !isGuest) {
      return;
    }

    // Fire immediately: a guest who reloads has just reclaimed, and the reclaim already
    // stamped presence — but a guest whose tab was backgrounded for a while has not.
    void touchJoinerSeat(sessionId);

    intervalRef.current = setInterval(() => {
      void touchJoinerSeat(sessionId);
    }, PRESENCE_INTERVAL_MS);

    // A tab returning to the foreground may have missed many intervals (browsers throttle
    // or suspend background timers). Refresh at once rather than waiting up to 30s, so a
    // guest who unlocks their phone late in the window is not sitting on a stale seat.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void touchJoinerSeat(sessionId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionId, isGuest]);
}
