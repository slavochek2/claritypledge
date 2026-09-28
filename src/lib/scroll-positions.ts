/**
 * @file scroll-positions.ts
 * @description Per-history-entry scroll positions for ScrollToTop. In-memory only: survives SPA
 * back/forward, intentionally resets on reload (reload starts at top).
 *
 * P1364 — keyed on `location.key + pathname + search` by the caller, not `location.key` alone:
 * every entry whose history state is null (the first load, an entry pushed outside the router)
 * has the key "default", so on its own the key made unrelated entries share one saved
 * position. Capped, so a long session cannot grow it without bound (oldest dropped first).
 */
export const MAX_SAVED_POSITIONS = 50;

const savedPositions = new Map<string, number>();

export function scrollEntryKey(key: string, pathname: string, search: string): string {
  return `${key}|${pathname}${search}`;
}

export function getSavedPosition(entry: string): number | undefined {
  return savedPositions.get(entry);
}

export function rememberPosition(entry: string, y: number): void {
  savedPositions.delete(entry); // re-insert so the Map's order is least-recently-saved first
  savedPositions.set(entry, y);
  while (savedPositions.size > MAX_SAVED_POSITIONS) {
    const oldest = savedPositions.keys().next().value;
    if (oldest === undefined) break;
    savedPositions.delete(oldest);
  }
}

/** Drop an entry that no longer exists in the tab's history (it was replaced). */
export function forgetPosition(entry: string): void {
  savedPositions.delete(entry);
}

/** Test-only. */
export function __savedPositionsForTest(): Map<string, number> {
  return savedPositions;
}
