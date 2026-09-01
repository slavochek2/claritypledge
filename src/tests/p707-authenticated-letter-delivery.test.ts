/**
 * @file p707-authenticated-letter-delivery.test.ts
 * @description P707: Canary + regression tests for submitLetterResponseAuthenticated.
 *
 * Canary gate:
 *   Before fix: code calls supabase.from('letter_deliveries').insert(...) which hits
 *               WITH CHECK(false) RLS → 42501 error → function throws.
 *               Test asserts success + rpc called → FAILS.
 *   After fix:  code calls supabase.rpc('create_letter_delivery', ...) which bypasses
 *               RLS via SECURITY DEFINER → returns delivery UUID → function succeeds.
 *               Test passes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SENDER_ID = 'sender-uuid-111';
const RECIPIENT_ID = 'recipient-uuid-222';
const RECIPIENT_EMAIL = 'recipient@test.com';
const LETTER_ID = 'letter-uuid-abc';
const DELIVERY_ID = 'delivery-uuid-xyz';

// Mock supabase before importing the service
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
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

import { submitLetterResponseAuthenticated } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react';

const mockGetSession = vi.mocked(supabase.auth.getSession);
const mockFrom = vi.mocked(supabase.from);
const mockRpc = vi.mocked(supabase.rpc);

function setupAuthSession() {
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: { id: RECIPIENT_ID, email: RECIPIENT_EMAIL },
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_in: 3600,
        token_type: 'bearer',
      },
    },
    error: null,
  } as never);
}

function setupFromMocks() {
  mockFrom.mockImplementation((tableName: string) => {
    if (tableName === 'clarity_letters') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { sender_id: SENDER_ID },
              error: null,
            }),
          }),
        }),
      } as never;
    }
    // story_verifications, letter_point_responses, terms_acceptances
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as never;
  });
}

describe('P707: submitLetterResponseAuthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.userAgent (used in terms_acceptances upsert)
    Object.defineProperty(navigator, 'userAgent', {
      value: 'test-agent',
      configurable: true,
    });
  });

  // ---------------------------------------------------------------------------
  // P707 CANARY — must FAIL before fix (code uses .from().insert() not .rpc())
  //               must PASS after fix (code uses .rpc('create_letter_delivery'))
  // ---------------------------------------------------------------------------

  it('P707 canary: uses create_letter_delivery RPC instead of direct insert', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const result = await submitLetterResponseAuthenticated(
      LETTER_ID,
      [{ storyId: 'story-1', rating: 4 }],
      [{ pointId: 'point-1', position: 'agree' }],
      'v1.0',
    );

    // After fix: function returns delivery UUID from RPC
    expect(result).toBe(DELIVERY_ID);

    // After fix: supabase.rpc called with create_letter_delivery
    expect(mockRpc).toHaveBeenCalledWith('create_letter_delivery', {
      p_letter_id: LETTER_ID,
      p_stories_rated: 1,
    });

    // After fix: letter_deliveries NOT directly inserted via .from()
    const fromCalls = mockFrom.mock.calls.map(([t]) => t);
    expect(fromCalls).not.toContain('letter_deliveries');
  });

  // ---------------------------------------------------------------------------
  // Idempotency — RPC returns same ID on double-call
  // ---------------------------------------------------------------------------

  it('returns same delivery ID when called twice (idempotency via RPC)', async () => {
    setupAuthSession();
    setupFromMocks();
    // RPC is idempotent: returns same ID both times
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const id1 = await submitLetterResponseAuthenticated(LETTER_ID, [], [], 'v1.0');
    const id2 = await submitLetterResponseAuthenticated(LETTER_ID, [], [], 'v1.0');

    expect(id1).toBe(DELIVERY_ID);
    expect(id2).toBe(DELIVERY_ID);
  });

  // ---------------------------------------------------------------------------
  // RPC error propagation
  // ---------------------------------------------------------------------------

  it('throws when create_letter_delivery RPC returns an error', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Sender cannot submit a response to their own letter' },
    } as never);

    await expect(
      submitLetterResponseAuthenticated(LETTER_ID, [], [], 'v1.0'),
    ).rejects.toThrow('Failed to create delivery');

    // Sentry warning must fire for sender-guard errors
    expect(vi.mocked(Sentry.captureMessage)).toHaveBeenCalledWith(
      expect.stringContaining('sender attempted own letter submission'),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  // ---------------------------------------------------------------------------
  // Not authenticated
  // ---------------------------------------------------------------------------

  it('throws when session is missing', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    await expect(
      submitLetterResponseAuthenticated(LETTER_ID, [], [], 'v1.0'),
    ).rejects.toThrow('Not authenticated');
  });

  // ---------------------------------------------------------------------------
  // story_verifications rows created for each rating
  // ---------------------------------------------------------------------------

  it('inserts one story_verifications row per rating', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const ratings = [
      { storyId: 'story-1', rating: 4 },
      { storyId: 'story-2', rating: 3 },
    ];

    await submitLetterResponseAuthenticated(LETTER_ID, ratings, [], 'v1.0');

    const svCall = mockFrom.mock.calls.find(([t]) => t === 'story_verifications');
    expect(svCall).toBeDefined();

    const insertArgs = (mockFrom.mock.results[
      mockFrom.mock.calls.findIndex(([t]) => t === 'story_verifications')
    ]?.value as Record<string, ReturnType<typeof vi.fn>>)?.insert?.mock?.calls?.[0]?.[0] as Array<{
      story_id: string;
      speaker_id: string;
      listener_id: string;
      delivery_id: string;
    }>;

    expect(insertArgs).toHaveLength(2);
    expect(insertArgs[0].story_id).toBe('story-1');
    expect(insertArgs[0].speaker_id).toBe(SENDER_ID);
    expect(insertArgs[0].listener_id).toBe(RECIPIENT_ID);
    // P1150: every row carries the delivery the RPC just created — the INSERT policy requires it.
    expect(insertArgs[0].delivery_id).toBe(DELIVERY_ID);
    expect(insertArgs[1].story_id).toBe('story-2');
    expect(insertArgs[1].delivery_id).toBe(DELIVERY_ID);
  });

  // ---------------------------------------------------------------------------
  // letter_point_responses rows created for each position
  // ---------------------------------------------------------------------------

  it('inserts one letter_point_responses row per position', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const positions = [
      { pointId: 'point-1', position: 'agree' },
      { pointId: 'point-2', position: 'disagree' },
    ];

    await submitLetterResponseAuthenticated(LETTER_ID, [], positions, 'v1.0');

    const lprCall = mockFrom.mock.calls.find(([t]) => t === 'letter_point_responses');
    expect(lprCall).toBeDefined();

    const insertArgs = (mockFrom.mock.results[
      mockFrom.mock.calls.findIndex(([t]) => t === 'letter_point_responses')
    ]?.value as Record<string, ReturnType<typeof vi.fn>>)?.insert?.mock?.calls?.[0]?.[0] as Array<{
      delivery_id: string;
      point_id: string;
      position: string;
    }>;

    expect(insertArgs).toHaveLength(2);
    expect(insertArgs[0].delivery_id).toBe(DELIVERY_ID);
    expect(insertArgs[0].point_id).toBe('point-1');
    expect(insertArgs[1].point_id).toBe('point-2');
  });
});
