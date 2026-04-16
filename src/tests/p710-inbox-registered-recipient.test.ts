/**
 * @file p710-inbox-registered-recipient.test.ts
 * @description P710 QA gap: inbox must show received letter for a registered user
 * BEFORE they click the email link.
 *
 * Root cause (QA discovery, 2026-04-16):
 *   send-letter-emails created the delivery row with receiver_profile_id = NULL.
 *   get_inbox_items() filters WHERE receiver_profile_id = auth.uid() — missed the row.
 *   The row was only claimed (receiver_profile_id set) when the email link was clicked.
 *
 * Fix (send-letter-emails/index.ts):
 *   When isRegistered=true, immediately UPDATE letter_deliveries SET receiver_profile_id
 *   = authUser.id at send time. Claim remains idempotent on email click.
 *
 * Test strategy:
 *   Edge function is Deno — not unit-testable in Vitest.
 *   These tests guard the client-side pipeline: getInboxItems must correctly surface
 *   a 'received' item when get_inbox_items RPC returns one (i.e. after the fix, when
 *   receiver_profile_id is set at send time).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER_ID = 'user-uuid-710';
const LETTER_ID = 'letter-uuid-710';
const DELIVERY_ID = 'delivery-uuid-710';

const RECEIVED_ITEM = {
  type: 'received',
  delivery_id: DELIVERY_ID,
  letter_id: LETTER_ID,
  title: 'Private 2 stories',
  actor_name: 'Vyacheslav Ladischenski',
  timestamp: '2026-04-16T17:00:00Z',
  read_at: null,
  completed_at: null,
  stories_rated: 0,
  total_stories: 2,
  steps_completed: 0,
  total_steps: 5,
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
}));

import { supabase } from '@/lib/supabase';
import { getInboxItems } from '@/app/data/letters-service';

const mockSupabase = supabase as unknown as {
  auth: { getSession: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};

function mockAuth(userId: string) {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: userId } } },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P710: getInboxItems — registered recipient pre-claim', () => {
  it('canary: returns received item when get_inbox_items RPC surfaces one', async () => {
    // This simulates the post-fix state: receiver_profile_id was set at send time,
    // so get_inbox_items returns the delivery row.
    mockAuth(USER_ID);
    mockSupabase.rpc.mockResolvedValue({ data: [RECEIVED_ITEM], error: null });

    const items = await getInboxItems(USER_ID);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('received');
    expect(items[0].delivery_id).toBe(DELIVERY_ID);
    expect(items[0].letter_id).toBe(LETTER_ID);
    expect(items[0].actor_name).toBe('Vyacheslav Ladischenski');
    expect(items[0].completed_at).toBeNull();
    // Item should appear as unread
    expect(items[0].read_at).toBeNull();
  });

  it('pre-fix regression guard: returns empty when RPC returns empty (receiver_profile_id was NULL)', async () => {
    // Pre-fix state: receiver_profile_id NULL → get_inbox_items WHERE clause misses the row → [].
    // This test documents the bug. After the fix, this scenario no longer occurs for registered users.
    mockAuth(USER_ID);
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

    const items = await getInboxItems(USER_ID);

    expect(items).toHaveLength(0);
  });

  it('returns empty when RPC errors (does not throw)', async () => {
    mockAuth(USER_ID);
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC error', code: '42501' },
    });

    const items = await getInboxItems(USER_ID);

    expect(items).toHaveLength(0);
  });

  it('rpc is called with get_inbox_items (no parameters)', async () => {
    mockAuth(USER_ID);
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

    await getInboxItems(USER_ID);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_inbox_items');
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
  });
});
