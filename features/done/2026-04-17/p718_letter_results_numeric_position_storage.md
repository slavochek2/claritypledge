---
id: p718
title: "Letter results — recipient position not shown (stored as numeric string)"
type: bug
status: all-done
completed_at: 2026-04-17
severity: high
date_reported: 2026-04-16
pipeline_ran: [fix]
pipeline_plan: [fix, ship]
tags: []
rank: 1000723.0
created_date: 2026-04-16
---

# P718: Letter results — recipient position not shown (stored as numeric string)

## Bug Description

**Reported:** 2026-04-16
**Severity:** High — sender cannot see recipient's position on points in letter results

**Symptoms:**
- Recipient selects a position when completing a public letter
- Letter results page shows no position selected for that recipient
- `letter_point_responses.position` contains `"2"` (numeric string) instead of `"agree"` (PositionType label)
- Results page maps `r['position'] as PositionType` — `"2"` matches no button, so nothing highlights

**Root cause:**
`confirm-letter-response/index.ts` (edge function) converts position labels to numbers in
`letter-response-confirm-page.tsx` via `POSITION_VALUES` map (`"agree"` → `2`), then
`confirm-letter-response/index.ts:276` calls `String(p.position)` which stores `"2"` instead
of converting back to `"agree"`.

The `NUMERIC_TO_POSITION_TYPE` map already exists in the same file (used for `point_positions`
dual-write) but was not applied to the `letter_point_responses` insert.

**Reproduction steps:**
1. Open a public letter link as an unauthenticated recipient
2. Select a position on any point
3. Submit and create an account (sign-up flow via `requestLetterResponseSignin` + `confirmLetterResponse`)
4. Navigate to the results page
5. Expected: Your selected position highlighted on each point
6. Actual: No position highlighted; DB contains `position = "2"` instead of `"agree"`

**Confirmed in prod:**
- Delivery `70ea86b6` — `position: "2"` stored instead of `"agree"`

**Also affected:**
- `submitLetterResponseAuthenticated` (authenticated path) has identical `String(p.position)` pattern
  at `src/app/data/letters-service.ts` — needs same fix

---

## Acceptance Criteria

- [x] `confirm-letter-response/index.ts` stores `"agree"` not `"2"` in `letter_point_responses`
- [x] `submitLetterResponseAuthenticated` stores `"agree"` not `"2"` in `letter_point_responses`
- [x] Backfill migration converts existing numeric string rows to PositionType labels
- [x] Results page shows recipient's position after fix + backfill
- [x] Canary/integration test demonstrates the fix

---

## Files to Change

- `supabase/functions/confirm-letter-response/index.ts` — line 276: use `NUMERIC_TO_POSITION_TYPE.get()`
- `src/app/data/letters-service.ts` — `submitLetterResponseAuthenticated`: same fix
- `supabase/migrations/20260416XXXXXX_p718_backfill_letter_point_responses_position.sql` — backfill

---

## Resolution

**Fixed:** (pending)
**Root cause:** `confirm-letter-response` edge function called `String(p.position)` on an already-numeric
value, storing `"2"` instead of `"agree"` in `letter_point_responses.position`.
**Resolution:** Use `NUMERIC_TO_POSITION_TYPE.get(p.position)` at storage time. Backfill corrects
existing corrupt rows in both test and prod.
