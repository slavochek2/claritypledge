/**
 * @file report-unless-blip.ts
 * @description P1177: report an async rejection to Sentry unless it is a
 * transient network blip.
 *
 * P1176 added this gate inline at one call site (`agent-accounts-context.tsx`).
 * P1177 found five more call sites with the same unconditional
 * `Sentry.captureException`, two of them in the same file as each other, so the
 * gate is a function here rather than six copies of the same eight lines.
 *
 * It lives beside `network-blip.ts` rather than inside it on purpose:
 * `network-blip.ts` is a leaf module that the Sentry bootstrap itself imports
 * (`sentry-filters` -> `main.tsx`), so it must not import `@sentry/react`.
 *
 * The gate covers ONLY whether the rejection is reported. It never changes what
 * the call site does about the failure — the caller keeps its own toast, retry
 * or fallback exactly as before (P1177 Invariants).
 */

import * as Sentry from '@sentry/react';
import { isNetworkBlip, type DbErrorLike } from '@/lib/network-blip';

/**
 * `isNetworkBlip` tests `'code' in error`, which THROWS on a primitive. A
 * rejection is `unknown` and can be a string or a number, so handing one
 * straight to the predicate would turn an error handler into a new TypeError
 * and skip whatever the call site does after it — found by the code review of
 * this file. Anything that is not an object is not blip-shaped anyway, so it
 * becomes `null` and reports normally.
 */
function asDbErrorLike(err: unknown): DbErrorLike {
  return err !== null && typeof err === 'object' ? (err as DbErrorLike) : null;
}

interface ReportOptions {
  /** Sentry tags for the real-error path, passed through unchanged. */
  tags?: Record<string, string>;
  /**
   * Names this call site in the suppression breadcrumb, so a dropped blip is
   * still traceable to where it happened.
   */
  context: string;
}

/**
 * Reports `err` to Sentry, unless it is a network blip — in which case it drops
 * an `info` breadcrumb instead, matching what `db-error-logger` does for the
 * data layer (P990).
 *
 * @returns `true` when the error was reported, `false` when it was suppressed.
 * The return value exists so a test can assert the branch taken without
 * reaching into the Sentry mock.
 */
export function reportUnlessBlip(err: unknown, options: ReportOptions): boolean {
  if (isNetworkBlip(asDbErrorLike(err))) {
    Sentry.addBreadcrumb({
      category: 'db-error-suppressed',
      level: 'info',
      data: { context: options.context, reason: 'network-blip' },
    });
    return false;
  }

  Sentry.captureException(err, options.tags ? { tags: options.tags } : undefined);
  return true;
}
