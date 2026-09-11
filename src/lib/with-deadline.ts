/**
 * @file with-deadline.ts
 * @description A deadline for awaits that accept no AbortSignal.
 *
 * P1236 kept finding the same defect at three different layers, and each time the symptom
 * was a room that said "Listening" and stored nothing, with no error anywhere:
 *
 *   1. a slice upload that never settled jammed the serial sender for the whole session
 *   2. the session-mint request never answered, so joining hung on "Joining…" forever
 *   3. the audio worklet's module load never resolved, so capture never began at all
 *
 * All three are the same shape. `fetch` has no default timeout in any browser;
 * `supabase.auth.getSession()` and `AudioContext.resume()` take no signal; and
 * `audioWorklet.addModule()` is a same-origin fetch with no signal either. On a network
 * that accepts a connection and then goes silent — a VPN tunnel, a stalled radio — none of
 * these reject. They simply never settle, and every `await` above them waits forever.
 *
 * A rejection is strictly better than silence: a caller can report it, drop one slice, or
 * fall back. This module exists so the three call sites share one implementation rather
 * than three copies that drift.
 */

/** Thrown when a deadline fires, so a caller can tell "it said no" (which carries a real
 *  message worth showing) from "it said nothing" (which does not). */
export class RequestTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'RequestTimeoutError';
  }
}

/**
 * Rejects with RequestTimeoutError if `promise` has not settled within `ms`.
 *
 * The timer is always cleared, including on the success path — an uncleared timer would
 * hold the callback (and everything it closes over) alive until it fired, and on a page
 * that sends a slice every four seconds that is a leak with a measurable slope.
 *
 * This does NOT cancel the underlying work; nothing here can. It bounds how long a caller
 * waits, which is the part that was actually broken.
 */
export async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RequestTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
