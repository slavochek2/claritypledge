/**
 * P1536: which thread roots are canvas draft threads, as far as this tab has seen. The mirror never answers a message
 * in a canvas thread (the database makes no job for it), so the mirror provider asks this before it requests a reply:
 * a request would only come back "not available". The thread panel registers its root as soon as it knows the thread
 * starts with a canvas version (or is told it is a draft's thread), and a send that CREATES a draft registers the thread
 * it made as soon as the server answers.
 *
 * That answer can come after the chat's realtime copy of the same message (two channels, no order), so while such a send is in
 * flight the provider holds its decision about a threaded message: `canvasSendsSettled` says when to look again.
 */
const roots = new Set<string>();
let inFlight = 0;
let waiters: Array<() => void> = [];

export function registerCanvasThread(rootId: string): void {
  roots.add(rootId);
}

export function isCanvasThread(rootId: string | null | undefined): boolean {
  return !!rootId && roots.has(rootId);
}

/** A draft-opening send holds the mirror's threaded replies for at most this long, whatever its request does. */
export const CANVAS_SEND_HOLD_MAX_MS = 15_000;

function releaseWaiters(): void {
  if (inFlight > 0) return;
  const now = waiters;
  waiters = [];
  now.forEach((go) => go());
}

/**
 * Runs a send that may open a draft and its thread (the Clone's first Send). The send calls `threadKnown(rootId)` the moment the server has
 * made the thread: the root is registered and the hold ends there, so the run's start request after it holds nothing. The hold also ends when the
 * send settles (a throw too: outcome unknown, nothing registered) or after CANVAS_SEND_HOLD_MAX_MS, whichever comes first, exactly once.
 */
export async function trackCanvasSend<R>(send: (threadKnown: (rootId: string) => void) => Promise<R>): Promise<R> {
  inFlight += 1;
  const hold: { on: boolean; timer?: ReturnType<typeof setTimeout> } = { on: true };
  const release = () => {
    if (!hold.on) return;
    hold.on = false;
    clearTimeout(hold.timer);
    inFlight = Math.max(0, inFlight - 1);
    releaseWaiters();
  };
  hold.timer = setTimeout(release, CANVAS_SEND_HOLD_MAX_MS);
  try {
    return await send((rootId) => {
      registerCanvasThread(rootId);
      release();
    });
  } finally {
    release();
  }
}

/** A promise that settles when no draft-opening send is in flight; null when none is (nothing to wait for). */
export function canvasSendsSettled(): Promise<void> | null {
  return inFlight === 0 ? null : new Promise<void>((go) => waiters.push(go));
}

/** Tests only. */
export function resetCanvasThreads(): void {
  roots.clear();
  inFlight = 0;
  waiters = [];
}
