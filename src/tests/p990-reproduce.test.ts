/**
 * P990 canary — `logDbError` suppressed network-blip noise (door 1), then the
 * call site's `throw new Error(...)` re-reported the identical blip under a
 * wrapper message through Sentry's global handler (door 2 stayed open).
 *
 * Live evidence this was real, not theoretical: Sentry held both twins of the
 * same underlying event —
 *   JAVASCRIPT-REACT-28: "DB error in submitPointResponse: TypeError: Load failed"
 *     (the logDbError path — filtered)
 *   JAVASCRIPT-REACT-29: "Failed to submit point response: TypeError: Load failed"
 *     (the throw path — still reported)
 * Both fired from the same /letter/:id session, same timeframe.
 *
 * FIXED: every `logDbError(...)` + `throw` site now funnels through
 * `throwDbError`, which throws a NetworkBlipError on a blip; `sentryBeforeSend`
 * drops that by the TYPE our code assigned — never by message shape, which is
 * the alternative P883 rejected (decisions.md 2026-06-05) and which could not
 * reach the 5 sites whose thrown message never interpolates `error.message`.
 *
 * This file was the pre-fix canary (door 2 guarded with `it.fails`); post-fix it
 * converts to plain `it` blocks and stays as the permanent regression guard —
 * same shape as the P988 canary in this domain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';
import type { PostgrestError } from '@supabase/postgrest-js';

/**
 * `db-error-logger` reads `import.meta.env.DEV` at module scope, so it has to be
 * (re-)imported AFTER stubEnv to model prod. That means vi.resetModules(), which
 * builds a fresh module registry — so every module under test must be loaded
 * from that SAME registry, or `instanceof NetworkBlipError` compares two
 * distinct class objects and fails. (Only a test-harness concern: the prod
 * bundle has exactly one instance of each module.)
 */
async function load() {
  const [logger, blipModule, filters] = await Promise.all([
    import('@/app/data/db-error-logger'),
    import('@/lib/network-blip'),
    import('@/lib/sentry-filters'),
  ]);

  /** What Sentry's global handler builds for an unhandled throw from our code. */
  const eventFor = (error: Error): ErrorEvent =>
    ({ exception: { values: [{ type: error.name, value: error.message }] } }) as unknown as ErrorEvent;

  return {
    ...logger,
    ...blipModule,
    ...filters,
    /** Capture what a call site throws, the way a caller's catch would see it. */
    thrownBy: (fn: () => never): Error => {
      try {
        fn();
      } catch (e) {
        return e as Error;
      }
      throw new Error('expected the call site to throw, but it returned');
    },
    /** Run the real beforeSend the way Sentry.init calls it: (event, hint). */
    wouldReport: (thrown: Error): boolean =>
      filters.sentryBeforeSend(eventFor(thrown), { originalException: thrown }) !== null,
  };
}

/** A supabase-js client-side fetch failure: blip text, and NO postgres code. */
const blip = (message: string): PostgrestError =>
  ({ message, code: '', details: '', hint: '' }) as PostgrestError;

