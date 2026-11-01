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

/**
 * Runs a send that may open a draft and its thread (the Clone's first Send). The thread it made is registered the moment the
 * server answers, before anyone waiting on `canvasSendsSettled` is told. A throw (outcome unknown) registers nothing and still lets go.
 */
export async function trackCanvasSend<R extends { ok: boolean }>(send: () => Promise<R>, threadRootOf: (r: R) => string | null): Promise<R> {
  inFlight += 1;
  try {
    const r = await send();
    const root = r.ok ? threadRootOf(r) : null;
    if (root) registerCanvasThread(root);
    return r;
  } finally {
    inFlight -= 1;
    if (inFlight === 0) {
      const now = waiters;
      waiters = [];
      now.forEach((go) => go());
    }
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
