---
id: p417
title: "migrate.sh: silent schema drift when Management API returns HTTP 200 with error body"
status: done
completed_at: 2026-02-24
date_resolved: 2026-02-24
root_cause: apply_via_api() checked only HTTP status code; Supabase Management API returns HTTP 200 with JSON error object {message,code} when SQL fails — script recorded migration as applied without schema change executing
resolution: Added _check_api_success() that parses response body; JSON array = success, JSON object with message = SQL error even if HTTP 200; wired into apply_via_api() before recording in schema_migrations
type: bug
severity: critical
date_reported: 2026-02-24
---

# P417: migrate.sh Silent Schema Drift

## Bug Description

**Severity:** Critical — migrations appear applied but schema changes are absent from prod

**Symptoms:**
- `migrate.sh --env prod` reports migration as "already applied, skipping"
- Actual schema change (e.g. `ALTER TABLE ... ADD COLUMN`) was never executed
- Frontend crashes with `"column profiles.bio does not exist"` (Supabase error code 42703)
- Users see "Failed to save changes. Please try again." toast

**Root cause:**
`apply_via_api()` in `migrate.sh` checks only HTTP status code (200/201) to determine
success. The Supabase Management API can return HTTP 200 with an error body
(a JSON object with `message`/`code` fields) when a SQL statement fails.
The script treats this as success, records the version in `schema_migrations`,
and never re-applies the migration.

On the next run, the version is already in `schema_migrations` so it is
skipped — creating permanent, silent divergence between migration history
and actual DB schema.

**Reproduction:**
1. Supabase Management API returns HTTP 200 + `{"message": "...", "code": "..."}` for a failing SQL
2. `apply_via_api` sees HTTP 200 → marks migration as applied → inserts into `schema_migrations`
3. Column/index/constraint from that migration is absent from the DB
4. Next run: version already in history → "already applied, skipping" → never fixed

**Confirmed instance:**
- Migration: `20260223_p414_profile_bio.sql`
- Expected: `ALTER TABLE profiles ADD COLUMN bio TEXT CHECK (...)`
- Prod schema: column `profiles.bio` was absent (verified via REST API)
- History table: migration recorded as applied → subsequent runs skipped it
- Fix applied manually: ran ALTER TABLE directly via Management API → confirmed `[]` success response

## Fix

**Location:** `scripts/migrate.sh` — `apply_via_api()` function

**Change:** After receiving HTTP 200/201, parse the response body:
- Body is JSON array (`[]` or `[{...}]`) → genuine success
- Body is JSON object with `message` field → SQL error, treat as failure (do NOT record in history)

**Side-effect:** Also add detection inside the `"already exists"` branch — those
should still record in history (idempotent, effectively applied).

## Regression Test

`scripts/tests/test_migrate_api_response.sh` — tests the response-body
parsing logic with mocked curl responses covering:
- Success: `[]`
- Success: `[{"version":"20250101"}]`
- Error: `{"message":"syntax error","code":"42601"}`
- Error: `{"message":"column already exists","code":"42701"}` (the "already exists" path)
