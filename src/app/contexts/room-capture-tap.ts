/**
 * @file room-capture-tap.ts
 * @description P1596: starting the audio tap is retried a few times before the bar says nothing is being recorded.
 * The wait is short and jittered (it is a one-off setup, not a polling loop: at most 2 extra attempts per start).
 */

export const TAP_START_ATTEMPTS = 3;
const TAP_BACKOFF_MS = [500, 1_500];

/** Runs `start` until it resolves, at most TAP_START_ATTEMPTS times. Returns whether it ever did. */
export async function startTapWithRetry(
  start: () => Promise<void>,
  stillWanted: () => boolean,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  for (let attempt = 0; attempt < TAP_START_ATTEMPTS; attempt++) {
    try {
      await start();
      return true;
    } catch (err) {
      console.error(`[room-capture] audio tap could not start (attempt ${attempt + 1}):`, err);
      // Cancelled is not a failure: the bar must not say "Not recording" after a pause or End.
      if (!stillWanted()) return true;
      if (attempt === TAP_START_ATTEMPTS - 1) return false;
      await sleep(TAP_BACKOFF_MS[attempt] * (0.75 + Math.random() * 0.5));
      if (!stillWanted()) return true;   // End or a pause landed while waiting
    }
  }
  return false;
}

/** A resume's retry is wanted while not paused and no stop came: End bumps the generation and clears the pause latch. */
export function stillResuming(gen: { current: number }, paused: { current: boolean }): () => boolean {
  const at = gen.current;
  return () => !paused.current && gen.current === at;
}
