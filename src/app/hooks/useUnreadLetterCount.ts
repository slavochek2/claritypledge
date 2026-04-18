'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/auth';
import { getUnreadLetterCount } from '@/app/data/letters-service';

interface UnreadLetterCount {
  count: number;
  loading: boolean;
}

export function useUnreadLetterCount(): UnreadLetterCount {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Reset to true on effect body run — required for StrictMode remount cycle
    // where the prior mount's cleanup already set this to false.
    // Safety: React flushes all cleanups before all effect bodies in the same
    // cycle, so isMountedRef.current is guaranteed true again before the fetch
    // effect fires on the second mount.
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchCount = useCallback(async (userId: string) => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const result = await getUnreadLetterCount(userId);
      if (isMountedRef.current) setCount(result);
    } catch {
      // Silently keep previous count on error
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    fetchCount(user.id);
  }, [user, fetchCount]);

  // Refetch on visibilitychange (tab regains focus)
  useEffect(() => {
    if (!user) return;

    const userId = user.id;
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchCount(userId);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, fetchCount]);

  return { count, loading };
}
