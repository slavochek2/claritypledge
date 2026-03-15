import { useState, useEffect } from 'react';
import {
  useLiveSession,
  getActiveSessionFromStorage,
  clearActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';
import { getClaritySession } from '@/app/data/api';

/** Sessions with no heartbeat for 10+ minutes are treated as zombies */
const ZOMBIE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * P511: Hook that restores active session state from localStorage on mount.
 *
 * On mount, checks localStorage for `cp_active_session`. If found, validates
 * against the DB (session still active / not ended). Updates context if valid,
 * clears localStorage if stale/ended.
 *
 * Zombie detection: if the session exists but `last_activity_at` is older than
 * 10 minutes, treat it as abandoned — clear localStorage and don't set context.
 * This prevents the banner from showing for sessions that were abandoned long
 * ago but never formally ended.
 *
 * Used by layout components to decide whether to show the active session banner.
 */
export function useActiveSession() {
  const {
    activeSessionCode,
    activeSessionPartnerName,
    activeSessionRole,
    activeSessionGuestDisplayName,
    setActiveSession,
    clearActiveSession,
  } = useLiveSession();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const stored = getActiveSessionFromStorage();

      if (!stored) {
        setIsLoading(false);
        return;
      }

      try {
        // Validate against DB — session must still exist and not be ended
        const session = await getClaritySession(stored.code);

        if (cancelled) return;

        if (session && !session.endedAt) {
          // P511 Task 13: Zombie detection — if last_activity_at is too old,
          // the session was abandoned without being formally ended
          if (session.lastActivityAt) {
            const lastActivity = new Date(session.lastActivityAt).getTime();
            const age = Date.now() - lastActivity;
            if (age > ZOMBIE_THRESHOLD_MS) {
              // Zombie session — clear localStorage, don't restore
              clearActiveSessionFromStorage();
              clearActiveSession();
              setIsLoading(false);
              return;
            }
          }

          // Session is still active — restore context
          setActiveSession(stored.code, stored.partnerName, stored.role, stored.guestDisplayName);
        } else {
          // Session ended or doesn't exist — clean up
          clearActiveSessionFromStorage();
          clearActiveSession();
        }
      } catch {
        // Network error — keep localStorage but don't set context
        // Next mount will retry
        if (cancelled) return;
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only

  return {
    hasActiveSession: activeSessionCode !== null,
    activeSessionCode,
    activeSessionPartnerName,
    activeSessionRole,
    activeSessionGuestDisplayName,
    isLoading,
  };
}
