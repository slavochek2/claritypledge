/**
 * P1236 — the 180-minute room bound is written in three places. Bind them.
 *
 * The bound exists in:
 *   1. `ROOM_MAX_DURATION_MINUTES` in supabase/functions/transcribe-slice/handler.ts —
 *      the ingest's per-slice cap; a slice for an older room is refused and the room ended.
 *   2. `interval '180 minutes'` inside enter_transcribe_room() — which room a new arrival
 *      is dropped into.
 *   3. the `cutoff` in countActiveRooms (index.ts), which imports (1), so it is not a
 *      third independent copy — asserted below so that stays true.
 *
 * Copy 2 cannot import copy 1: a Deno constant is not reachable from SQL. Until now the
 * only thing holding them together was a comment saying "if one moves, move both", which
 * is not a mechanism — and an adversarial review of this branch pointed out that no test,
 * canary or migration check enforced it. Confirmed by grep before writing this: the SQL
 * literal appeared in no test anywhere in the repo.
 *
 * WHY THE DRIFT MATTERS, concretely. If the SQL bound grows past the TypeScript one,
 * enter_transcribe_room hands a new arrival a room the ingest will refuse on the very next
 * slice: the room opens, the microphone runs, every upload 410s, and the participant sees
 * "Listening" while nothing is stored. That is the exact failure this whole feature spent
 * itself fixing, reintroduced by a number moving in one file.
 *
 * If it shrinks below, the opposite: two people arriving minutes apart get two different
 * rooms and cannot see each other — the split that the advisory lock was added to prevent,
 * reached by a path the lock does not cover, because it needs no concurrency at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const HANDLER = read('supabase/functions/transcribe-slice/handler.ts');
const INDEX = read('supabase/functions/transcribe-slice/index.ts');
const MIGRATION = read('supabase/migrations/20260910120000_p1236_f_enter_shared_room.sql');

describe('P1236 — the room-duration bound may not drift between SQL and TypeScript', () => {
  it('the TypeScript constant is readable and is a plain number of minutes', () => {
    const m = HANDLER.match(/export const ROOM_MAX_DURATION_MINUTES\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  it('the SQL literal in enter_transcribe_room equals the TypeScript constant', () => {
    const ts = Number(HANDLER.match(/export const ROOM_MAX_DURATION_MINUTES\s*=\s*(\d+)/)![1]);
    const sql = MIGRATION.match(/c_max_age\s+CONSTANT\s+interval\s*:=\s*interval\s*'(\d+)\s*minutes'/i);
    expect(sql).not.toBeNull();
    // If this fails, do not "fix the test" — one of the two numbers moved and the other
    // did not, and the header above says what that costs a participant.
    expect(Number(sql![1])).toBe(ts);
  });

  it('countActiveRooms derives its cutoff from the constant rather than repeating it', () => {
    // A third hand-written literal would be a third thing to keep in step. It currently
    // imports the constant; this holds that shape.
    expect(INDEX).toContain('ROOM_MAX_DURATION_MINUTES');
    const cutoffLine = INDEX.split('\n').find((l) => l.includes('const cutoff'));
    expect(cutoffLine).toBeDefined();
    expect(cutoffLine).toContain('ROOM_MAX_DURATION_MINUTES');
    expect(cutoffLine).not.toMatch(/\b180\b/);
  });
});
