/**
 * @file network-blip.ts
 * @description Single source of truth for "is this error a network blip?".
 *
 * A leaf module by design: both the data layer (`db-error-logger`) and the
 * Sentry bootstrap (`sentry-filters` → `main.tsx`) import it, so it must not
 * import from either. Keeping it here stops the Sentry config from depending
 * on the data layer (and dragging @supabase/postgrest-js into the init path).
 *
 * P990: the predicate used to live as a local `const` inside `logDbError`,
 * which meant the throw path one line later could not consult it — the blip was
 * suppressed at the logger door and re-reported through the global handler.
 */

import type { PostgrestError } from "@supabase/postgrest-js";

/**
 * Errors we may be handed: a Postgrest-shaped object from supabase-js, or a
 * plain Error (two call sites already pass one — letters-service.ts:1676, :1692).
 */
export type DbErrorLike = PostgrestError | Error | null | undefined;

/**
 * supabase-js wraps fetch failures into a Postgrest-shaped object whose
 * `message` carries the underlying cause. These are offline / tab-switch
 * mid-flight blips, not real DB errors.
 */
const BLIP_MESSAGE_FRAGMENTS = [
  "Failed to fetch",
  "NetworkError",
  "AbortError",
  "signal is aborted",
  "The network connection was lost",
  // Mobile Safari's phrasing for a failed fetch (JAVASCRIPT-REACT-2H, 2026-07-02)
  "Load failed",
];

/** Postgrest errors carry a `code`; a plain Error does not. */
function errorCode(error: NonNullable<DbErrorLike>): string {
  return "code" in error ? ((error as PostgrestError).code ?? "") : "";
}

/**
 * True when `error` is a transient network blip rather than a real DB error.
 *
 * Pure and env-independent so it is directly unit-testable — `logDbError`
 * returns early in dev before ever reaching blip classification, so this logic
 * is otherwise only reachable in prod.
 */
export function isNetworkBlip(error: DbErrorLike): boolean {
  if (!error) return false;

  // A genuine Postgrest error ALWAYS carries a Postgres error code; a blip
  // never does. Verified against @supabase/postgrest-js 2.84.0, which builds
  // client-side network errors with `code: ''` and states the invariant at
  // PostgrestBuilder.js:176-177: "We don't populate code/hint for client-side
  // network errors since those fields are meant for upstream service errors."
  //
  // This gate is why the message match below is safe. Without it, a real
  // Postgres error whose message merely CONTAINS blip text — canonically
  // 22P02, `invalid input syntax for type uuid: "Load failed"` — would be
  // misclassified and then suppressed at BOTH doors (the logger AND the
  // beforeSend drop), with no remaining path to Sentry.
  if (errorCode(error)) return false;

  const msg = error.message ?? "";

  if (BLIP_MESSAGE_FRAGMENTS.some((fragment) => msg.includes(fragment))) {
    return true;
  }

  // Mobile Safari can also throw with an empty message on a killed background
  // fetch (JAVASCRIPT-REACT-2J, 2026-07-03) — no 'Load failed' text survives.
  // An empty message AND an empty code together is the signature of a raw
  // network throw, not a real DB error.
  if (!msg) return true;

  return false;
}

/**
 * A network blip that a service call site re-threw for its user-facing error
 * path. Carries the call site's verbatim message, so nothing downstream can
 * tell it apart from the plain Error it replaced (P990 Decision 4).
 *
 * Its only purpose is to let `beforeSend` drop the event by reading a verdict
 * OUR code assigned, rather than guessing at a message shape (P883). It must
 * therefore only ever be constructed by `throwDbError`.
 */
export class NetworkBlipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkBlipError";
  }
}
