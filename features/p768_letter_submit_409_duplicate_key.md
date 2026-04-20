---
status: in-progress
type: bug
rank: 1000761.0
severity: high
workstream: letter
date_reported: '2026-04-20'
created_date: '2026-04-20'
tags: [letter, submit, duplicate-key, re-submit]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p768-reproduce.spec.ts
  root_cause: "useLetterReadingState never rehydrates prior letter_point_responses on mount — positions start empty, phase renders point-engage for already-answered points, Submit click hits 409 on the INSERT-only audit constraint"
  confidence: high
  surfaces_in_scope: [authenticated-letter-reopen]
  surfaces_deferred: []
  reproduced_at: '2026-04-20'
  fix_track: immutable
---

# P768: Letter submit button fails with 409 on re-submit (duplicate key)

## Summary

Clicking Submit on a letter-reading page throws a 409 duplicate-key error when a response for the same (delivery_id, point_id) already exists — the client-side insert does not handle the `letter_point_responses_unique` conflict, so the user sees a silent button failure with only a console error.

## Root Cause

Two layers, one underlying gap:

1. **Primary: no DB rehydration of prior positions on mount.** `useLetterReadingState` (`src/app/hooks/useLetterReadingState.ts:289`) initializes `state.stories[].positions` as `{}` in every fresh mount. It restores from `sessionStorage` or a `savedStoryIndex` fallback, but it never reads `letter_point_responses` for the delivery. A receiver who reopens the letter in a new tab, a new device, or any session where `sessionStorage` was cleared lands on `initialPhase` = `point-engage` for the first visible point — regardless of whether a response already exists in DB.
2. **Downstream: `submitPointResponse` is a plain INSERT with no conflict handling.** `src/app/data/letters-service.ts:370` uses `.insert()` on `letter_point_responses`. The UNIQUE constraint `letter_point_responses_unique (delivery_id, point_id)` (migration `20260403224331_p581_clarity_letters.sql:92`) enforces immutable "first response wins" semantics — confirmed by the SQL/RPC paths (migrations p581 and p705) which use `ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING`. The authenticated client path diverged. So when layer 1 lets the user re-enter `point-engage`, layer 2 throws 409 on the re-INSERT.

**Decision (locked for this fix):** responses are **immutable audit records** — Track 1. The DB schema is authoritative; the product model (letter captures pre-call position, `/live` is where the flip happens) matches. Fix layer 1 and the 409 becomes unreachable from the UI. Do not change the service layer — the 409 is a correct defensive guard.

## Reproduction Steps

1. As an authenticated user (letter recipient), open a letter-reading URL, e.g. `/letter/6235ac99-e584-410e-9793-8e8d39ac75a7`
2. On a point, pick a position (Disagree/Unsure/Agree) and click Submit — succeeds first time
3. Navigate back to the same point (or reload and re-click Submit)
4. Click Submit again
5. Observe: button appears to do nothing; console shows `409 Conflict` from `letter_point_responses`, then `Uncaught Error: Failed to submit point response: duplicate key value violates unique constraint "letter_point_responses_unique"` from `letters-service.ts:378`.

**Reproduction rate:** 100% (whenever a row already exists for the (delivery_id, point_id) pair)

## Expected Behavior

Re-submit is either prevented in the UI (Submit disabled when a response already exists for the point, with clear messaging) OR it succeeds silently as a no-op / update. Either way: no console error, no silent-failure UX. The user must understand whether their position was recorded.

## Actual Behavior

Submit click triggers a network request to `letter_point_responses?on_conflict=...` that returns 409. Promise rejects with `Failed to submit point response: duplicate key value violates unique constraint "letter_point_responses_unique"`. No toast/UI feedback — only a console error. User has no signal that anything failed.

## Affected Files

- `src/app/hooks/useLetterReadingState.ts:289` — fresh state initializer; `positions: {}` with no DB rehydration (primary fix site)
- `src/app/hooks/useLetterReadingState.ts:414` — `submitPointPosition` caller; throws propagate here
- `src/app/components/letters/letter-flow-content.tsx:162` — `handleSubmitPosition`; no toast on throw (silent failure UX)
- `src/app/data/letters-service.ts:370` — plain `.insert()`; 409 is the correct DB-level guard (no change planned)
- `supabase/migrations/20260403224331_p581_clarity_letters.sql:92` — reference: the UNIQUE constraint
- `supabase/migrations/20260414000000_p705_dual_write_point_positions.sql:171` — reference: SQL path that uses `ON CONFLICT DO NOTHING`

## Severity

**High** — blocks the letter-reading Submit flow for any user who returns to an already-submitted letter (new tab, new device, or any session without fresh `sessionStorage`). First-time submit works; re-entry shows Submit on an already-answered point, clicking it surfaces a schema-level 409 to the console with no user-facing feedback.

## Fix Approach

Track 1 (immutable) — locked by product decision:

1. Add a fetcher for prior responses on the delivery (e.g. `getLetterPointResponses(deliveryId)` in `letters-service.ts`) — one `SELECT point_id, position FROM letter_point_responses WHERE delivery_id = ?` per letter open.
2. Seed `useLetterReadingState` initial state: for each snapshot, populate `positions[pointId]` from the DB result and set initial phase to `point-revealed` (or later) for points that already have a response. Fall back to `initialPhase(snapshot)` only when no response exists.
3. Do not change `submitPointResponse` — the 409 stays as a correct defensive guard.
4. Optional polish (not required for fix to pass AC): add a toast on any unexpected `submitPointResponse` throw so future schema-level failures never silent-fail again. Punt to separate spec if scope grows.

## Acceptance Criteria

- [ ] Re-opening a letter with an existing `letter_point_responses` row for a point does NOT render the `point-engage` Submit button for that point
- [ ] For already-answered points, the receiver sees their prior position (phase is `point-revealed` or later — matches the post-submit experience)
- [ ] No 409 or `letter_point_responses_unique` error appears in console during letter re-open or navigation
- [ ] First-time submit flow still works end-to-end (Disagree/Unsure/Agree each write a row, phase advances)
- [ ] `letter_point_responses` unique constraint remains intact (no schema change)
- [ ] Canary test passes: `e2e/p768-reproduce.spec.ts`
