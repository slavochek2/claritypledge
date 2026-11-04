/**
 * @file visible-poll.ts
 * @description A poll that runs only while the tab is visible. Hidden, it makes no request at all; the moment the tab is visible again
 * it runs once and resumes its pace. Returns the function that stops it for good. Used by every transcript-state read that repeats
 * (P1604): a forgotten background tab must cost nothing.
 */
export function startVisiblePoll(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const visible = () => document.visibilityState !== 'hidden';
  const start = () => { if (timer === null) timer = setInterval(fn, ms); };
  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const onChange = () => {
    if (visible()) { fn(); start(); } else stop();
  };
  if (visible()) start();
  document.addEventListener('visibilitychange', onChange);
  return () => { stop(); document.removeEventListener('visibilitychange', onChange); };
}
