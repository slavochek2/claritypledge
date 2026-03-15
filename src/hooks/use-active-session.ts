import { useState, useEffect } from 'react';
import {
  useLiveSession,
  getActiveSessionFromStorage,
  clearActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';
import { getClaritySession } from '@/app/data/api';

/**
 * P511: Hook that restores active session state from localStorage on mount.
 *
 * On mount, checks localStorage for `cp_active_session`. If found, validates
 * against the DB (session still active / not ended). Updates context if valid,
 * clears localStorage if stale/ended.
 *
 * Used by layout components to decide whether to show the active session banner.
 */
export function useActiveSession() {
  const {
    activeSessionCode,
    activeSessionPartnerName,
    activeSessionRole,
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
          // Session is still active — restore context
          setActiveSession(stored.code, stored.partnerName, stored.role);
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
    isLoading,
  };
}
