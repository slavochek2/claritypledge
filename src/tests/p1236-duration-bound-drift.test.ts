/**
 * P1236 — the 180-minute room bound is written in three places. Bind them.
 *
 * UPDATED for P1307 (Decision 3): the bound's SHAPE changes from "one room-age filter
 * checked in three places" to "one per-MEMBER cap checked in three places" — the room-age
 * filter in `enter_transcribe_room`'s SELECT is REMOVED entirely (D11: a room may run
 * longer than 180 minutes as long as it is not ended; the per-person cap is what actually
 * bounds a member's capture). `ROOM_MAX_DURATION_MINUTES` itself does NOT change value —
 * it is now measured from each member's own `joined_at` rather than the room's
 * `created_at` — so the three readers below are updated to that relationship rather than
 * to a still-shared room-age SQL literal, which no longer exists to compare against.
 *
 * The bound now lives in:
 *   1. `ROOM_MAX_DURATION_MINUTES` in supabase/functions/transcribe-slice/handler.ts —
 *      the ingest's per-slice cap; still 180 minutes, now measured from `memberJoinedAt`
 *      (SliceMembership, Decision 3 item 1) rather than `roomCreatedAt`.
 *   2. `countActiveRooms` (index.ts), which imports (1) and filters on `joined_at` on the
 *      caller's OWN `transcribe_room_members` row instead of `transcribe_rooms.created_at`
 *      (Decision 3 item 3) — still importing the constant, not a second copy.
 *   3. `enter_transcribe_room`'s room-SELECTION query, which after this migration carries
 *      **no** room-age bound of its own at all (Decision 3's own stated trade-off: its
 *      liveness now depends entirely on the sweep in Decision 2 — a comment at the removal
 *      site is the required guard, not a runtime cross-check).
 *
 * Copy 1/2 cannot import copy 3's absence directly (there is nothing to import), so this
 * file's job changes from "assert two numbers match" to "assert the SQL age filter is
 * actually gone, and that the two TypeScript readers agree with each other and with the
 * per-member relationship Decision 3 describes."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const HANDLER = read('supabase/functions/transcribe-slice/handler.ts');
const INDEX = read('supabase/functions/transcribe-slice/index.ts');
// P1307's replacement for the room-selection body — file name per the spec's own "Files to
// Create" list (§Technical Architecture, Implementation Approach). If /dev names the
// migration file differently, this read fails loudly rather than silently passing against
// stale content, which is the correct failure for a drift-guard test.
const P1307_ENTER_ROOM_MIGRATION = 'supabase/migrations/20260914120200_p1307_transcribe_member_cap_source.sql';

describe('P1307 — the room-duration bound is now per-MEMBER, and must not drift between SQL and TypeScript', () => {
  it('the TypeScript constant is readable and is a plain number of minutes', () => {
    const m = HANDLER.match(/export const ROOM_MAX_DURATION_MINUTES\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    // The value itself is UNCHANGED by P1307 — only what it is measured FROM changes.
    expect(Number(m![1])).toBe(180);
  });

  it('the per-slice cap is computed from memberJoinedAt, not roomCreatedAt', () => {
    // Decision 3 item 1: "ageMs is computed from memberJoinedAt, not roomCreatedAt."
    const ageMsLine = HANDLER.split('\n').find((l) => l.includes('const ageMs'));
    expect(ageMsLine, 'handler.ts must compute ageMs somewhere — this line moved or was renamed').toBeDefined();
    expect(ageMsLine).toContain('memberJoinedAt');
    expect(
      ageMsLine,
      'ageMs must no longer read roomCreatedAt — that is the P1236-era per-ROOM cap this migration replaces',
    ).not.toContain('roomCreatedAt');
  });

  it('SliceMembership carries memberJoinedAt', () => {
    const interfaceBlock = HANDLER.slice(
      HANDLER.indexOf('export interface SliceMembership'),
      HANDLER.indexOf('export interface HandlerDeps'),
    );
    expect(interfaceBlock).toContain('memberJoinedAt');
  });

  it('countActiveRooms filters on the MEMBER row\'s joined_at, not the room\'s created_at', () => {
    // Decision 3 item 3: ".gt('transcribe_rooms.created_at', cutoff)" becomes
    // ".gt('joined_at', cutoff)" on the transcribe_room_members row already being queried.
    expect(INDEX).toContain('ROOM_MAX_DURATION_MINUTES');
    const cutoffLine = INDEX.split('\n').find((l) => l.includes('const cutoff'));
    expect(cutoffLine, 'countActiveRooms must still derive its cutoff from the imported constant').toBeDefined();
    expect(cutoffLine).toContain('ROOM_MAX_DURATION_MINUTES');
    expect(cutoffLine).not.toMatch(/\b180\b/);

    const gtLine = INDEX.split('\n').find((l) => l.includes(".gt('") || l.includes('.gt("'));
    expect(gtLine, 'countActiveRooms must have a .gt(...) cutoff filter').toBeDefined();
    expect(
      gtLine,
      'countActiveRooms must filter on the MEMBER\'s own joined_at, not the ROOM\'s created_at (P1307 Decision 3 item 3)',
    ).toMatch(/\.gt\(\s*['"]joined_at['"]/);
    expect(gtLine).not.toContain('transcribe_rooms.created_at');
  });

  it('the room-SELECTION query in enter_transcribe_room carries no room-age bound at all', () => {
    let migration: string;
    try {
      migration = read(P1307_ENTER_ROOM_MIGRATION);
    } catch {
      throw new Error(
        `Expected the P1307 migration replacing enter_transcribe_room's room-selection query ` +
        `at ${P1307_ENTER_ROOM_MIGRATION} (see spec §Technical Architecture, Files to Create). ` +
        `If /dev named it differently, update this path — do not delete this test.`,
      );
    }
    // The pre-P1307 filter this migration must remove, read directly from
    // 20260911151200_p1236_g_fix_enter_room_ambiguity.sql this session:
    //   c_max_age CONSTANT interval := interval '180 minutes';
    //   ... AND r.created_at > now() - c_max_age ...
    expect(
      migration,
      'the room-selection query must no longer filter on room age — Decision 3 item 2 drops ' +
      'it entirely, coupled to Decision 2\'s sweep landing in the same release',
    ).not.toMatch(/r\.created_at\s*>\s*now\(\)\s*-\s*c_max_age/);
    // What must remain: liveness is ended_at IS NULL alone.
    expect(migration).toMatch(/ended_at\s+IS\s+NULL/i);
  });
});
