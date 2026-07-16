/**
 * @file p883-duplicate-recipient-no-sentry.test.ts
 * @description Canary tests for P883: addRecipientToSealed must NOT report the
 * expected duplicate-recipient constraint violation to Sentry (via logDbError).
 *
 * Bug: logDbError('addRecipientToSealed', error) is called BEFORE the branch
 * that translates idx_letter_deliveries_unique_email / idx_letter_deliveries_one_per_recipient
 * violations to the friendly "already been invited" error. Every duplicate-invite
 * attempt ships a Sentry error event (JAVASCRIPT-REACT-1X) for a user-recoverable case.
 *
 * Expected after fix: friendly error still thrown, logDbError NOT called for the
 * two known constraints; logDbError STILL called for unexpected DB errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// P990 moved the call site from `logDbError(...); throw new Error(...)` to the
// throwDbError choke point, which logs and throws in one call. The double
// mirrors that delegation so the assertions below still measure what they did
// before: logDbError is reached for unexpected errors, skipped for the
// expected duplicate.
vi.mock('@/app/data/db-error-logger', () => {
  const logDbError = vi.fn();
  return {
    logDbError,
    throwDbError: vi.fn((context: string, error: unknown, message: string) => {
      logDbError(context, error);
      // This IS the shape the P990 rule bans, on purpose: the double reproduces
      // throwDbError's real log-then-throw behavior. A mock factory is not a
      // service call site — nothing here reaches Sentry, which is what the rule
      // protects.
      // eslint-disable-next-line no-restricted-syntax -- intentional: see above
      throw new Error(message);
    }),
  };
});

import { addRecipientToSealed } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';
import { logDbError } from '@/app/data/db-error-logger';

const mockRpc = vi.mocked(supabase.rpc);
const mockLogDbError = vi.mocked(logDbError);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P883: addRecipientToSealed — expected duplicate constraint must not hit Sentry', () => {
  it.each([
    'idx_letter_deliveries_unique_email',
    'idx_letter_deliveries_one_per_recipient',
  ])('throws friendly error WITHOUT logDbError when %s is violated', async (constraint) => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: `duplicate key value violates unique constraint "${constraint}"` },
    } as never);

    await expect(
      addRecipientToSealed('letter-1', 'x@example.com')
    ).rejects.toThrow('This person has already been invited to this letter.');

    expect(mockLogDbError).not.toHaveBeenCalled();
  });

  it('still calls logDbError for unexpected DB errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    } as never);

    await expect(addRecipientToSealed('letter-1', 'x@example.com')).rejects.toThrow(
      'Failed to add recipient: connection refused'
    );

    expect(mockLogDbError).toHaveBeenCalledWith(
      'addRecipientToSealed',
      expect.objectContaining({ message: 'connection refused' })
    );
  });
});
