/**
 * @file p1114-no-anon-surface.test.ts
 * @description P1114 revision 2 — the anonymous surface is closed, and stays closed.
 *
 * WHY THIS FILE EXISTS: revision 1 let a person with no account enter the room, which
 * required a bespoke identity mechanism — a server-minted bearer secret per row, four
 * SECURITY DEFINER functions granted to `anon`, and the secret held in localStorage.
 * The founder retired the walk-in outright on 2026-08-20 ("this person doesn't exist even
 * for normal events"), so that mechanism has no user. An unauthenticated database surface
 * with no user is a surface, not a spare part.
 *
 * Reads the migrations and the client service directly. Nothing here needs a database:
 * a grant that is still written in a migration is a grant that still ships.
 */
/**
 * RED-FIRST, via this repo's `it.fails` convention (P835/P895). Every assertion below is
 * written before the build and currently fails, so `it.fails` keeps `npm test` green until
 * the build lands — and flips the test RED the moment the behaviour becomes correct, forcing
 * whoever fixes it to delete the `.fails` and lock the assertion in.
 *
 * That convention opens a hole: while `.fails` is present, `npx vitest run <this file>` exits
 * 0 over assertions that are not actually satisfied. The Verification Contract closes it with
 * its own row — no `.fails` marker may survive in any p1114 test file — so the gate cannot go
 * green on a suite that is passing only because it expects to fail.
 *
 * The tests NOT marked `.fails` are the ones already true and required to stay true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const RPC_FNS = ['join_event_room', 'set_room_opt_in', 'set_room_readiness', 'get_my_room_status'];

/** Every migration touching this feature — never a hardcoded list, so a later migration
 *  that re-grants cannot hide from this test by having a name we did not think of. */
function roomMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf-8') }))
    .filter(({ sql }) => RPC_FNS.some((fn) => sql.includes(fn)) || sql.includes('event_room_'));
}

describe('P1114 rev2: no unauthenticated database surface', () => {
  it.fails('grants EXECUTE on none of the four room RPCs to anon', () => {
    for (const { name, sql } of roomMigrations()) {
      for (const line of sql.split('\n')) {
        if (!/GRANT\s+EXECUTE/i.test(line)) continue;
        if (!RPC_FNS.some((fn) => line.includes(fn))) continue;
        expect(
          /\banon\b/.test(line),
          `${name} grants EXECUTE to anon:\n  ${line.trim()}\nRevision 2 removed the walk-in, so no unauthenticated caller should reach these functions. Grant to authenticated only.`,
        ).toBe(false);
      }
    }
  });

  it('grants no table-level privilege on the room tables to anon', () => {
    for (const { name, sql } of roomMigrations()) {
      for (const line of sql.split('\n')) {
        if (!/^\s*GRANT\s/i.test(line)) continue;
        if (!/event_room_/.test(line)) continue;
        expect(
          /\banon\b/.test(line),
          `${name} grants a table privilege to anon:\n  ${line.trim()}\nRoom membership is for registered, signed-in attendees only.`,
        ).toBe(false);
      }
    }
  });

  it.fails('keeps no bearer secret in the client read/write path', () => {
    const service = readFileSync(join(process.cwd(), 'src/app/data/event-room-service.ts'), 'utf-8');
    expect(
      /client_secret|clientSecret/.test(service),
      'event-room-service.ts still reads or sends a client_secret. Identity is the signed-in profile now — auth.uid(), the pattern used everywhere else in this codebase — not a bearer token the browser holds.',
    ).toBe(false);
  });

  it.fails('stores no room identity in localStorage', () => {
    const service = readFileSync(join(process.cwd(), 'src/app/data/event-room-service.ts'), 'utf-8');
    expect(
      /localStorage/.test(service),
      'event-room-service.ts still touches localStorage. The locally-held identity existed only so an account-less walk-in could change their own answer later; a signed-in person needs no such thing.',
    ).toBe(false);
  });
});
