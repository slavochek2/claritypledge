---
status: all-done
type: bug
rank: 271
workstream: foundation
severity: high
date_reported: 2026-02-17T00:00:00.000Z
tags:
  - p160
  - migration
  - schema-cache
  - is_private
  - clarity_sessions
created_date: 2026-02-18T00:00:00.000Z
---

# BUG P271: P160 — `is_private` column missing from schema cache on `/live`

## Symptom

Navigating to `localhost:5001/live` (or production `/live`) throws:

```
Could not find the 'is_private' column of 'clarity_sessions' in the schema cache
```

The page renders but session creation fails. The "Record for AI Insights" toggle is visible but creating a new session crashes.

## Root Cause

Two-layer failure from P160 (Private Session Mode):

1. **Migration not applied to production** — `supabase/migrations/20260217_p160_is_private_session.sql` exists in the repo but was never run against the production (or local) database. The code references `is_private` in `createClaritySession()`, but the column doesn't exist.

2. **No integration test caught it** — All 44 automated tests for P160 mocked the database. Not one test called `createClaritySession()` with a real DB connection. The UAT scorecard had 3 DB schema scenarios that would have caught this, but was never executed before closing P160.

## Fix

### Option A: Migration wasn't run at all
```bash
supabase db push
```
Apply `20260217_p160_is_private_session.sql` to the target database.

### Option B: Migration ran but schema cache is stale
Go to Supabase Dashboard → Database → Reload schema cache (PostgREST reload).
Or: restart the Supabase local stack:
```bash
supabase stop && supabase start
```

### Verify fix
After applying, navigate to `/live` — the error should be gone and "New session" should work.

## Acceptance Criteria

- [ ] `/live` page loads without console errors
- [ ] "New session" creates a session successfully
- [ ] `is_private` column visible in `clarity_sessions` table in Supabase dashboard
- [ ] Toggle defaults to ON (recorded) and persists when switched OFF

## Related

- P160: `features/done/5_feb_26/p160_private_session_mode.md`
- P270: `features/p270_integration-test-coverage-for-db-migrations.md` (systemic fix)
- Migration: `supabase/migrations/20260217_p160_is_private_session.sql`
