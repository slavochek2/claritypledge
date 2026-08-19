/**
 * @file p1114-grace-hours-sync.test.ts
 * @description Architecture Decision 4 of
 * features/p1114_event_room_presence_and_cmp_opt_in.md duplicates
 * `EVENT_GRACE_HOURS` as a second literal inside the P1114 freeze-boundary SQL
 * (each mutating RPC declares its own local `CONSTANT`, commented "MUST equal
 * EVENT_GRACE_HOURS in events-service-real.ts:16"), because a Postgres function
 * cannot import a Vite-bundled TS constant. Decision 4's own rationale: "the
 * choice is between silent duplication and loud, tested duplication" — this is
 * the loud half. It cannot pin the SQL-side literal (no test in this repo can
 * read a migration file's PL/pgSQL body as data), but it DOES pin the TS side
 * against silent drift, so a future change to `EVENT_GRACE_HOURS` without a
 * matching SQL migration fails a test instead of failing silently in prod.
 *
 * This is deliberately a UNIT test, not an e2e/integration one — it asserts a
 * source-code constant, needs no server, and does not depend on the P1114
 * migration existing yet (EVENT_GRACE_HOURS already ships today, per P494).
 */
import { describe, it, expect } from 'vitest';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';

describe('P1114 Decision 4: EVENT_GRACE_HOURS SQL/TS cross-reference canary', () => {
  it('EVENT_GRACE_HOURS is 5 — if this changes, the P1114 freeze-boundary SQL literal (join_event_room, set_room_opt_in, set_room_readiness) must change in the SAME migration, per the cross-reference comment Architecture Decision 4 requires on each RPC', () => {
    expect(EVENT_GRACE_HOURS).toBe(5);
  });
});
