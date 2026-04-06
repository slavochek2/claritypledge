'use client';

import { useState, useEffect, useCallback } from 'react';
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

  const fetchCount = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const result = await getUnreadLetterCount(userId);
      setCount(result);
    } catch {
      // Silently keep previous count on error
    } finally {
      setLoading(false);
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
