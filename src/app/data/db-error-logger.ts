/**
 * @file db-error-logger.ts
 * @description Centralized DB error logging — dev console + Sentry in production.
 *
 * Replaces the dev-only `log('ERROR: ...')` pattern so Supabase query failures
 * are captured by Sentry in production while still printing to the console
 * during development.
 */

import * as Sentry from '@sentry/react';
import type { PostgrestError } from '@supabase/postgrest-js';
import { isNetworkBlip, NetworkBlipError, type DbErrorLike } from '@/lib/network-blip';

const isDev = import.meta.env.DEV;

/**
 * Leave a trace when we drop an error, so an over-suppression mistake stays
 * discoverable. A breadcrumb creates no Sentry issue — it rides along with the
 * NEXT captured error — so this reintroduces none of the noise P990 removes.
 *
 * Called from the two suppression sites only (logDbError's blip early-return
 * and throwDbError's blip branch), never from the 150+ call sites.
 */
function noteSuppression(
  context: string,
  reason: 'network-blip' | 'jwt-expired' = 'network-blip'
): void {
  Sentry.addBreadcrumb({
    category: 'db-error-suppressed',
    level: 'info',
    data: { context, reason },
  });
}

/**
 * Log a Supabase DB error.
 *
 * - Dev: console.error with context + full error object.
 * - Prod: Sentry.captureException with context, code, details, and hint as extras.
 */
export function logDbError(
  context: string,
  error: PostgrestError | null | undefined
): void {
  if (!error) return;

  if (isDev) {
    console.error(`[db-error] ${context}:`, error);
    return;
  }

  // Network blips (offline / tab-switch mid-flight) — not real DB errors,
  // don't pollute Sentry. The predicate lives in lib/network-blip so the throw
  // path (throwDbError) and the Sentry beforeSend filter consult the SAME
  // definition — P990: a local copy here left the re-throw door open.
  if (isNetworkBlip(error)) {
    noteSuppression(context);
    return;
  }

  const msg = error.message ?? '';

  // Expired-token-as-anon transient (P913) — not a real DB error.
  // The letter RLS SELECT policies invoke the SECURITY DEFINER helpers
  // _is_letter_receiver / _is_letter_sender, which p651 revoked from `anon`
  // (granted to `authenticated` only). When a logged-in user's token silently
  // expires but the SPA still holds a stale `user`, a background poll (e.g.
  // getUnreadLetterCount) fires as `anon` and gets 42501 "permission denied for
  // function _is_letter_*". A real authenticated user can never hit this — the
  // grant is verified present on prod. The caller already degrades gracefully
  // (returns 0, 0 users impacted), so this is pure noise. Scoped to the helper
  // functions only — a genuine "permission denied for table X" still reports.
  const isExpiredSessionRpcDenied =
    error.code === '42501' &&
    msg.includes('permission denied for function _is_letter_');
  if (isExpiredSessionRpcDenied) return;

  // P1011: PGRST303 "JWT expired" — the same expired-token artifact as the 42501
  // case above, arriving through PostgREST's own door instead of an RLS helper.
  //
  // Not routed through isNetworkBlip: that predicate short-circuits on any error
  // carrying a code (network-blip.ts:64), and PGRST303 legitimately carries one —
  // PostgREST really did reject the token. The blip is UPSTREAM of it.
  //
  // Evidence (JAVASCRIPT-REACT-2F breadcrumbs, both events): the machine wakes
  // from sleep, a Supabase fetch fails with "Failed to fetch" because the network
  // is not up yet, and ~3s later the polled RPC goes out carrying the token that
  // therefore never got refreshed. auth-js keeps the session rather than signing
  // the user out on a retryable fetch error (GoTrueClient.js:1962), which is what
  // lets the stale token reach the wire. The next poll (15s) succeeds on its own.
  //
  // Suppressed rather than repaired because the caller already degrades to an
  // empty list and self-heals on the following tick. The user-visible gap — an
  // empty inbox with no "offline" affordance — is real but is a UI concern, not
  // this logger's, and is deliberately left for its own spec.
  if (error.code === 'PGRST303') {
    noteSuppression(context, 'jwt-expired');
    return;
  }

  Sentry.captureException(new Error(`DB error in ${context}: ${error.message}`), {
    extra: {
      context,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  });
}

/**
 * Log a DB error and throw it for the caller's user-facing error path.
 *
 * Use this instead of `logDbError(...)` followed by `throw new Error(...)`.
 * That shape re-reported every suppressed network blip to Sentry under the
 * wrapper message (P990): logDbError filtered the blip, and the next line threw
 * a plain Error carrying the same blip text straight into the global handler.
 * An ESLint rule (`no-restricted-syntax` in eslint.config.js) now rejects it.
 *
 * On a blip this throws a `NetworkBlipError`, which `sentryBeforeSend` drops by
 * TYPE — never by message shape (P883). The throw still happens either way, with
 * the message byte-identical, so the caller's error UI is unchanged.
 *
 * **Type-based suppression covers blips ONLY.** A coded transient — notably
 * PGRST303 (P1011) — is dropped by `logDbError` above, but `isNetworkBlip` returns
 * false for it (network-blip.ts:64 short-circuits on any error carrying a code),
 * so the throw below is a plain `Error` that `dropNetworkBlipRethrow` will NOT
 * filter. Today nothing leaks because the only PGRST303 caller (`getInboxItems`)
 * catches it, but that is caller discipline, not a mechanism. Before adding a
 * `throwDbError` call site that lets the rejection escape to the global handler,
 * give the coded-transient class its own error type here — do not rely on this
 * function's suppression, which does not extend to it.
 *
 * `message` is passed verbatim per call site (never reassembled) to preserve
 * existing Sentry issue grouping. Returns `never` so TypeScript keeps narrowing
 * control flow exactly as the bare `throw` did.
 */
export function throwDbError(
  context: string,
  error: DbErrorLike,
  message: string
): never {
  // Emits the db-error-suppressed breadcrumb itself on the blip path, so this
  // function must not re-emit it — one breadcrumb per suppression.
  logDbError(context, error as PostgrestError | null | undefined);

  if (isNetworkBlip(error)) throw new NetworkBlipError(message);

  throw new Error(message);
}
