/**
 * @file ear-count.ts
 * @description Single source for reading a profile's ear count from a joined DB row.
 *
 * P940: the "ear" count (distinct stories a listener was rated on) lives only in
 * `profiles.ears_count` — there are no denormalized copies. Every people-returning
 * query reads it at join time. To stop each surface from hand-rolling the field name
 * and the `?? 0` default (the bug that made the event-host badge read 0), all
 * extraction goes through this one function. A guard test
 * (`src/tests/p940-ear-count-select-guard.test.ts`) asserts every people-returning
 * query also selects the column.
 */

/** A joined profile row that may carry an ear count. */
export interface HasEarsCount {
  ears_count?: number | null;
}

/**
 * Read the ear count from a joined profile row, defaulting to 0 when the row or the
 * column is absent. Use this everywhere instead of inline `row?.ears_count ?? 0`.
 */
export function earCountOf(profileRow: HasEarsCount | null | undefined): number {
  return profileRow?.ears_count ?? 0;
}