describe('P990: a re-thrown network blip is not reported to Sentry', () => {
  beforeEach(() => {
    vi.resetModules();
    // logDbError returns early in dev before blip classification — the blip
    // path only exists in prod, so model prod.
    vi.stubEnv('DEV', false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AC #1 — the exact issue on file (JAVASCRIPT-REACT-29).
  it('AC1: submitPointResponse blip throws NetworkBlipError and is dropped', async () => {
    const { throwDbError, NetworkBlipError, thrownBy, wouldReport } = await load();

    const thrown = thrownBy(() =>
      throwDbError(
        'submitPointResponse',
        blip('TypeError: Load failed'),
        'Failed to submit point response: TypeError: Load failed'
      )
    );

    expect(thrown).toBeInstanceOf(NetworkBlipError);
    expect(wouldReport(thrown)).toBe(false);
    // Door 1 stayed shut too — no wrapper event from the logger.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // AC #2 — a DIFFERENT service function, proving the fix is generic rather
  // than one call site patched.
  it('AC2: createLetter blip is dropped too (generic, not one call site)', async () => {
    const { throwDbError, NetworkBlipError, thrownBy, wouldReport } = await load();

    const thrown = thrownBy(() =>
      throwDbError(
        'createLetter',
        blip('TypeError: Load failed'),
        'Failed to create letter: TypeError: Load failed'
      )
    );

    expect(thrown).toBeInstanceOf(NetworkBlipError);
    expect(wouldReport(thrown)).toBe(false);
  });

  // AC #3 — the P883-harm test. This is the case that would fail if the fix
  // keyed on the message instead of the type.
  describe('AC3: genuine application errors still reach Sentry', () => {
    it('(a) a unique-constraint violation is reported', async () => {
      const { throwDbError, NetworkBlipError, thrownBy, wouldReport } = await load();
      const real = {
        message: 'duplicate key value violates unique constraint "profiles_slug_key"',
        code: '23505',
        details: '',
        hint: '',
      } as PostgrestError;

      const thrown = thrownBy(() =>
        throwDbError('createLetter', real, `Failed to create letter: ${real.message}`)
      );

      expect(thrown).not.toBeInstanceOf(NetworkBlipError);
      expect(wouldReport(thrown)).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    // A broad /Load failed/ beforeSend would wrongly drop this. Type-keying
    // cannot: nothing constructed a NetworkBlipError.
    it('(b) a genuine Error whose message CONTAINS "TypeError: Load failed" is reported', async () => {
      const { NetworkBlipError, wouldReport } = await load();
      const genuine = new Error(
        'Failed to render story: TypeError: Load failed while parsing user content'
      );
      expect(genuine).not.toBeInstanceOf(NetworkBlipError);
      expect(wouldReport(genuine)).toBe(true);
    });

    // Security Review, Input Validation: a REAL postgres error echoing
    // attacker-influenceable text back in its message. Fails against the
    // pre-fix predicate, which had no !error.code gate on the message branch.
    it('(c) a 22P02 whose message contains blip text is NOT classified as a blip', async () => {
      const { throwDbError, NetworkBlipError, isNetworkBlip, thrownBy, wouldReport } = await load();
      const realWithBlipText = {
        message: 'invalid input syntax for type uuid: "Load failed"',
        code: '22P02',
        details: '',
        hint: '',
      } as PostgrestError;

      expect(isNetworkBlip(realWithBlipText)).toBe(false);

      const thrown = thrownBy(() =>
        throwDbError('getLetterByToken', realWithBlipText, 'Failed to fetch letter')
      );

      expect(thrown).not.toBeInstanceOf(NetworkBlipError);
      expect(wouldReport(thrown)).toBe(true);
    });

    // The inverse of (c): the !error.code gate must not narrow real blip coverage.
    it('(c-inverse) the same message with an EMPTY code is still a blip', async () => {
      const { isNetworkBlip } = await load();
      expect(isNetworkBlip(blip('TypeError: Load failed'))).toBe(true);
    });
  });

  // JAVASCRIPT-REACT-2J — the second, distinct blip shape.
  it('empty-message twin (killed background fetch) is classified and dropped', async () => {
    const { throwDbError, NetworkBlipError, isNetworkBlip, thrownBy, wouldReport } = await load();
    const emptyBlip = { message: '', code: '', details: '', hint: '' } as PostgrestError;

    expect(isNetworkBlip(emptyBlip)).toBe(true);

    const thrown = thrownBy(() =>
      throwDbError('submitPointResponse', emptyBlip, 'Failed to submit point response: ')
    );

    expect(thrown).toBeInstanceOf(NetworkBlipError);
    expect(wouldReport(thrown)).toBe(false);
  });

  it('suppression is observable — a breadcrumb is left, but no issue is created', async () => {
    const { throwDbError, thrownBy } = await load();

    thrownBy(() =>
      throwDbError(
        'submitPointResponse',
        blip('TypeError: Load failed'),
        'Failed to submit point response'
      )
    );

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'db-error-suppressed',
      level: 'info',
      data: { context: 'submitPointResponse', reason: 'network-blip' },
    });
    // A breadcrumb is not an issue — this is what makes it safe.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('the non-throwing logDbError path is unaffected — still suppresses, still returns', async () => {
    const { logDbError } = await load();
    // The 127 graceful-degradation sites call this and carry on; it must not throw.
    expect(() => logDbError('getUnreadLetterCount', blip('TypeError: Load failed'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // AC #4 — no caller can tell NetworkBlipError apart from the Error it replaced.
  it('AC4: the thrown value is an Error and its message is byte-identical', async () => {
    const { throwDbError, thrownBy } = await load();
    const message = 'Could not save your explanation. Please try again.';

    const thrown = thrownBy(() =>
      throwDbError('uploadExplainBack.insert', blip('Load failed'), message)
    );

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe(message);
    expect(typeof thrown.stack).toBe('string');
  });

  // P882 regression guard: composing the filters must not break the SW drop.
  it('composition: sentryBeforeSend still drops service-worker registration noise', async () => {
    const { sentryBeforeSend } = await load();
    const swEvent = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Rejected',
            stacktrace: { frames: [{ filename: 'https://claritypledge.com/registerSW.js' }] },
          },
        ],
      },
    } as unknown as ErrorEvent;

    expect(sentryBeforeSend(swEvent, {})).toBeNull();
  });

  it('composition: an ordinary application error passes through both filters', async () => {
    const { wouldReport } = await load();
    const ordinary = new Error('Failed to create letter: permission denied for table letters');
    expect(wouldReport(ordinary)).toBe(true);
  });
});
