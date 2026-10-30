/**
 * Helpers for the run's one deadline (canvas-deadline.ts): one signal from several, and a wait that gives up when a signal fires.
 * Pure: no Deno or esm.sh imports.
 */

/** One signal that aborts when any of the given ones does (undefined ones are ignored); undefined when none is given. */
export function anySignal(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const live = signals.filter((s): s is AbortSignal => s !== undefined);
  if (live.length <= 1) return live[0];
  const controller = new AbortController();
  // an already-fired signal decides at once, before any listener is attached to the others
  const fired = live.find((s) => s.aborted);
  if (fired) { controller.abort(fired.reason); return controller.signal; }
  for (const s of live) s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  return controller.signal;
}

/** `work`, or `fallback` as soon as the signal fires (the work is not cancelled, only no longer waited for). */
export function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined, fallback: T): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.resolve(fallback);
  return new Promise<T>((resolve, reject) => {
    const give = () => resolve(fallback);
    signal.addEventListener('abort', give, { once: true });
    // the listener goes when the work settles first: one run asks for several counts and shares one signal
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', give));
  });
}
