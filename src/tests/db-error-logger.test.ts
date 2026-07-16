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
