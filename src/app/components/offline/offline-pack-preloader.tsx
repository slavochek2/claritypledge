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
    let running = false;
    let showedWhileRunning = false;
    let armed = false;
    // P1522: the pack never runs in a hidden tab, and a run cut short by hiding leaves it due. So
    // every time the tab is shown again, ask once more; when nothing is due the answer is local
    // (no request), and `running` keeps a show during a run from starting a second one.
    const start = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (running) {
        showedWhileRunning = true; // a hide-then-show during a run: ask again when it settles
        return;
      }
      running = true;
      showedWhileRunning = false;
      void import('@/lib/offline-pack')
        .then((m) => m.runOfflinePack(userId))
        .catch((err) => console.warn('[offline-pack] failed:', err))
        .finally(() => {
          running = false;
          if (showedWhileRunning) start();
        });
    };
    const arm = () => {
      if (cancelled) return;
      armed = true;
      document.addEventListener('visibilitychange', start);
      start();
    };
    const timer = setTimeout(() => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(arm, { timeout: 10_000 });
      else arm();
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      if (armed) document.removeEventListener('visibilitychange', start);
      clearTimeout(timer);
      const w = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
    };
  }, [sessionChecked, isLoading, userId]);

  return null;
}
