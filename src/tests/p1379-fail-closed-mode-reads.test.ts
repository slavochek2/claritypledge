/**
 * @file p1379-fail-closed-mode-reads.test.ts
 * @description P1379 review fix: when the letter-mode read FAILS, no prediction may
 * surface — even though the prediction/rating queries themselves succeed. This is the
 * old-public-letter case: stored prediction rows exist and must stay hidden.
 *
 * Each case pairs a failed-mode run with a CONTROL (mode read succeeds, one-to-one),
 * using the identical data queries, so a mock that returned nothing everywhere would
 * fail the control rather than pass the defect case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };

/** Per-table canned results; each chain method returns the same thenable builder. */
const tables: Record<string, Result> = {};
let rpcResult: Result = { data: null, error: null };

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit', 'in', 'order']) b[m] = () => b;
  b.single = () => Promise.resolve(tables[table]);
  b.maybeSingle = () => Promise.resolve(tables[table]);
  b.then = (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(tables[table]).then(res, rej);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: () => Promise.resolve(rpcResult),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  },
}));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), captureException: vi.fn(), addBreadcrumb: vi.fn() }));

import { getLetterBaselineRatings } from '@/app/data/api';
import { getLetterResults } from '@/app/data/letters-service';

const MODE_READ_FAILED: Result = { data: null, error: { code: '500', message: 'boom' } };

describe('P1379: getLetterBaselineRatings fails closed on an unknown mode', () => {
  beforeEach(() => {
    tables['letter_predictions'] = { data: [{ prediction: 9 }], error: null };
    tables['story_verifications'] = { data: [{ listener_rating: 4 }], error: null };
  });

  it('mode query fails, data queries succeed → null (no seeded baseline)', async () => {
    tables['clarity_letters'] = MODE_READ_FAILED;
    expect(await getLetterBaselineRatings('l', 's', 'snd', 'rcv')).toBeNull();
  });

  it('mode row missing → null', async () => {
    tables['clarity_letters'] = { data: [], error: null };
    expect(await getLetterBaselineRatings('l', 's', 'snd', 'rcv')).toBeNull();
  });

  it('one-to-many → null', async () => {
    tables['clarity_letters'] = { data: [{ mode: 'one-to-many' }], error: null };
    expect(await getLetterBaselineRatings('l', 's', 'snd', 'rcv')).toBeNull();
  });

  it('CONTROL one-to-one → the baseline pair', async () => {
    tables['clarity_letters'] = { data: [{ mode: 'one-to-one' }], error: null };
    expect(await getLetterBaselineRatings('l', 's', 'snd', 'rcv')).toEqual({ speakerRating: 9, listenerRating: 4 });
  });
});

describe('P1379: getLetterResults fails closed on an unknown mode', () => {
  beforeEach(() => {
    rpcResult = {
      data: [{
        perspective: 'receiver',
        sender_profile: { id: 'snd', name: 'Alice' },
        receiver_profile: null,
        snapshots: [],
        predictions: [{ story_id: 's1', prediction: 9 }],
        ratings: [{ story_id: 's1', listener_rating: 4 }],
        point_responses: [],
      }],
      error: null,
    };
  });

  it('mode read fails → mode null and predictions dropped', async () => {
    tables['clarity_letters'] = MODE_READ_FAILED;
    const r = await getLetterResults('l', 'd');
    expect(r?.mode).toBeNull();
    expect(r?.predictions).toEqual([]);
    expect(r?.ratings).toEqual([{ story_id: 's1', listener_rating: 4 }]);
  });

  it('CONTROL one-to-one → predictions kept', async () => {
    tables['clarity_letters'] = { data: { responses_mode: 'off', mode: 'one-to-one' }, error: null };
    const r = await getLetterResults('l', 'd');
    expect(r?.mode).toBe('one-to-one');
    expect(r?.predictions).toEqual([{ story_id: 's1', prediction: 9 }]);
  });
});
