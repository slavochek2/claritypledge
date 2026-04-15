/**
 * @file p708-authenticated-letter-position-dual-write.test.ts
 * @description P708: Canary + regression tests for dual-write to point_positions
 *              in submitLetterResponseAuthenticated.
 *
 * Canary gate:
 *   Before fix: code does NOT call supabase.from('point_positions').upsert(...)
 *               Test asserts upsert was called → FAILS.
 *   After fix:  code calls supabase.from('point_positions').upsert(...) with the
 *               correct shape and onConflict: 'point_id,user_id' → PASSES.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SENDER_ID = 'sender-uuid-p708';
const RECIPIENT_ID = 'recipient-uuid-p708';
const LETTER_ID = 'letter-uuid-p708';
const DELIVERY_ID = 'delivery-uuid-p708';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
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

import { submitLetterResponseAuthenticated } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';
import { logDbError } from '@/app/data/db-error-logger';

const mockGetSession = vi.mocked(supabase.auth.getSession);
const mockFrom = vi.mocked(supabase.from);
const mockRpc = vi.mocked(supabase.rpc);

function setupAuthSession() {
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: { id: RECIPIENT_ID, email: 'recipient@test.com' },
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_in: 3600,
        token_type: 'bearer',
      },
    },
    error: null,
  } as never);
}

/** Returns per-table upsert spy from the current mockFrom call history. */
function getTableUpsert(tableName: string) {
  const callIdx = mockFrom.mock.calls.findIndex(([t]) => t === tableName);
  if (callIdx === -1) return undefined;
  return (mockFrom.mock.results[callIdx]?.value as Record<string, ReturnType<typeof vi.fn>>)?.upsert;
}

function setupFromMocks(overrides?: {
  pointPositionsUpsertError?: { message: string };
}) {
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
    if (tableName === 'point_positions' && overrides?.pointPositionsUpsertError) {
      return {
        upsert: vi.fn().mockResolvedValue({ error: overrides.pointPositionsUpsertError }),
      } as never;
    }
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    } as never;
  });
}

describe('P708: submitLetterResponseAuthenticated dual-write to point_positions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'test-agent',
      configurable: true,
    });
  });

  // ---------------------------------------------------------------------------
  // P708 CANARY — FAILS before fix (no point_positions upsert), PASSES after fix
  // ---------------------------------------------------------------------------

  it('P708 canary: upserts point_positions after inserting letter_point_responses', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    await submitLetterResponseAuthenticated(
      LETTER_ID,
      [],
      [{ pointId: 'point-1', position: 'agree' }],
      'v1.0',
    );

    const ppUpsert = getTableUpsert('point_positions');

    // CANARY: point_positions must have been upserted
    expect(ppUpsert, 'point_positions upsert was never called — dual-write missing').toBeDefined();
    expect(ppUpsert).toHaveBeenCalledWith(
      [{ point_id: 'point-1', user_id: RECIPIENT_ID, position: 'agree' }],
      { onConflict: 'point_id,user_id' },
    );
  });

  // ---------------------------------------------------------------------------
  // Upsert order: letter_point_responses insert BEFORE point_positions upsert
  // ---------------------------------------------------------------------------

  it('writes letter_point_responses before point_positions (audit log first)', async () => {
    setupAuthSession();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const callOrder: string[] = [];
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'clarity_letters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { sender_id: SENDER_ID }, error: null }),
            }),
          }),
        } as never;
      }
      return {
        insert: vi.fn().mockImplementation(() => {
          callOrder.push(`${tableName}.insert`);
          return Promise.resolve({ error: null });
        }),
        upsert: vi.fn().mockImplementation(() => {
          callOrder.push(`${tableName}.upsert`);
          return Promise.resolve({ error: null });
        }),
      } as never;
    });

    await submitLetterResponseAuthenticated(
      LETTER_ID,
      [],
      [{ pointId: 'point-1', position: 'agree' }],
      'v1.0',
    );

    const lprIdx = callOrder.findIndex((c) => c === 'letter_point_responses.insert');
    const ppIdx = callOrder.findIndex((c) => c === 'point_positions.upsert');
    expect(lprIdx, 'letter_point_responses.insert not called').toBeGreaterThanOrEqual(0);
    expect(ppIdx, 'point_positions.upsert not called').toBeGreaterThanOrEqual(0);
    expect(ppIdx).toBeGreaterThan(lprIdx);
  });

  // ---------------------------------------------------------------------------
  // Non-fatal: point_positions upsert failure must NOT throw
  // ---------------------------------------------------------------------------

  it('does not throw when point_positions upsert fails (RLS/unverified user)', async () => {
    setupAuthSession();
    setupFromMocks({ pointPositionsUpsertError: { message: 'violates row-level security policy' } });
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    // Must NOT throw — staging write already succeeded
    await expect(
      submitLetterResponseAuthenticated(
        LETTER_ID,
        [],
        [{ pointId: 'point-1', position: 'agree' }],
        'v1.0',
      ),
    ).resolves.toBe(DELIVERY_ID);

    // logDbError must be called for observability
    expect(vi.mocked(logDbError)).toHaveBeenCalledWith(
      expect.stringContaining('point_positions'),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // Enum validation: invalid position strings are filtered before upsert
  // ---------------------------------------------------------------------------

  it('filters out invalid (non-enum) position strings before upserting point_positions', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    await submitLetterResponseAuthenticated(
      LETTER_ID,
      [],
      [
        { pointId: 'point-1', position: 'agree' },          // valid
        { pointId: 'point-2', position: '2' },              // invalid: numeric string
        { pointId: 'point-3', position: 'strongly_disagree' }, // valid
      ],
      'v1.0',
    );

    const ppUpsert = getTableUpsert('point_positions');
    expect(ppUpsert).toBeDefined();

    const rows = ppUpsert?.mock.calls[0]?.[0] as Array<{ point_id: string; position: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.point_id)).toEqual(['point-1', 'point-3']);
  });

  // ---------------------------------------------------------------------------
  // Skips point_positions call entirely when positions array is empty
  // ---------------------------------------------------------------------------

  it('does not call point_positions at all when positions is empty', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    await submitLetterResponseAuthenticated(LETTER_ID, [], [], 'v1.0');

    const fromTableNames = mockFrom.mock.calls.map(([t]) => t);
    expect(fromTableNames).not.toContain('point_positions');
  });

  // ---------------------------------------------------------------------------
  // Multiple positions: all valid positions are batch-upserted in one call
  // ---------------------------------------------------------------------------

  it('batch-upserts all valid positions in a single point_positions call', async () => {
    setupAuthSession();
    setupFromMocks();
    mockRpc.mockResolvedValue({ data: DELIVERY_ID, error: null } as never);

    const positions = [
      { pointId: 'p1', position: 'agree' },
      { pointId: 'p2', position: 'disagree' },
      { pointId: 'p3', position: 'unsure' },
    ];

    await submitLetterResponseAuthenticated(LETTER_ID, [], positions, 'v1.0');

    const ppUpsert = getTableUpsert('point_positions');
    expect(ppUpsert).toHaveBeenCalledTimes(1);
    const rows = ppUpsert?.mock.calls[0]?.[0] as Array<{ point_id: string; user_id: string; position: string }>;
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r.user_id).toBe(RECIPIENT_ID));
  });
});
