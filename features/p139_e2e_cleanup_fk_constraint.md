---
status: in-progress
prepped_date: null
reviews:
  ux: null
  architect: null
  alignment: null
rank: 62500
type: task
---

# P139: E2E Test Cleanup Fails - FK Constraint on point_position_history

## Problem Definition

E2E tests for position persistence fail during cleanup phase when attempting to delete test users. The deletion fails with a database FK constraint error, leaving orphaned test data in the database.

**Error:**
```
AuthApiError: Database error deleting user
  at deleteTestUser (e2e/helpers/test-user.ts:286:32)
```

**Impact:**
- E2E tests report as "failed" even when all functional assertions pass
- Orphaned test users and data accumulate in test database
- CI/CD pipeline shows false failures
- Developers waste time investigating "broken" tests that actually work

**Scope:**
- Affects: `point-position-persistence.spec.ts` (all 5 tests)
- Also affects: Any E2E test that creates positions and tries to clean up users
- Test database only (not production)

---

## Root Cause Analysis

### Database Schema
The `point_position_history` table has a foreign key to `auth.users`:

```sql
CREATE TABLE point_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id uuid NOT NULL REFERENCES points(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),  -- ❌ NO CASCADE DELETE
  position position_type,
  reasoning text,
  changed_at timestamptz DEFAULT now()
);
```

### Cascade of Events

1. **Test creates user** → User record in `auth.users`
2. **User takes position** → Trigger fires → Record inserted into `point_position_history`
3. **Test cleanup tries to delete user** → FK constraint blocks deletion
4. **Cleanup fails** → Test marked as failed

### Why It Wasn't Caught Earlier

- P137 added the INSERT policy fix which made positions actually save
- Before P137, positions never saved, so no history records were created
- No FK constraint violations occurred because the table stayed empty
- After P137, history records are created → cleanup now fails

### FK Constraint Details

**Current behavior:**
```sql
user_id uuid NOT NULL REFERENCES auth.users(id)
-- Implicit: ON DELETE NO ACTION (blocks deletion)
```

**PostgreSQL FK actions:**
- `NO ACTION` (default) - Blocks delete if child rows exist
- `RESTRICT` - Same as NO ACTION
- `CASCADE` - Deletes child rows automatically
- `SET NULL` - Sets FK to NULL (not applicable here, user_id is NOT NULL)
- `SET DEFAULT` - Sets FK to default value

---

## What We Did

### Investigation Steps

1. **Checked test logs:**
   ```
   [TEST HELPER] Failed to delete auth user: AuthApiError: Database error deleting user
   ```

2. **Verified functional assertions passed:**
   - Screenshot shows position badge visible: `- generic [ref=e72]: Disagrees`
   - Database write successful: `[DEBUG] setPosition result: true`
   - Position displayed on profile page correctly

3. **Identified FK constraint:**
   ```bash
   grep -r "point_position_history" supabase/migrations/
   # Found: user_id uuid NOT NULL REFERENCES auth.users(id)
   # No CASCADE specified
   ```

4. **Checked affected tests:**
   ```
   ✘ should persist position from point detail page to profile page
   ✘ should remove position when toggled off
   ✘ should maintain position counts after user takes position
   ✓ should allow position changes and persist updates (passed - no cleanup issue)
   ```

### Attempted Workarounds

❌ **Ignore cleanup errors** - Makes tests unreliable, accumulates garbage data
❌ **Manual DELETE before user deletion** - Complex, error-prone, requires service_role access
❌ **Disable trigger** - Breaks audit trail, not acceptable

---

## Proposal to Fix

### Option 1: Add CASCADE DELETE (Recommended) ⭐

**What:** Modify FK constraint to cascade deletes

**Migration:**
```sql
-- Drop existing constraint
ALTER TABLE point_position_history
  DROP CONSTRAINT IF EXISTS point_position_history_user_id_fkey;

-- Add CASCADE constraint
ALTER TABLE point_position_history
  ADD CONSTRAINT point_position_history_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
```

**Pros:**
- ✅ Clean, automatic cleanup
- ✅ PostgreSQL best practice for audit/history tables
- ✅ No code changes needed
- ✅ Works for all tests automatically

