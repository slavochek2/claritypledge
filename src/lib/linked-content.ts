/**
 * @file linked-content.ts
 * @description P1212 §5 — the three-state rule for batch-fetched link maps, as a pure
 * function instead of an invariant the page is trusted to maintain.
 *
 * THE BUG THIS EXISTS TO MAKE IMPOSSIBLE. The feed's expanders distinguish three states:
 * "not loaded" (render no footer), "loaded, none linked" (render `0 points`), and
 * "loaded, N linked" (render the expander). The first version held that only on the FIRST
 * load. `fetchData` reset `loading` and `error` but not the link maps, so on any re-fetch
 * — a tag click, the sort toggle, the error-state Retry — React painted the new cards
 * while the PREVIOUS fetch's map was still in state. That map is truthy, and `.get()` on
 * an id it has never seen returns undefined, so the fallback resolved to `[]` and every
 * new card asserted `0 points` as a loaded fact about content whose links had not been
 * fetched. The exact falsehood the three states exist to prevent, one code path over.
 *
 * Clearing the maps in `fetchData` would fix that instance. It would not stop the next
 * one: the correctness lives in a side effect that a future fetch path can forget to
 * perform, and nothing fails when it does. So the map is stored WITH the id set it was
 * fetched for, and the read below refuses any map whose key is not the current one.
 * A stale map is then structurally indistinguishable from no map, and there is no reset to
 * remember.
 */

/** A batch-fetched link map, tagged with the id set the fetch was issued for. */
export interface LinkedContentState<T> {
  /** Identifies the exact id set this map answers. See `linkKeyFor`. */
  key: string;
  map: Map<string, T[]>;
}

/**
 * Stable key for a set of ids. Sorted, so a reordering of the same content (the sort
 * toggle) does not read as a different set and throw away a still-valid map.
 */
export function linkKeyFor(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

/**
 * The links for one id, or `undefined` when they are not loaded *for the current set*.
 *
 * Returns `undefined` — "not loaded", render nothing — when there is no state at all OR
 * when the state answers a different id set. Returns `[]` — "loaded, none linked" — only
 * when this map genuinely covers the current set and has no entry for this id.
 */
export function linksFor<T>(
  state: LinkedContentState<T> | undefined,
  currentKey: string,
  id: string
): T[] | undefined {
  if (!state || state.key !== currentKey) return undefined;
  return state.map.get(id) ?? [];
}
