/**
 * @file return-state.ts
 * @description P1364 §5 — per-VISIT card state (open/expanded) that Back restores.
 *
 * Founder: "if it comes back, should it remember that a specific point was open, e.g.? or story
 * open?" — yes. A card's expanders are stored per HISTORY ENTRY, next to the scroll positions and
 * under the same key (scrollEntryKey: location.key + pathname + search) and the same cap:
 *   - not in the URL, so a shared link always opens with everything collapsed;
 *   - not in the list-return cache, which is keyed per LIST (two visits to /feed share it),
 *     while "what was open" belongs to one visit.
 * Read only on POP (useReturnState); a PUSH starts collapsed. A REPLACE (a tab, the search box)
 * is still the same visit: ScrollToTop moves the bucket to the replacing entry's key.
 */
import { MAX_SAVED_POSITIONS } from '@/lib/scroll-positions';

const buckets = new Map<string, Map<string, unknown>>();

function touch(entry: string): Map<string, unknown> {
  let bucket = buckets.get(entry);
  if (bucket) buckets.delete(entry); // re-insert: least-recently-used first
  else bucket = new Map();
  buckets.set(entry, bucket);
  while (buckets.size > MAX_SAVED_POSITIONS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  return bucket;
}

export function readReturnState<T>(entry: string, id: string): T | undefined {
  return buckets.get(entry)?.get(id) as T | undefined;
}

export function writeReturnState<T>(entry: string, id: string, value: T): void {
  touch(entry).set(id, value);
}

/** A REPLACE keeps the visit: carry its card state to the replacing entry's key. */
export function migrateReturnState(from: string, to: string): void {
  const bucket = buckets.get(from);
  if (!bucket || from === to) return;
  buckets.delete(from);
  const target = touch(to);
  for (const [k, v] of bucket) if (!target.has(k)) target.set(k, v);
}

/** Test-only. */
export function __returnStateForTest(): Map<string, Map<string, unknown>> {
  return buckets;
}
