import { useEffect, useRef } from 'react';
import { updateSessionLastActivity } from '@/app/data/api';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * P511: Sends periodic heartbeat updates for an active clarity session.
 *
 * Only the session creator should use this hook — anonymous joiners do NOT
 * heartbeat (Decision 5b). The consumer passes `isActive: true` only for
 * creators.
 *
 * Fires immediately on activation, then every 30 seconds. Cleans up on
 * deactivation or unmount.
 */
export function useSessionHeartbeat(
  sessionId: string | null,
  isActive: boolean
): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId || !isActive) {
      return;
    }

    // Fire immediately on activation
    updateSessionLastActivity(sessionId);

    // Then every 30s
    intervalRef.current = setInterval(() => {
      updateSessionLastActivity(sessionId);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, isActive]);
}
