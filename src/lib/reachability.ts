/**
 * P1369: can the app's own server be reached right now?
 *
 * Used to tell the two causes of a failed code-split import apart: a stale deploy (server
 * reachable, the old chunk is gone → "New version available", reload) versus no connection
 * (server unreachable → "needs a connection"; a reload offline would only loop).
 *
 * A HEAD with a unique query: no service-worker route matches it (not a navigation, not a
 * `/assets/*.js`, not precached), so it really goes to the network. Any HTTP response — even a
 * 404 — means reachable.
 */
export async function isAppServerReachable(timeoutMs = 3_000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`/?__reach=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
