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

const isDev = import.meta.env.DEV;

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
  // don't pollute Sentry. supabase-js wraps fetch failures into a
  // Postgrest-shaped object whose `message` carries the underlying cause.
  const msg = error.message ?? '';
  const isNetworkBlip =
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('AbortError') ||
    msg.includes('signal is aborted') ||
    msg.includes('The network connection was lost') ||
    msg.includes('Load failed'); // Mobile Safari's phrasing for a failed fetch (JAVASCRIPT-REACT-2H, 2026-07-02)
  if (isNetworkBlip) return;

  // Mobile Safari can also throw with an empty message on a killed background
  // fetch (JAVASCRIPT-REACT-2J, 2026-07-03) — no 'Load failed' text survives.
  // A genuine Postgrest error always carries a Postgres error code; an empty
  // message AND an empty code together is the signature of a raw network
  // throw, not a real DB error.
  if (!msg && !error.code) return;

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

  Sentry.captureException(new Error(`DB error in ${context}: ${error.message}`), {
    extra: {
      context,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  });
}
