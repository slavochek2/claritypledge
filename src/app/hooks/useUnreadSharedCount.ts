'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/auth';
import { getUnreadReceivedLetterCount } from '@/app/data/letters-service';
import { canvasService } from '@/app/data/canvas-service';
import { shareInFlight } from '@/lib/share-in-flight';

/** Fired by the Artifacts page after the person opens an unread item, so the nav badge re-reads at once. */
export const ARTIFACTS_READ_EVENT = 'p1545:artifacts-read';

/**
 * P1545: the Artifacts nav badge = unread items in "Shared with you": letters sent to you that you
 * have not opened, plus canvases shared with you that you have not opened. Activity on your own
 * letters is not counted (it lives on the sent letter in Yours).
 *
 * Fetch on mount, refetch when the tab regains focus and when the page reports a read. Any failure
 * keeps the previous count (a badge must never break the shell).
 */
export function useUnreadSharedCount(): { count: number } {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const mounted = useRef(true);
  const currentUser = useRef<string | null>(null);
  currentUser.current = user?.id ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchCount = useCallback(async (userId: string) => {
    try {
      const total = await shareInFlight(`unread-shared:${userId}`, async () => {
        const [letters, canvases] = await Promise.all([
          getUnreadReceivedLetterCount(userId),
          canvasService.listSharedWithMe().then(rows => rows.filter(r => r.unread).length).catch(() => 0),
        ]);
        return letters + canvases;
      });
      if (mounted.current && currentUser.current === userId) setCount(total);
    } catch {
      // keep the previous count
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    const userId = user.id;
    void fetchCount(userId);
    const refetch = () => { void fetchCount(userId); };
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(ARTIFACTS_READ_EVENT, refetch);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ARTIFACTS_READ_EVENT, refetch);
    };
  }, [user, fetchCount]);

  return { count };
}
