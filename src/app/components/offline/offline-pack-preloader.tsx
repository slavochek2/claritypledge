/**
 * @file offline-pack-preloader.tsx
 * @description P1369 Scope v2: starts the offline pack (src/lib/offline-pack.ts) once the app is
 * loaded, auth has settled and the browser is idle. Renders nothing. The pack module is loaded
 * lazily, so none of its services weigh on the app shell.
 */
import { useEffect } from 'react';
import { useAuth } from '@/auth';

/** Let the page's own reads go first. */
const START_DELAY_MS = 3_000;

export function OfflinePackPreloader() {
  const { sessionChecked, isLoading, user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    let cancelled = false;
    let idleId: number | undefined;
    const timer = setTimeout(() => {
      const start = () => {
        if (cancelled || document.visibilityState !== 'visible') return;
        void import('@/lib/offline-pack')
          .then((m) => m.runOfflinePack(userId))
          .catch((err) => console.warn('[offline-pack] failed:', err));
      };
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(start, { timeout: 10_000 });
      else start();
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
    };
  }, [sessionChecked, isLoading, userId]);

  return null;
}
