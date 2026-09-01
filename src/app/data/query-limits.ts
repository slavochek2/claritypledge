/**
 * @file query-limits.ts
 * @description P1229: hard cap on PostgREST `in()` list length.
 *
 * `/pledgers` used to put every pledger id (~5.2k in prod) into one
 * `witnesses?profile_id=in.(…)` URL; the gateway refused it
 * (net::ERR_HTTP2_PROTOCOL_ERROR) and the data silently never arrived. Every
 * `.in(column, ids)` over a caller-sized list must pass through
 * `boundedInList()` so the failure is loud in dev/tests instead of a swallowed
 * network error in prod. Page sizes are chosen below this cap by construction.
 */

/** Maximum number of values a single PostgREST `in()` filter may carry. */
export const MAX_IN_LIST = 100;

/**
 * Returns `ids` unchanged when it fits in one `in()` filter; throws otherwise.
 * `label` names the query in the error so the offending call site is obvious.
 */
export function boundedInList<T>(ids: readonly T[], label: string): readonly T[] {
  if (ids.length > MAX_IN_LIST) {
    throw new Error(
      `${label}: in() list has ${ids.length} values (max ${MAX_IN_LIST}) — paginate or aggregate server-side`,
    );
  }
  return ids;
}
