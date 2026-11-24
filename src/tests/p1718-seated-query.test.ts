/**
 * P1718 review round 8 (Gemini): the contract of `isSeatedInRunningRound`, the one request /ready makes for R8.
 * The screen tests mock it; this pins the query itself: the member's seats, joined to their round (`!inner`, so a seat
 * whose round fails the filters is dropped), filtered to this event and to a round not yet ended, one row at most.
 * Whether the server honours these filters under RLS is proven live by the R8 e2e (e2e/p1718-mastermind-ready.spec.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  result: { data: [] as unknown[] | null, error: null as unknown },
}));

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'limit']) {
    builder[method] = (...args: unknown[]) => { db.calls.push([method, ...args]); return builder; };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(db.result).then(resolve, reject);
  return { supabase: { from: (table: string) => { db.calls.push(['from', table]); return builder; } } };
});

import { isSeatedInRunningRound } from '@/app/data/event-rounds-service';

beforeEach(() => {
  db.calls.length = 0;
  db.result = { data: [], error: null };
});

describe('isSeatedInRunningRound', () => {
  it('asks for this member\'s seat in an unended round of this event, one row at most', async () => {
    await isSeatedInRunningRound('ev-1', 'member-1');
    expect(db.calls).toEqual([
      ['from', 'event_round_seats'],
      ['select', 'round_id, event_rounds!inner(event_id, ended_at)'],
      ['eq', 'room_member_id', 'member-1'],
      ['eq', 'event_rounds.event_id', 'ev-1'],
      ['is', 'event_rounds.ended_at', null],
      ['limit', 1],
    ]);
  });

  it('a row means seated; no row, or no data, means not', async () => {
    db.result = { data: [{ round_id: 'r1' }], error: null };
    await expect(isSeatedInRunningRound('ev-1', 'member-1')).resolves.toBe(true);
    db.result = { data: [], error: null };
    await expect(isSeatedInRunningRound('ev-1', 'member-1')).resolves.toBe(false);
    db.result = { data: null, error: null };
    await expect(isSeatedInRunningRound('ev-1', 'member-1')).resolves.toBe(false);
  });

  it('throws on an error, which the hook answers with Ready (its catch), never with a seat', async () => {
    const error = { message: 'permission denied', code: '42501' };
    db.result = { data: null, error };
    await expect(isSeatedInRunningRound('ev-1', 'member-1')).rejects.toBe(error);
  });
});