**Cons:**
- ⚠️ Production users deleted = history deleted (acceptable for audit table)
- ⚠️ Requires migration rollout

**Risk:** LOW - History is append-only, we never manually delete users in production

---

### Option 2: Manual Cleanup in Test Helper

**What:** Delete history records before deleting user

**Code:**
```typescript
export async function deleteTestUser(userId: string): Promise<void> {
  // Delete history first
  await supabaseAdmin
    .from('point_position_history')
    .delete()
    .eq('user_id', userId);

  // Then delete user
  await supabaseAdmin.auth.admin.deleteUser(userId);
}
```

**Pros:**
- ✅ No migration needed
- ✅ Explicit control over cleanup order

**Cons:**
- ❌ Requires maintenance (add to cleanup for every FK)
- ❌ Service role access needed
- ❌ Fragile (easy to forget)

---

### Option 3: Soft Delete Pattern

**What:** Mark users as deleted instead of deleting them

**Cons:**
- ❌ Major change to auth system
- ❌ Accumulates test data forever
- ❌ Not worth it for test cleanup

**Decision:** Rejected

---

## Recommended Solution

**Use Option 1: CASCADE DELETE**

### Implementation Plan

1. **Create migration:**
   - File: `supabase/migrations/20260209_cascade_delete_position_history.sql`
   - Drop constraint, re-add with CASCADE

2. **Apply to test DB:**
   - Run migration via Supabase SQL Editor

3. **Verify fix:**
   ```bash
   npm run test:e2e -- point-position-persistence.spec.ts
   # All tests should pass including cleanup
   ```

4. **Apply to production:**
   - Review migration with team
   - Apply during maintenance window
   - Verify no active deletions in progress

### Rollback Plan

If CASCADE causes issues:
```sql
ALTER TABLE point_position_history
  DROP CONSTRAINT point_position_history_user_id_fkey;

ALTER TABLE point_position_history
  ADD CONSTRAINT point_position_history_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id);
-- Reverts to NO ACTION (default)
```

---

## Acceptance Criteria

- [ ] Migration created: `20260209_cascade_delete_position_history.sql`
- [ ] Migration applied to test database
- [ ] E2E test `point-position-persistence.spec.ts` passes all 5 tests without cleanup errors
- [ ] Test user is deleted successfully (no AuthApiError)
- [ ] No orphaned records in `point_position_history` after test run
- [ ] Migration reviewed and ready for production deployment
- [ ] Documentation updated (if needed)

---

## Related Files

- `supabase/migrations/20260204_stories_points_calibration.sql` - Original table definition
- `supabase/migrations/20260209_fix_position_history_rls.sql` - INSERT policy fix (P137)
- `e2e/helpers/test-user.ts:286` - Where cleanup fails
- `e2e/point-position-persistence.spec.ts` - Affected tests

---

## Testing Strategy

### Before Fix
```bash
npm run test:e2e -- point-position-persistence.spec.ts
# Expected: Failures during cleanup
```

### After Fix
```bash
npm run test:e2e -- point-position-persistence.spec.ts
# Expected: All 5 tests pass completely

# Verify cleanup
psql "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM point_position_history WHERE user_id = '<test-user-id>';"
# Expected: 0 rows (cascade deleted)
```

---

## Priority Justification

**P2 (Medium)** because:
- ✅ Core functionality works (positions save/display correctly)
- ❌ Tests report false failures (developer friction)
- ❌ Orphaned data accumulates (database bloat)
- ✅ Simple fix available (low risk)
- ✅ Blocks CI/CD green status

Not P0 because: Production users unaffected, workaround exists (ignore cleanup errors)

Not P1 because: All functional assertions pass, only cleanup fails

---

## Notes

- This bug was discovered as a consequence of fixing P137
- Before P137, positions never saved → no history records → no FK violations
- After P137, history records are created → cleanup fails
- The fix (CASCADE DELETE) is PostgreSQL best practice for audit tables
- Alternative: Keep NO ACTION, manually delete history in cleanup (more code, more maintenance)

---

## Decision Log

**2026-02-09:** Bug identified during P137 E2E test verification
**2026-02-09:** Root cause confirmed as missing CASCADE on FK constraint
**2026-02-09:** Option 1 (CASCADE DELETE) selected as recommended solution
