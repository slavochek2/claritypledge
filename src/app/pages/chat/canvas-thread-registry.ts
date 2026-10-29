/**
 * P1536: which thread roots are canvas draft threads, as far as this tab has seen. The mirror never answers a message
 * in a canvas thread (the database makes no job for it), so the mirror provider asks this before it requests a reply:
 * a request would only come back "not available". The thread panel registers its root as soon as it knows the thread
 * starts with a canvas version.
 */
const roots = new Set<string>();

export function registerCanvasThread(rootId: string): void {
  roots.add(rootId);
}

export function isCanvasThread(rootId: string | null | undefined): boolean {
  return !!rootId && roots.has(rootId);
}

/** Tests only. */
export function resetCanvasThreads(): void {
  roots.clear();
}
