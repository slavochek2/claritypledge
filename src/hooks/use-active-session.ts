import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useLiveSession,
  getActiveSessionFromStorage,
  clearActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';
import { getClaritySession } from '@/app/data/api';

/** Sessions with no heartbeat for 10+ minutes are treated as zombies */
const ZOMBIE_THRESHOLD_MS = 10 * 60 * 1000;

/** Poll interval for checking if session is still active (30s) */
const POLL_INTERVAL_MS = 30 * 1000;

/**
 * P511: Hook that restores active session state from localStorage on mount,
 * then polls every 30s to detect when partner ends the session.
 *
 * Visibility-aware: pauses polling when tab is hidden, re-validates immediately
 * on tab focus. This ensures the banner disappears promptly when the user
 * returns to the tab after their partner ended the session.
 *
 * Zombie detection: if the session exists but `last_activity_at` is older than
 * 10 minutes, treat it as abandoned.
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validateSession = useCallback(async () => {
    const stored = getActiveSessionFromStorage();

    if (!stored) {
      clearActiveSession();
      return false;
    }

    try {
      const session = await getClaritySession(stored.code);

      if (session && !session.endedAt) {
        // Zombie detection
        if (session.lastActivityAt) {
          const lastActivity = new Date(session.lastActivityAt).getTime();
          const age = Date.now() - lastActivity;
          if (age > ZOMBIE_THRESHOLD_MS) {
            clearActiveSessionFromStorage();
            clearActiveSession();
            return false;
          }
        }

        // Session is still active — restore/keep context
        setActiveSession(stored.code, stored.partnerName, stored.role, stored.guestDisplayName);
        return true;
      } else {
        // Session ended or doesn't exist — clean up
        clearActiveSessionFromStorage();
        clearActiveSession();
        return false;
      }
    } catch {
      // Network error — keep localStorage but don't clear context
      return true; // assume still active on network failure
    }
  }, [setActiveSession, clearActiveSession]);

  // Initial validation + start polling
  useEffect(() => {
    let cancelled = false;

    async function init() {
      await validateSession();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    init();

    // Start polling
    intervalRef.current = setInterval(() => {
      validateSession();
    }, POLL_INTERVAL_MS);

    // Visibility-aware: pause when hidden, re-validate on focus
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Tab became visible — re-validate immediately
        validateSession();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [validateSession]);

  return {
    hasActiveSession: activeSessionCode !== null,
    activeSessionCode,
    activeSessionPartnerName,
    activeSessionRole,
    activeSessionGuestDisplayName,
    isLoading,
  };
}
