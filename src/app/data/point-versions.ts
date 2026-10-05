/**
 * @file point-versions.ts
 * @description P1337 policy (founder, 2026-10-05): every statement LIST shows the newest version
 * only. A reworded statement keeps its old row (`points.superseded_by` points at the newer one),
 * and positions given on the old row stay there — so the filter belongs in the query, never after
 * `.range()` (P1376: old rows sort first and would fill the page).
 *
 * Every `.from('points')` in src/app/data must either pass through `currentVersionsOnly` or carry
 * a `// versions: all — <reason>` comment on the line above it. Enforced by
 * src/tests/p1337-current-versions-guard.test.ts. The standing reasons:
 *   - one statement by id or slug (a direct link to an old version still opens it, with the
 *     "There's a newer version" banner, P800);
 *   - a write (insert, update);
 *   - the version chain itself;
 *   - positions that stay with the version they were given on (a profile's own positions,
 *     badges earned on a version);
 *   - the feed's "Latest" switch, which filters the same rows on the page (on by default).
 */

/** Narrow a points select to current versions (no newer version exists). */
export function currentVersionsOnly<Q extends { is(column: string, value: null): Q }>(query: Q): Q {
  return query.is('superseded_by', null);
}
