/**
 * @file p960-duplicate-point-response.test.ts
 * @description Service-level half of a P960 code-review finding.
 *
 * `withTimeout` rejects locally but does not cancel the request, so the server
 * can commit the first answer after the client has already given up. On the
 * authenticated path that insert is guarded by `letter_point_responses_unique`,
 * so the retry the timeout invites used to dead-end on 23505 and the reader
 * could not proceed without reloading.
 *
 * `submitPointResponse` now treats 23505 as success, matching what the token
 * path has always done — `submit_point_response_by_token` inserts
 * ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING
 * (20260403224331_p581_clarity_letters.sql:599).
 *
 * Lives in its own file because p960-reproduce.test.tsx mocks the whole
 * letters-service module, so the real function is unreachable there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const update = vi.fn(() => ({
  eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
}));
const throwDbError = vi.fn((_context: string, _error: unknown, message: string) => {
  throw new Error(message);
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert, update, upsert: vi.fn().mockResolvedValue({ error: null }) })),
    // The function reads the session after the staging insert to decide whether
    // to mirror into point_positions. No session -> that branch is skipped.
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
  throwDbError: (context: string, error: unknown, message: string) =>
    throwDbError(context, error, message),
}));

import { submitPointResponse } from '@/app/data/letters-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P960: a duplicate point response is success, not an error', () => {
  it('does not throw on a 23505 unique violation', async () => {
    insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key value' } });

    await expect(submitPointResponse('delivery-1', 'point-0', 'agree')).resolves.toBeUndefined();
    expect(throwDbError).not.toHaveBeenCalled();
  });

  it('still throws on any other insert error', async () => {
    insert.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } });

    await expect(submitPointResponse('delivery-1', 'point-0', 'agree')).rejects.toThrow(
      /permission denied/
    );
    expect(throwDbError).toHaveBeenCalledTimes(1);
  });

  it('still throws on an error carrying no code', async () => {
    insert.mockResolvedValueOnce({ error: { message: 'network unreachable' } });

    await expect(submitPointResponse('delivery-1', 'point-0', 'agree')).rejects.toThrow(
      /network unreachable/
    );
    expect(throwDbError).toHaveBeenCalledTimes(1);
  });
});
