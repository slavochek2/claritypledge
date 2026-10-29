/**
 * @file when-visible.ts
 * @description P1542 round 7e — metered-services rule 3, "A hidden tab makes no requests" (docs/technical/
 * metered-services.md, The six rules). Runs `run` now if the tab is visible; otherwise waits for the first
 * 'visibilitychange' to visible and runs it then, once. The returned function cancels the wait (call it from an effect's
 * cleanup). The visibility check itself is local only: it never makes a request.
 */
export function whenVisible(run: () => void): () => void {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
    run();
    return () => undefined;
  }
  const onChange = () => {
    if (document.visibilityState === 'hidden') return;
    document.removeEventListener('visibilitychange', onChange);
    run();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
