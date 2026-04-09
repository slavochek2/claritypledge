---
title: "Position history trigger blocked by RLS — positions don't persist"
type: bug
status: qa
priority: critical
created_date: 2026-04-09
p_number: P677
delivery_stage: ship
pipeline_ran: [fix, ship]
tags: []
rank: 1000000.0
date_resolved: "2026-04-09"
root_cause: "log_position_change() lost SECURITY DEFINER on test DB; Apr 3 security migration set point_position_history INSERT policy to WITH CHECK (false) blocking all inserts including the trigger"
resolution: "Re-created trigger function with SECURITY DEFINER + SET search_path; changed INSERT policy from WITH CHECK (false) to WITH CHECK (auth.uid() = user_id)"
---

# P677: Position history trigger blocked by RLS — positions don't persist

## Bug Description

**Reported:** 2026-04-09
**Severity:** Critical (setting a position always fails with "Failed to save position")

**Symptoms:**
- Setting a position shows "Failed to save position" error toast
- Position is not persisted — refresh shows no position taken
- `point_positions` INSERT succeeds RLS, but the `log_position_change()` trigger tries to INSERT into `point_position_history` and gets blocked
- Entire transaction rolls back → 403

**Two compounding bugs:**

| # | Bug | Evidence |
|---|-----|---------|
| 1 | `log_position_change()` lost `SECURITY DEFINER` on live DB | `prosecdef = false` despite migration DDL having `SECURITY DEFINER` |
| 2 | `point_position_history` INSERT policy `WITH CHECK (false)` | Apr 3 migration — blocks ALL inserts including trigger |

Either bug alone causes this. Together they guarantee failure.

**Note:** Application-layer fix (throw on DB error, surface toasts) was already applied in commit `2da5d8ed` and is correct. This fix addresses the DB layer.

## Root Cause

1. `SECURITY DEFINER` was stripped from `log_position_change()` (likely by a db push resetting function attributes)
2. The Apr 3 security migration set `WITH CHECK (false)` on `point_position_history` INSERT policy — too aggressive, blocks trigger

## Fix

New migration: two SQL statements
1. Re-create `log_position_change()` with `SECURITY DEFINER` + `SET search_path = public`
2. Replace `WITH CHECK (false)` with `WITH CHECK (auth.uid() = user_id)` on insert policy

Belt-and-suspenders: both fixes so either alone is sufficient if one regresses.

## Acceptance Criteria

- [ ] Migration applies cleanly on test DB
- [ ] `SELECT prosecdef FROM pg_proc WHERE proname = 'log_position_change'` → `true`
- [ ] `SELECT * FROM pg_policies WHERE tablename = 'point_position_history' AND cmd = 'INSERT'` → `WITH CHECK (auth.uid() = user_id)`
- [ ] Set position on localhost → refresh → position persists (no error toast)

## Files Changed

- `supabase/migrations/20260409120000_fix_position_history_trigger.sql` (new)
