/**
 * @file reconcile-retry.ts
 * @description The room's re-read after a failed write (EventRoomMeet `runWrite`), kept out of that file (over its
 * size limit). Until a read succeeds the screen does not know the current answer, so it asks again — within the
 * metered rules (Codex review):
 *  - rule 3: no read from a hidden tab (each read waits for a visible one), none after the caller aborted (unmount);
 *  - rule 4: the first read goes at once, then waits of 2s, 4s, 8s, 16s, 30s, 30s, … each ±20% (jitter, so the
 *    phones of a room that lost the server together do not ask together), and a budget: RECONCILE_READS reads in all
 *    (the first + 8 retries, about 2.5 minutes of waiting). Then it stops and says so; the screen offers "Try again",
 *    which runs one more budgeted loop.
 */
import { untilVisible } from '@/app/data/event-list-reads';

export const RECONCILE_FIRST_MS = 2000;
export const RECONCILE_MAX_MS = 30_000;
/** Reads per loop: the first, then 8 retries. */
export const RECONCILE_READS = 9;
const JITTER = 0.2;

/** The base wait before retry number `retry` (1-based): 2s, 4s, 8s, 16s, then 30s. */
export const reconcileDelay = (retry: number) => Math.min(RECONCILE_FIRST_MS * 2 ** (retry - 1), RECONCILE_MAX_MS);

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}

export type ReconcileResult = 'read' | 'exhausted' | 'aborted';

/**
 * Read until `read` resolves true, within the budget. `read` gets the signal, to gate any further request of its own. `onWaiting` runs before each wait (the screen shows its locked,
 * reconnecting state) and never after an abort. `random` is injectable for tests.
 */
export async function retryUntilRead(
  read: (signal: AbortSignal) => Promise<boolean>,
  signal: AbortSignal,
  onWaiting: () => void,
  random: () => number = Math.random,
): Promise<ReconcileResult> {
  for (let n = 0; n < RECONCILE_READS; n += 1) {
    if (n > 0) {
      if (signal.aborted) return 'aborted';
      onWaiting();
      await sleep(reconcileDelay(n) * (1 - JITTER + 2 * JITTER * random()), signal);
    }
    if (!(await untilVisible(signal))) return 'aborted';
    // A read that throws, even synchronously, is a failed read like any other.
    if (await Promise.resolve().then(() => read(signal)).catch(() => false)) return signal.aborted ? 'aborted' : 'read';
  }
  return signal.aborted ? 'aborted' : 'exhausted';
}
