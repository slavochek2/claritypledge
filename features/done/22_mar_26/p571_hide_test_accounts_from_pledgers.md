---
status: all-done
type: task
rank: 1000023.0
workstream: foundation
created_date: 2026-03-22
flow: dev
delivery_stage: uat
uat_file: features/uat/p571.md
test_files:
  - e2e/integration/p571-is-test-account-migration.spec.ts
tags: []
---

# P571: Hide test accounts from public pledgers page

## Problem

Test accounts (e2e-agent@claritypledge.com, founder's personal account) appear on the public /pledgers page alongside real users, undermining credibility.

## Solution

Add `is_test_account` boolean column (default `false`) to `profiles` table. Set `true` for known test accounts. Filter with `.eq('is_test_account', false)` in `getVerifiedProfiles()`.

## Technical Notes

- Migration: add column `is_test_account boolean default false`, UPDATE for known test emails
- Query change: `src/app/data/api.ts` → `getVerifiedProfiles()` — add `.eq('is_test_account', false)`
- Test accounts to flag: `e2e-agent@claritypledge.com`, `founder's personal account`

## Acceptance Criteria

- [x] `is_test_account` column exists on `profiles` with default `false`
- [x] Known test accounts have `is_test_account = true`
- [x] `/pledgers` page does not show test accounts
- [x] Test accounts can still log in and use the app normally

## Testing

- Verify /pledgers page no longer shows E2E Agent or Slava's test profile
- Verify test accounts still function for E2E tests and manual testing

---

## Technical Analysis

### Current Code State

`getVerifiedProfiles()` at `src/app/data/api.ts:278` chains `.eq('is_verified', true).eq('has_pledged', true)` before `.order()`. Adding `.eq('is_test_account', false)` extends this pattern directly.

`getVerifiedProfileCount()` at `src/app/data/api.ts:250` uses the same filter pattern — must also add the `is_test_account` filter to keep count consistent with the listing.

`DbProfile` at `src/app/types/index.ts:87` is the snake_case DB row type. `Profile` is the camelCase app type. `is_test_account` is internal — belongs on `DbProfile` only, not surfaced to `Profile`.

### Related Patterns

- `has_pledged` column (P50) — precedent for a boolean profile flag controlling listing inclusion without touching RLS.
- `20260223_p414_profile_bio.sql` — `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS` with no index.

---

## Architecture Decisions

### Decision: DB column + query filter, not RLS policy

**Chosen:** `is_test_account boolean NOT NULL DEFAULT false` on `profiles`, filtered in `getVerifiedProfiles()` and `getVerifiedProfileCount()`.

**Rationale:** Test accounts must authenticate and use the app fully (E2E tests, manual QA). An RLS policy hiding rows would break those flows. The filter is a display concern, not access control.

**Trade-off:** Future query paths listing profiles must add the filter. Acceptable — only two public listing functions exist.

**Alternative rejected:** Soft-delete or deactivation of test accounts. Breaks E2E test suite.

---

## Security Review

**RLS Policies:**
- ✅ SELECT policy is `USING (true)` — `is_test_account` readable by anyone. Acceptable (not sensitive).
- ⚠️ UPDATE policy is `USING (auth.uid() = id)` — a test account user could self-clear the flag via direct REST API call. **Fix:** Add `WITH CHECK` constraint preventing `is_test_account` value changes: `WITH CHECK (auth.uid() = id AND is_test_account = (SELECT is_test_account FROM profiles WHERE id = auth.uid()))`.

**Authentication:**
- ✅ `updateProfile()` TypeScript interface does not include `is_test_account` — no app-layer write path exists.
- ⚠️ Direct Supabase REST PATCH could bypass app layer. The `WITH CHECK` constraint above closes this.

**Input Validation:**
- ✅ No user input involved. Column set by migration only.

**Data Protection:**
- ⚠️ `founder's personal account` must NOT appear in public migration SQL (public GitHub repo). Use Supabase dashboard or a separate admin script for that account. Only `e2e-agent@claritypledge.com` in the committed migration.

---

## Implementation Approach

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260322120000_p571_is_test_account.sql` | Add column, flag e2e-agent, add WITH CHECK on UPDATE policy |

### Files to Modify

| File | Change |
|------|--------|
| `src/app/types/index.ts` | Add `is_test_account?: boolean` to `DbProfile` |
| `src/app/data/api.ts` | Add `.eq('is_test_account', false)` to `getVerifiedProfiles()`, `getVerifiedProfileCount()`, AND `getFeaturedProfiles()` |

### Migration SQL

```sql
-- P571: Hide test accounts from public pledgers page
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

-- Flag known test account (founder's personal account flagged via dashboard — not in public SQL)
UPDATE profiles SET is_test_account = true
  WHERE email = 'e2e-agent@claritypledge.com';

-- Prevent users from self-clearing the test account flag via direct REST
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_test_account = (SELECT is_test_account FROM profiles WHERE id = auth.uid()));
```

### Build Sequence

1. Create migration file and run `./scripts/migrate.sh` (test DB)
2. Flag `founder's personal account` via Supabase dashboard (not in migration)
3. Add `is_test_account?: boolean` to `DbProfile` in `src/app/types/index.ts`
4. Add `.eq('is_test_account', false)` to `getVerifiedProfiles()`, `getVerifiedProfileCount()`, AND `getFeaturedProfiles()` in `src/app/data/api.ts`
5. Run `./scripts/pre-commit-checks.sh`
6. Run `./scripts/migrate.sh --env prod`
7. Flag `founder's personal account` via prod Supabase dashboard
8. Verify `/pledgers` on prod: test accounts absent, real pledgers present

---

## Test Coverage Strategy

**Files generated:**
- `e2e/integration/p571-is-test-account-migration.spec.ts` (4 tests)
- `features/uat/p571.md` (5 scenarios)

**What's Tested:**
- ✅ Column existence (integration) — catches P160-class bugs where migration not applied
- ✅ Default value (integration) — new profiles default to `false`
- ✅ RLS WITH CHECK (integration) — test accounts can't self-clear the flag
- ✅ Query filter (integration) — test accounts excluded from verified profiles query
- ✅ End-to-end visual verification (UAT) — manual check on /pledgers page
- ✅ Real user unaffected (UAT) — normal profile updates still work

**What's NOT Tested (rationale):**
- ❌ Unit tests — no new utility functions or business logic
- ❌ E2E browser tests — the visual outcome (card not shown) is best verified by UAT; the query filter is verified by integration test
- ❌ Accessibility tests — no UI change (cards are removed, not modified)
- ❌ Smoke test — no new route or page

**Test Pyramid:**
```
  /\
 /  \  0 E2E
/____\
/ 4 INT \
```

Total: 4 automated tests + 5 UAT scenarios
