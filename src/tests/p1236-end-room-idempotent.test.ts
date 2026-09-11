/**
 * P1236 — ending a room twice must not create a second transcription job per member.
 *
 * Found by adversarial review of this branch, 2026-09-11, and verified against the source
 * before being acted on: the client `endRoom` stamped `ended_at` unconditionally and then
 * created a job for every member, while the SERVER's endRoom
 * (supabase/functions/transcribe-slice/index.ts) had guarded with `.is('ended_at', null)`
 * all along. The two halves disagreed.
 *
 * Two ordinary sequences reach it, neither of them an exotic race:
 *
 *   1. The server ends the room when a slice arrives past the 180-minute cap. Nothing
 *      tells the other members' browsers — they still show "Listening" — so when one of
 *      them taps "End Session" an hour later, the client path runs against an
 *      already-ended room, re-stamps `ended_at` to the later time (losing when the room
 *      actually ended) and re-creates a job for every member, including ones who left.
 *   2. Two members tap "End Session" within a moment of each other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateChain = { rows: [] as { id: string }[] };
const roster = { rows: [] as Record<string, string>[] };

// Two tables, two shapes. `transcribe_room_members` is read with
// .select().eq().order(); `transcribe_rooms` is written with .update().eq().is().select().
// Routing on the table name keeps the guard chain honest — a mock that answered every
// chain identically would pass whether or not `.is()` were ever called.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (table: string) => {
      if (table === 'transcribe_room_members') {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: roster.rows, error: null }) }),
          }),
        };
      }
      return {
        update: () => ({
          eq: () => ({
            // `.is('ended_at', null)` is the guard; [] models "someone ended it first".
            is: () => ({ select: () => Promise.resolve({ data: updateChain.rows, error: null }) }),
          }),
        }),
      };
    },
  },
}));

const createTranscriptionJob = vi.fn();
vi.mock('@/app/data/api', () => ({
  createClaritySession: vi.fn(),
  createTranscriptionJob: (...a: unknown[]) => createTranscriptionJob(...a),
}));

import { endRoom } from '@/app/data/transcribe-service';

const TWO_MEMBERS = [
  { id: 'm1', room_id: 'r1', profile_id: 'p1', display_name: 'A', session_id: 's1', joined_at: 't' },
  { id: 'm2', room_id: 'r1', profile_id: 'p2', display_name: 'B', session_id: 's2', joined_at: 't' },
];

beforeEach(() => {
  roster.rows = TWO_MEMBERS;
  createTranscriptionJob.mockReset().mockResolvedValue(undefined);
  updateChain.rows = [];
});

describe('P1236 — endRoom is idempotent', () => {
  it('creates one job per member when this caller is the one that ends the room', async () => {
    updateChain.rows = [{ id: 'r1' }];          // the UPDATE affected a row → we ended it
    await endRoom('r1');
    expect(createTranscriptionJob).toHaveBeenCalledTimes(2);
  });

  it('creates NO jobs when the room was already ended by someone else', async () => {
    updateChain.rows = [];                       // guard matched nothing → already ended
    await endRoom('r1');
    // This is the whole finding: without the guard, member A gets a SECOND job for the
    // same session — hours after the first one, from a browser that was not even present.
    expect(createTranscriptionJob).not.toHaveBeenCalled();
  });

  it('does not throw when it loses the race — a second End Session is a normal outcome', async () => {
    updateChain.rows = [];
    await expect(endRoom('r1')).resolves.toBeUndefined();
  });
});
