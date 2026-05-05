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
    msg.includes('signal is aborted');
  if (isNetworkBlip) return;

  Sentry.captureException(new Error(`DB error in ${context}: ${error.message}`), {
    extra: {
      context,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  });
}
