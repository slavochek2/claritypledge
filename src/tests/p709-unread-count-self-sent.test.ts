/**
 * @file p709-unread-count-self-sent.test.ts
 * @description P709: Canary + regression tests for getUnreadLetterCount self-sent exclusion.
 *
 * Canary gate:
 *   Before fix: Branch 1 counts ALL received unread with no self-sent exclusion.
 *               - supabase.from('letter_deliveries') chain has NO .not() call
 *               - Test asserting .not() was called → FAILS
 *               - count returns 1 (the self-sent delivery counted) → FAILS
 *   After fix:  Branch 1 fetches own letter IDs first, then excludes via .not().
 *               - .not('letter_id', 'in', '(own-letter-uuid)') called → PASSES
 *               - count returns 0 (filtered builder resolves to 0) → PASSES
 *               - clarity_letters queried exactly once (Branch 2 consolidation) → PASSES
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER_ID = 'user-uuid-abc';
const OWN_LETTER_ID = 'own-letter-uuid-111';

// Mock Supabase before importing the service
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

import { getUnreadLetterCount } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';

const mockFrom = vi.mocked(supabase.from);

/**
 * Creates a chainable query builder mock that is also awaitable.
 * Records all method calls for assertion.
 */
function makeQueryBuilder(resolvedValue: { data?: unknown; count?: number | null; error: null }) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'eq', 'neq', 'is', 'in', 'filter', 'order', 'limit'];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  // Make it thenable (awaitable) like a PostgrestBuilder
  builder['then'] = (resolve: (v: unknown) => unknown) => resolve(resolvedValue);
  builder['catch'] = vi.fn();
  return builder as Record<string, ReturnType<typeof vi.fn>>;
}

describe('getUnreadLetterCount', () => {
  let deliveriesBuilder: ReturnType<typeof makeQueryBuilder>;
  let filteredDeliveriesBuilder: ReturnType<typeof makeQueryBuilder>;
  let lettersBuilder: ReturnType<typeof makeQueryBuilder>;

  beforeEach(() => {
    vi.clearAllMocks();

    // clarity_letters: user sent one letter (OWN_LETTER_ID), not sealed
    lettersBuilder = makeQueryBuilder({ data: [{ id: OWN_LETTER_ID, status: 'draft' }], error: null });

    // Pre-filter deliveries builder: returns count: 1 (the self-sent delivery)
    // After .not() is applied, resolves to filteredDeliveriesBuilder which returns count: 0
    filteredDeliveriesBuilder = makeQueryBuilder({ count: 0, error: null });
    deliveriesBuilder = makeQueryBuilder({ count: 1, error: null });
    // .not() returns a new builder that resolves to 0 — simulates the filter working
    deliveriesBuilder['not'] = vi.fn().mockReturnValue(filteredDeliveriesBuilder);

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'clarity_letters') return lettersBuilder as never;
      if (tableName === 'letter_deliveries') return deliveriesBuilder as never;
      return deliveriesBuilder as never;
    });
  });

  it('CANARY: excludes self-sent letters from received unread count via .not() filter', async () => {
    const count = await getUnreadLetterCount(USER_ID);

    // The letter_deliveries query MUST have .not() called with the own letter ID
    // Before fix: no .not() call → assertion fails
    // After fix:  .not('letter_id', 'in', `(${OWN_LETTER_ID})`) called → passes
    expect(deliveriesBuilder.not).toHaveBeenCalledWith(
      'letter_id',
      'in',
      `(${OWN_LETTER_ID})`
    );

    // The filtered result (0) must be returned, not the unfiltered count (1)
    // Before fix: count = 1 (self-sent delivery included) → fails
    // After fix:  count = 0 (self-sent excluded via .not()) → passes
    expect(count).toBe(0);
  });

  it('CANARY: fetches clarity_letters once (Branch 2 consolidation)', async () => {
    await getUnreadLetterCount(USER_ID);

    // Before fix: clarity_letters queried twice (Branch 1 own-ids fetch + Branch 2 sealed-ids fetch)
    // After fix:  queried once (single fetch, Branch 2 reuses the result)
    expect(mockFrom).toHaveBeenCalledWith('clarity_letters');
    const lettersCallCount = mockFrom.mock.calls.filter(c => c[0] === 'clarity_letters').length;
    expect(lettersCallCount).toBe(1);
  });

  it('skips .not() filter when user has never sent any letters', async () => {
    // Override: clarity_letters returns empty array
    lettersBuilder = makeQueryBuilder({ data: [], error: null });
    const directDeliveriesBuilder = makeQueryBuilder({ count: 3, error: null });
    directDeliveriesBuilder['not'] = vi.fn().mockReturnValue(makeQueryBuilder({ count: 0, error: null }));
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'clarity_letters') return lettersBuilder as never;
      return directDeliveriesBuilder as never;
    });

    await getUnreadLetterCount(USER_ID);

    // No .not() call when ownIds is empty
    expect(directDeliveriesBuilder.not).not.toHaveBeenCalled();
  });

  it('Branch 2: counts in_progress responses (not just completed)', async () => {
    // User has a sealed letter — recipient has started but not finished (in_progress)
    const SEALED_LETTER_ID = 'sealed-letter-uuid-222';
    lettersBuilder = makeQueryBuilder({
      data: [{ id: SEALED_LETTER_ID, status: 'sealed' }],
      error: null,
    });

    const responsesBuilder = makeQueryBuilder({ count: 1, error: null });
    responsesBuilder['not'] = vi.fn().mockReturnValue(responsesBuilder);

    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'clarity_letters') return lettersBuilder as never;
      return responsesBuilder as never;
    });

    await getUnreadLetterCount(USER_ID);

    // Branch 2 must use .in('status', [...]) not .eq('status', 'completed')
    // This verifies in_progress deliveries are included
    expect(responsesBuilder.in).toHaveBeenCalledWith(
      'status',
      ['in_progress', 'completed']
    );
  });

  it('returns 0 when no unread deliveries after self-sent exclusion', async () => {
    const emptyBuilder = makeQueryBuilder({ count: 0, error: null });
    emptyBuilder['not'] = vi.fn().mockReturnValue(makeQueryBuilder({ count: 0, error: null }));
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'clarity_letters') return lettersBuilder as never;
      return emptyBuilder as never;
    });

    const count = await getUnreadLetterCount(USER_ID);
    expect(count).toBe(0);
  });
});
