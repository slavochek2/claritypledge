/**
 * @file db-error-logger.test.ts
 * Unit tests for src/app/data/db-error-logger.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry before importing the module.
// addBreadcrumb: P990 leaves a `db-error-suppressed` breadcrumb wherever an
// error is dropped, so an over-suppression mistake stays discoverable.
vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/react';

describe('logDbError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('does nothing when error is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Re-import to get fresh module with DEV=true (default in vitest)
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('test-context', null);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does nothing when error is undefined', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logDbError } = await import('../app/data/db-error-logger');
    logDbError('test-context', undefined);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs to console.error in dev mode', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logDbError } = await import('../app/data/db-error-logger');

    const mockError = {
      message: 'relation "users" does not exist',
      code: '42P01',
      details: null,
      hint: null,
    };

    logDbError('fetchProfile', mockError);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[db-error] fetchProfile:',
      mockError
    );
  });

  describe('production mode — network blip filtering', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('DEV', false);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('skips Sentry for "Failed to fetch" errors (offline)', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getInboxItems', {
        message: 'TypeError: Failed to fetch',
        code: '',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('skips Sentry for iOS Safari "network connection was lost"', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getInboxItems', {
        message: 'The network connection was lost.',
        code: '',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('skips Sentry for AbortError (tab-switch mid-flight)', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getUnreadLetterCount', {
        message: 'AbortError: signal is aborted without reason',
        code: '',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    // P1011 / JAVASCRIPT-REACT-2F. Breadcrumb evidence on both prod events: the
    // machine wakes from sleep, a Supabase fetch fails ("Failed to fetch",
    // network not up yet), and ~3s later the polled RPC carries the token that
    // therefore never refreshed. auth-js keeps the session on a retryable fetch
    // error (GoTrueClient.js:1962), which is what lets it reach the wire.
    it('skips Sentry for PGRST303 "JWT expired" (stale token after wake)', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getInboxItems', {
        message: 'JWT expired',
        code: 'PGRST303',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('leaves a jwt-expired breadcrumb so the suppression stays discoverable', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getInboxItems', {
        message: 'JWT expired',
        code: 'PGRST303',
        details: '',
        hint: '',
      });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'db-error-suppressed',
          data: expect.objectContaining({
            context: 'getInboxItems',
            reason: 'jwt-expired',
          }),
        })
      );
    });

    // Guards the narrowness of the code check: PGRST303 is the only PostgREST
    // code suppressed here. A different PGRST error must still report.
    it('still reports other PostgREST errors (e.g. PGRST116)', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('getInboxItems', {
        message: 'JSON object requested, multiple rows returned',
        code: 'PGRST116',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('still reports real DB errors (not filtered)', async () => {
      const { logDbError } = await import('../app/data/db-error-logger');
      logDbError('fetchProfile', {
        message: 'relation "x" does not exist',
        code: '42P01',
        details: '',
        hint: '',
      });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });
});
