'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';

interface PendingPartnerInvitationCount {
  count: number;
  loading: boolean;
}

/**
 * P885: count of incoming pending partner invitations for the Partners nav badge.
 *
 * Parity contract: counts via the same service call the partners page uses
 * (agreementsService.getIncomingInvitations — pending, unaccepted, non-expired,
 * addressed to the current user's email) so the badge and the page's
 * "Incoming invitations" section can never drift apart.
 *
 * Freshness mirrors useUnreadLetterCount: fetch on mount + refetch on
 * visibilitychange. No realtime subscription.
 */
export function usePendingPartnerInvitationCount(): PendingPartnerInvitationCount {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset to true on effect body run — required for StrictMode remount cycle
    // where the prior mount's cleanup already set this to false.
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchCount = useCallback(async (email: string) => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const invitations = await agreementsService.getIncomingInvitations(email);
      if (isMountedRef.current) setCount(invitations.length);
    } catch {
      // Silently keep previous count on error
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!user?.email) {
      setCount(0);
      return;
    }
    fetchCount(user.email);
  }, [user, fetchCount]);

  // Refetch on visibilitychange (tab regains focus)
  useEffect(() => {
    if (!user?.email) return;

    const email = user.email;
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchCount(email);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, fetchCount]);

  return { count, loading };
}
