---
status: rejected
rejected_reason: 'Speculative defense-in-depth. No user impact (production client always sends -3..3 from POSITION_VALUES). Filed during P835 audit rabbit hole — no second incident justifies fixing. See decisions.md 2026-05-15 [process] N=1 entry. Two it.fails blocks in src/tests/p839-parity-positions.test.ts continue to document the gap if it ever matters.'
rejected_date: '2026-05-15'
type: bug
rank: 1000772.0
severity: medium
workstream: infra
date_reported: '2026-05-15'
created_date: '2026-05-15'
tags: [edge-function, validation, defense-in-depth, p835-followup]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P841: isValidPositionsArray accepts out-of-range and non-integer position values

## Summary

The `isValidPositionsArray` validator in `request-letter-response-signin/index.ts:214-225` checks `typeof item.position === 'number'` but does not bound-check the value or require it to be an integer. A client can submit `position: 999`, `position: -Infinity`, or `position: 1.5` and the edge function will accept it.

## Root Cause

Surfaced by the P835/P839 backfill audit (2026-05-15) on the validator surface. The server predicate's full check is:

```ts
typeof item === 'object' &&
typeof item.pointId === 'string' &&
UUID_REGEX.test(item.pointId) &&
typeof item.position === 'number'
```

No range check, no `Number.isInteger`. The client `POSITION_VALUES` (in `src/app/types/index.ts:976`) only ever emits the integer set `[-3, -2, -1, 0, 1, 2, 3]`, so under normal use the gap is invisible. But the production client maps via `POSITION_VALUES[p.position as PositionType] ?? 0` (`src/app/pages/signup-page.tsx:110`) — a hostile or stale client could submit any number, and the server would forward it into the pending row's `positions_json`.

The P835 KDD entry (decisions.md, 2026-05-15) established that the DB CHECK constraint is the tiebreaker for validator drift. The corresponding DB column for these positions needs to be confirmed during /reproduce: if a CHECK constraint exists on the column where positions land (likely `position` integer in some join table), the validator should mirror it; if no DB CHECK exists, the validator is the only defense and the gap is real.

## Reproduction Steps

1. Run the existing canary: `npx vitest run src/tests/p839-parity-positions.test.ts`
2. Observe the two `it.fails` blocks pass (i.e., the assertions inside them fail as expected — the predicate accepts `position: 999` and `position: 1.5`):
   - `it.fails('server should reject position=999 (out of any reasonable range)')`
   - `it.fails('server should reject non-integer position (e.g. 1.5)')`
3. (Optional, server-side reproduction) `curl` the deployed `request-letter-response-signin` endpoint with a payload containing `positions: [{ pointId: "<valid uuid>", position: 999 }]` plus the rest of a valid request body. Edge function returns `{ ok: true }` instead of `400 'Invalid request.'`.

**Reproduction rate:** 100% (deterministic — the predicate is pure).

## Expected Behavior

`isValidPositionsArray` rejects any payload where `position` is outside `[-3, +3]` or not an integer. The check should be:

```ts
typeof item.position === 'number' &&
Number.isInteger(item.position) &&
item.position >= -3 &&
item.position <= 3
```

If a corresponding DB CHECK constraint exists on the target column, mirror its bounds exactly (per the source-pair-plus-DB-CHECK pattern from P835 KDD).

## Actual Behavior

`isValidPositionsArray` accepts any number for `position`, including `999`, `-Infinity`, `1.5`, and `Number.MAX_SAFE_INTEGER`. The accepted value is written verbatim into `letter_response_pending.positions_json` and later mapped into the database via `confirm-letter-response/index.ts`.

Downstream consequence depends on the target column's CHECK constraint (to be verified during /reproduce):
- If a CHECK exists: out-of-range values get rejected at write time — the user sees a server error after magic-link confirmation, not at signup. Bad UX, no data corruption.
- If no CHECK exists: garbage values land in the database, polluting position aggregates and any analytics that read this table.

## Affected Files

- `supabase/functions/request-letter-response-signin/index.ts:214-225` — the validator with the missing bound
- `supabase/functions/confirm-letter-response/index.ts:~232` — the read-back path that consumes `positions_json` (per P835 grep, also needs an audit for read-time validation)
- `src/tests/p839-parity-positions.test.ts` — existing canary that documents the gap via two `it.fails` blocks; flip to plain `it()` after fix
- `supabase/migrations/` — TBD: the target column's CHECK constraint (if any) is the tiebreaker; verify during /reproduce

## Severity

**Medium** — no current user impact (the production client always sends `-3..3` from `POSITION_VALUES`, so no real user has triggered the gap). Defense-in-depth missing: a stale client, a hostile actor, or a future client refactor that changes the position scale (parallel to P835's RATING_OPTIONS evolution) would all expose the gap. Severity is medium rather than high because (a) no live-broken flow, (b) the missing check is a hardening, not a fix, and (c) the canary already parametrizes the failure mode for future regression detection.

## Fix Approach

Single-file change in `supabase/functions/request-letter-response-signin/index.ts:214-225`. Add `Number.isInteger(item.position) && item.position >= -3 && item.position <= 3` to the existing predicate. Then in `src/tests/p839-parity-positions.test.ts`, flip the two `it.fails` blocks to plain `it()` and update the verbatim copy of the predicate to mirror the new bounds (exactly the same pattern as P835's fix).

Pre-flight per P835 KDD: grep for the corresponding DB CHECK constraint on the position column — if it exists with different bounds, mirror the DB; if it doesn't exist, file a follow-up to add it (P835 established that validator + DB CHECK should agree, and the DB constraint is the harder gate).

## Acceptance Criteria

- [ ] `isValidPositionsArray` rejects `position: 999`, `position: -Infinity`, `position: 1.5`, `position: NaN`, and `position: Number.MAX_SAFE_INTEGER`.
- [ ] All values in `POSITION_VALUES` (currently `-3..3` integers) still pass.
- [ ] Both `it.fails` blocks in `src/tests/p839-parity-positions.test.ts` are flipped to plain `it()` and pass green.
- [ ] If a DB CHECK constraint exists on the target position column, the validator's bound matches it exactly.
- [ ] No regressions in the existing P835 canary or any letter-response E2E tests.
- [ ] No console errors in the affected flow.
