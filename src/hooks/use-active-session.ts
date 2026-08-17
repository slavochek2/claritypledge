import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useLiveSession,
  getActiveSessionFromStorage,
  clearActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';
import { getActiveSessionByCode, subscribeToClaritySession } from '@/app/data/api';
import type { ClaritySession } from '@/app/types';

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
 * Uses `getActiveSessionByCode` which checks:
 * - `live_state.sessionEnded` (the actual ended signal — no `ended_at` column exists)
 * - Grace period on `last_activity_at` (zombie/stale session detection)
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
  const sessionIdRef = useRef<string | null>(null);
  /**
   * P1057: the room code that goes with sessionIdRef. Realtime re-fetches no longer carry
   * `code`, so the subscription must be handed the one this hook already resolved from
   * storage. Captured in the same place as sessionIdRef so the two cannot drift apart.
   */
  const sessionCodeRef = useRef<string>('');

  const validateSession = useCallback(async () => {
    const stored = getActiveSessionFromStorage();

    if (!stored) {
      clearActiveSession();
      sessionIdRef.current = null;
      return false;
    }

    try {
      // getActiveSessionByCode checks live_state.sessionEnded and grace period.
      // Returns null when session is ended, expired, or not found.
      const session = await getActiveSessionByCode(stored.code);

      if (session) {
        // Session is still active — restore/keep context and capture ID for Realtime
        setActiveSession(stored.code, stored.partnerName, stored.role, stored.guestDisplayName);
        sessionIdRef.current = session.id;
        sessionCodeRef.current = stored.code;
        return true;
      } else {
        // Session ended, expired, or not found — clean up
        clearActiveSessionFromStorage();
        clearActiveSession();
        sessionIdRef.current = null;
        return false;
      }
    } catch {
      // Network error — keep localStorage but don't clear context
      return true; // assume still active on network failure
    }
  }, [setActiveSession, clearActiveSession]);

  // Initial validation + polling + Realtime subscription
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      await validateSession();
      if (cancelled) return;
      setIsLoading(false);

      // P743: subscribe to Realtime so creator-end dismisses banner in <1s
      // instead of waiting up to 30s for the next poll cycle.
      if (sessionIdRef.current) {
        unsubscribe = subscribeToClaritySession(
          sessionIdRef.current,
          sessionCodeRef.current,
          (updated: ClaritySession) => {
            const ls = updated.liveState;
            // Guard: no-op if already cleared (poll and Realtime may fire together)
            if (!sessionIdRef.current) return;
            if (ls?.sessionEnded === true || ls?.joinerEnded === true) {
              sessionIdRef.current = null;
              clearActiveSessionFromStorage();
              clearActiveSession();
            }
          }
        );
      }
    }

    init();

    // Polling remains as fallback for missed Realtime events
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
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  }, [validateSession, clearActiveSession]);

  return {
    hasActiveSession: activeSessionCode !== null,
    activeSessionCode,
    activeSessionPartnerName,
    activeSessionRole,
    activeSessionGuestDisplayName,
    isLoading,
  };
}
