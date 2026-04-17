/**
 * @file p692-get-deliveries-for-letters.test.ts
 * @description P692: Canary + regression tests for getDeliveriesForLetters batch function.
 * Tests pure grouping behavior: empty input → empty map; multiple letters → correct groups.
 *
 * P699 Phase 2: function now uses get_deliveries_with_progress RPC (includes step counts).
 * Tests updated to mock supabase.rpc instead of supabase.from.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the service
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      }),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Mock Sentry
vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

// Mock logDbError
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
}));

import { getDeliveriesForLetters } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';

const mockFrom = vi.mocked(supabase.from);
const mockRpc = vi.mocked(supabase.rpc);

function makeDelivery(letterId: string, id: string) {
  return {
    id,
    letter_id: letterId,
    recipient_email: 'test@example.com',
    status: 'pending' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    invitation_token: null,
    opened_at: null,
    recipient_user_id: null,
    steps_completed: 0,
    total_steps: 3,
  };
}

describe('getDeliveriesForLetters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map for empty input without querying DB', async () => {
    const result = await getDeliveriesForLetters([]);
    expect(result).toEqual({});
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('groups deliveries by letter_id correctly', async () => {
    const delivery1a = makeDelivery('letter-1', 'del-1a');
    const delivery1b = makeDelivery('letter-1', 'del-1b');
    const delivery2a = makeDelivery('letter-2', 'del-2a');

    mockRpc.mockResolvedValue({ data: [delivery1a, delivery1b, delivery2a], error: null } as never);

    const result = await getDeliveriesForLetters(['letter-1', 'letter-2']);

    expect(result['letter-1']).toHaveLength(2);
    expect(result['letter-1'][0].id).toBe('del-1a');
    expect(result['letter-1'][1].id).toBe('del-1b');
    expect(result['letter-2']).toHaveLength(1);
    expect(result['letter-2'][0].id).toBe('del-2a');
  });

  it('returns empty array for letters with no deliveries', async () => {
    const delivery1 = makeDelivery('letter-1', 'del-1');

    mockRpc.mockResolvedValue({ data: [delivery1], error: null } as never);

    const result = await getDeliveriesForLetters(['letter-1', 'letter-with-no-deliveries']);

    expect(result['letter-1']).toHaveLength(1);
    expect(result['letter-with-no-deliveries']).toEqual([]);
  });

  it('uses single RPC call for multiple letters', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null } as never);

    await getDeliveriesForLetters(['letter-1', 'letter-2', 'letter-3']);

    // One RPC call (not N per letter)
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_deliveries_with_progress', {
      p_letter_ids: ['letter-1', 'letter-2', 'letter-3'],
    });
  });
});
