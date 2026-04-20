---
status: all-done
type: bug
rank: 1000761.0
severity: high
workstream: letter
date_reported: '2026-04-20'
created_date: '2026-04-20'
completed_at: '2026-04-20'
tags: [letter, submit, duplicate-key, re-submit]
pipeline_ran: [create-bug, reproduce, fix, ship]
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

## Invariants

Persist across future layers — architectural constraints future fixes must respect:

1. **`letter_point_responses` is an immutable append-only audit log.** First write per `(delivery_id, point_id)` wins. The DB UNIQUE constraint is authoritative; no schema change is acceptable.
2. **Any UI phase that offers a "record your position" action for a point MUST first verify no prior response exists for that `(delivery_id, point_id)` pair.** `point-engage` is such a phase. This check runs BEFORE initial phase/state is computed — never via a post-mount `useEffect` (flash of wrong UI).
3. **Both authenticated and anon-token reading paths share the same UI state machine.** A rehydration fix MUST cover both. Anon-token submit is server-safe (RPC uses `ON CONFLICT DO NOTHING`), but the UX of re-engaging an already-answered point is still wrong on that path.
4. **Point-position rehydration is scoped to `letter_point_responses`.** Story rating / story phase rehydration is a separate concern — do not expand scope into it within this fix.

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

Track 1 (immutable) — locked by product decision.

### 1. Add a fetcher in `letters-service.ts`

```ts
// Add near the existing reads at :510 / :1048
export async function getLetterPointResponses(
  deliveryId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('letter_point_responses')
    .select('point_id, position')
    .eq('delivery_id', deliveryId);
  if (error) {
    logDbError('getLetterPointResponses', error);
    return {};          // fail-open: worst case → unchanged (buggy) behavior, not crash
  }
  return Object.fromEntries((data ?? []).map((r) => [r.point_id, r.position]));
}
```

Same shape for the anon-token path — add a companion `getLetterPointResponsesByToken(token)` that wraps the equivalent RPC or a filtered select that RLS permits. If no anon-safe read exists yet, a SECURITY DEFINER RPC is the right pattern (mirrors `submit_point_response_by_token`).

### 2. Fetch in the parent page, pass as a hook param

In `src/app/pages/letter-reading-page.tsx` near line 1003, before mounting `useLetterReadingState`, fetch existing responses alongside the existing `getLetterForReading(ByToken)` call. Await both (Promise.all) so the hook mounts with full state on the first render — no flash of wrong UI (Invariant 2).

Add a new param to `UseLetterReadingStateParams`:

```ts
priorPositions?: Record<string, string>;   // pointId → position
```

Do the same for the local-mode call at :1143 (preview / public reading) — pass `{}` or omit; preview mode must not rehydrate from DB (see Invariant 4 / preview-mode note at hook:316).

### 3. Seed the hook's initial state from `priorPositions`

In `useLetterReadingState` (~line 289, the `useState` initializer), after computing `freshState`:

- For each `snapshot` in `snapshots`, check which of its visible `point_id`s are present in `priorPositions`.
- Populate `state.stories[i].positions[pointId] = priorPositions[pointId]` for those.
- **Advance past already-answered points:** set `state.stories[i].currentPointIndex` to the index of the first unanswered visible point. If all visible points are answered → `currentPointIndex = visibleCount - 1` (stays on last point, but phase must NOT be `point-engage`).
- **Initial phase selection:** if the point at `currentPointIndex` is answered, phase = `point-revealed`. Otherwise use existing `initialPhase(snapshot)` logic. **Do not** attempt to infer `story-rate` / `story-revealed` — that depends on story ratings (out of scope, Invariant 4).

Keep `sessionStorage` and `savedStoryIndex` resume paths intact — they already handle "resume where you left off" for mid-session cases. DB rehydration is the cross-session / cross-device authority.

### 4. Do NOT change the service layer

`submitPointResponse` (service:370) stays a plain `.insert()`. The 409 is a correct defensive guard (Invariant 1). After the rehydration fix, the UI never calls it twice for the same `(delivery_id, point_id)`.

### 5. Optional polish (out of scope for this fix)

- Toast on unexpected `submitPointResponse` throw so future schema failures aren't silent.
- Story-rating rehydration.

If /fix agent notices either is trivial while working, file a separate bug — do not expand this fix.

## Non-Goals

- Changing `submitPointResponse` (service layer stays untouched; 409 remains as defensive guard)
- Any schema change to `letter_point_responses` or its UNIQUE constraint
- Rehydrating story ratings or reconstructing `story-rate` / `story-revealed` phases from DB
- Adding a user-facing toast on submit errors (punt to separate spec if wanted)
- Touching `submit_point_response_by_token` RPC (already server-safe)

## Acceptance Criteria

- [x] Re-opening a letter with an existing `letter_point_responses` row for a point does NOT render the `point-engage` Submit button for that point (canary assertion)
- [x] For already-answered points, the receiver sees their prior position on mount (phase is `point-revealed` on first render — no flicker through `point-engage`)
- [x] Advancing to the first unanswered point on re-open lands the receiver directly on `point-engage` for that point (not the already-answered one)
- [x] No 409 or `letter_point_responses_unique` error appears in console during letter re-open, navigation, or submit
- [x] First-time submit flow still works end-to-end (Disagree/Unsure/Agree each write a row, phase advances via existing `submitPointPosition` code path — no regression in `e2e/p581-*.spec.ts`)
- [x] Both authenticated (`/letter/:id` no token) and anon-token (`/letter/:id?token=...`) re-open flows get rehydration
- [x] `letter_point_responses` UNIQUE constraint untouched; service layer untouched
- [x] Canary passes: `e2e/p768-reproduce.spec.ts`

## Verification Commands

```bash
# Canary must pass (currently fails)
npx playwright test e2e/p768-reproduce.spec.ts

# Regression guard — existing letter reading tests
npx playwright test e2e/p581-letter-reading.spec.ts
npx playwright test e2e/p665-letter-immersive.spec.ts

# Type + lint + build
./scripts/pre-commit-checks.sh
```
