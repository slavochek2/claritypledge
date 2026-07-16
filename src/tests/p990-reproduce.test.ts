/**
 * P990 canary — logDbError suppresses network-blip noise (door 1), but the
 * call sites' `throw new Error(...)` re-reports the identical blip under a
 * wrapper message through Sentry's global handler (door 2 stays open).
 *
 * Live evidence this is real, not theoretical: Sentry has both twins for the
 * same underlying event —
 *   JAVASCRIPT-REACT-28: "DB error in submitPointResponse: TypeError: Load failed"
 *     (the logDbError path — filtered)
 *   JAVASCRIPT-REACT-29: "Failed to submit point response: TypeError: Load failed"
 *     (the throw path — still reported)
 * Both fired from the same /letter/:id session, same timeframe.
 *
 * This test proves door 1 is correctly closed and door 2 is still open,
 * against src/app/data/letters-service.ts:385-386's exact shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';
import { dropServiceWorkerRegistrationNoise } from '@/lib/sentry-filters';

describe('P990: network-blip rethrow bypasses the noise filter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('door 1 (logDbError) correctly suppresses the blip — no Sentry call', async () => {
    const { logDbError } = await import('@/app/data/db-error-logger');
    logDbError('submitPointResponse', {
      message: 'TypeError: Load failed',
      code: '',
      details: '',
      hint: '',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // Guarded with `it.fails` so the suite stays GREEN while the bug is open —
  // this assertion states the post-fix expected behavior and fails today
  // (proving the bug). When the fix lands it flips RED, signaling the canary
  // must convert to a plain `it`. See decisions.md convention (P985/P986).
  it.fails('door 2 (the call-site rethrow) should also be suppressed', () => {
    // Mirrors letters-service.ts:385-386 exactly: logDbError suppresses,
    // then the same call site re-throws the identical blip text wrapped in
    // a new plain Error, one line later.
    const rethrown = new Error(
      'Failed to submit point response: TypeError: Load failed'
    );

    // What Sentry's global handler builds when this throw goes unhandled.
    // event.exception is the serialized view the beforeSend hook receives.
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: rethrown.message,
            // App call site, not a service-worker registration frame —
            // dropServiceWorkerRegistrationNoise (today's only beforeSend,
            // wired at main.tsx:39) cannot match this shape.
            stacktrace: {
              frames: [
                {
                  filename:
                    'https://claritypledge.com/assets/letters-service-abc123.js',
                  abs_path:
                    'https://claritypledge.com/assets/letters-service-abc123.js',
                  function: 'submitPointResponse',
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const result = dropServiceWorkerRegistrationNoise(event);

    // Expected (post-fix) behavior: a network blip re-thrown from a service
    // call is dropped, same as the logDbError path.
    // Actual (today): dropServiceWorkerRegistrationNoise only knows about
    // SW-registration frames — it returns the event unchanged, and it
    // reaches Sentry. This is JAVASCRIPT-REACT-29 firing.
    expect(result).toBeNull();
  });
});
