# E2E Testing Guide

Complete guide for writing and running E2E tests for authenticated flows in Clarity Pledge.

---

## Overview

E2E tests in this project use Playwright to test the full stack — from browser interactions to database state changes. All tests use real auth sessions and database interactions via Supabase.

**Key principles:**
- Tests use real Supabase auth (not mocked)
- Tests create real database records (using service_role key)
- Tests clean up after themselves (delete test data in afterEach)
- Tests run sequentially (workers: 1 in playwright.config.ts)
- Tests use password-based auth (more reliable than magic links)

---

## Prerequisites

**Before running E2E tests:**

1. **Apply RLS migration** (required for test data creation):
   ```bash
   supabase db push
   ```
   This applies `20260214_e2e_test_rls_complete_fix.sql` which adds service_role bypass policies.

2. **Verify environment variables** (in `.env.test.local`):
   ```bash
   VITE_SUPABASE_URL=<your-local-supabase-url>
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```

3. **Start dev server** (Playwright auto-starts it, but manual start is faster):
   ```bash
   npm run dev
   ```

4. **Run tests:**
   ```bash
   # All E2E tests
   npm run test:e2e

   # Specific test file
   npm run test:e2e -- e2e/point-position-persistence.spec.ts

   # Debug mode (headed browser)
   npm run test:e2e -- --headed
   ```

---

## Test Helpers

All test helpers live in `e2e/helpers/` and use the Supabase Admin API (service_role key) to bypass RLS.

### User Helpers (`test-user.ts`)

**Create test user:**
```typescript
import { createTestUser, type TestUser } from './helpers/test-user';

const testUser = await createTestUser({ name: 'Alice Tester' });
// Returns: { user, email, slug, name }
```

**Set auth session in browser:**
```typescript
import { setTestSession } from './helpers/test-user';

await setTestSession(page, testUser.email);
// User is now logged in (session stored in localStorage)
```

**Clean up test user:**
```typescript
import { deleteTestUser } from './helpers/test-user';

await deleteTestUser(testUser.user.id);
// Deletes auth user, profile, and related data
```

**IMPORTANT:** Always delete test users in `afterEach` to avoid database pollution.

---

### Point Helpers (`test-point.ts`)

**Create test point:**
```typescript
import { createTestPoint, type TestPoint } from './helpers/test-point';

const testPoint = await createTestPoint(testUser.user.id, {
  statement: 'Remote work increases productivity',
  context: 'Testing position persistence',
});
// Returns: { id, statement, firstValidatorId }
```

**Create test position:**
```typescript
import { createTestPosition } from './helpers/test-point';

await createTestPosition(testPoint.id, testUser.user.id, 'agree');
// User now has "agree" position on the point
```

**Clean up test point:**
```typescript
import { deleteTestPoint } from './helpers/test-point';

await deleteTestPoint(testPoint.id);
// Deletes point, positions, and history (CASCADE)
```

**IMPORTANT:** Delete points BEFORE deleting users (to avoid FK constraint violations).

---

### Event Helpers (`test-event.ts`)

**Create test event:**
```typescript
import { createTestEvent, type TestEvent } from './helpers/test-event';

const testEvent = await createTestEvent(hostUser.user.id, new Date(), {
  title: 'Test Event',
  description: 'Testing waiting room',
});
// Returns: { id, slug, hostId, title }
```

**RSVP to event:**
```typescript
import { rsvpToEvent } from './helpers/test-event';

await rsvpToEvent(testEvent.id, testUser.user.id);
// User is now RSVP'd to the event
```

**Get sub-room:**
```typescript
import { getSubRoom } from './helpers/test-event';

const subRoom = await getSubRoom(testEvent.id, initiatorUser.user.id);
// Returns: { id, eventId, initiatorId, targetId, status }
```

**Clean up test event:**
```typescript
import { deleteTestEvent } from './helpers/test-event';

await deleteTestEvent(testEvent.id);
// Deletes event, RSVPs, and sub-rooms (CASCADE)
```

---

### Story Helpers (`test-story.ts`)

**Create test story:**
```typescript
import { createTestStory, type TestStory } from './helpers/test-story';

const testStory = await createTestStory(authorUser.user.id, {
  title: 'Test Story',
  summary: 'Testing story functionality',
});
// Returns: { id, slug, authorId, title }
```

**Link story to point:**
```typescript
import { linkStoryToPoint } from './helpers/test-story';

await linkStoryToPoint(testStory.id, testPoint.id);
// Story is now linked to the point
```

**Clean up test story:**
```typescript
import { deleteTestStory } from './helpers/test-story';

await deleteTestStory(testStory.id);
// Deletes story, versions, and point links (CASCADE)
```

---

## Writing E2E Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('Feature Name', () => {
  let testUser: TestUser;
  let testPoint: TestPoint;

  test.beforeEach(async () => {
    // Create test data
    testUser = await createTestUser({ name: 'Test User' });
    testPoint = await createTestPoint(testUser.user.id);
  });

  test.afterEach(async () => {
    // Clean up test data (ORDER MATTERS!)
    if (testPoint?.id) {
      await deleteTestPoint(testPoint.id); // Delete points BEFORE users
    }
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('should do something', async ({ page }) => {
    // Set up auth session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Navigate to page
    await page.goto('/some-page');

    // Interact with UI
    const button = page.getByRole('button', { name: /click me/i });
    await button.click();

    // Verify result
    await expect(page.getByText('Success!')).toBeVisible();
  });
});
```

---

### Cleanup Order (CRITICAL!)

**Always delete in dependency order:**

```typescript
test.afterEach(async () => {
  // 1. Delete events FIRST (if they reference users as hosts)
  if (testEvent?.id) {
    await deleteTestEvent(testEvent.id);
  }

  // 2. Delete points (if they reference users as validators)
  if (testPoint?.id) {
    await deleteTestPoint(testPoint.id);
  }

  // 3. Delete stories (if they reference users as authors)
  if (testStory?.id) {
    await deleteTestStory(testStory.id);
  }

  // 4. Delete users LAST (they're referenced by many tables)
  if (testUser?.user?.id) {
    await deleteTestUser(testUser.user.id);
  }
});
```

**Why this order matters:**
- Deleting a user triggers CASCADE deletes on points (via `first_validator_id` FK)
- CASCADE delete on points triggers position history logging
- If point is already gone, history trigger fails with FK violation
- **Solution:** Delete points explicitly BEFORE deleting users

---

### Multi-User Tests

**Example: Testing two users interacting:**

```typescript
test('User A and User B can interact', async ({ browser }) => {
  // Create two browser contexts (separate sessions)
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // Set up sessions
    await setTestSession(pageA, userA.email);
    await setTestSession(pageB, userB.email);

    // User A does something
    await pageA.goto('/some-page');
    await pageA.getByRole('button', { name: /action/i }).click();

    // User B sees the result
    await pageB.goto('/some-page');
    await expect(pageB.getByText('Result from A')).toBeVisible();

  } finally {
    // Clean up contexts
    await contextA.close();
    await contextB.close();
  }
});
```

---

## Debugging E2E Tests

### Console Logs

**Capture browser console output:**

```typescript
test('should log errors', async ({ page }) => {
  // Capture console logs
  page.on('console', msg => console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`));

  // Capture page errors
  page.on('pageerror', error => console.error(`[BROWSER ERROR]`, error));

  // ... rest of test
});
```

---

### Database State Verification

**Check database state during tests:**

```typescript
import { supabaseAdmin } from '../src/lib/supabase-admin';

test('should save position to database', async ({ page }) => {
  // ... UI interaction ...

  // Verify in database
  const { data: position, error } = await supabaseAdmin
    .from('point_positions')
    .select('*')
    .eq('point_id', testPoint.id)
    .eq('user_id', testUser.user.id)
    .single();

  console.log('[DEBUG] Position in DB:', position, error);

  expect(position).toBeTruthy();
  expect(position.position).toBe('agree');
});
```

---

### Timeouts

**Increase timeout for slow operations:**

```typescript
test('slow operation', async ({ page }) => {
  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Wait for specific element (with custom timeout)
  await expect(page.getByText('Loaded!')).toBeVisible({ timeout: 10000 });

  // Manual timeout (use sparingly)
  await page.waitForTimeout(2000); // Wait 2 seconds
});
```

**WARNING:** Avoid `waitForTimeout()` when possible — use explicit waits instead (e.g., `waitForLoadState`, `waitForSelector`).

---

## Troubleshooting

### RLS Errors

**Symptom:** Tests fail with "new row violates row-level security policy"

**Cause:** RLS bypass policies not applied

**Fix:**
```bash
supabase db push
```

Apply `20260214_e2e_test_rls_complete_fix.sql` migration.

---

### FK Constraint Violations

**Symptom:** Tests fail with "violates foreign key constraint" during cleanup

**Cause:** Deleting users before deleting points (CASCADE race condition)

**Fix:**
- Delete points BEFORE deleting users in `afterEach`
- Use helpers (they handle correct order automatically)

**Example:**
```typescript
test.afterEach(async () => {
  // CORRECT ORDER:
  if (testPoint?.id) {
    await deleteTestPoint(testPoint.id); // Points first
  }
  if (testUser?.user?.id) {
    await deleteTestUser(testUser.user.id); // Users last
  }
});
```

---

### Auth Failures

**Symptom:** Tests fail with "User not authenticated"

**Cause:** Session not set before navigating

**Fix:**
```typescript
// CORRECT:
await setTestSession(page, testUser.email);
await page.waitForLoadState('networkidle'); // Wait for session to load
await page.goto('/profile');

// WRONG:
await page.goto('/profile');
await setTestSession(page, testUser.email); // Too late!
```

---

### Flaky Tests

**Symptom:** Tests pass sometimes, fail other times

**Common causes:**
1. **Race conditions:** Use explicit waits (`waitForLoadState`, `waitForSelector`)
2. **Stale data:** Clean up test data properly in `afterEach`
3. **Parallel execution:** Tests run sequentially (workers: 1), so this shouldn't happen
4. **Network delays:** Use longer timeouts for network-dependent operations

**Fix:**
```typescript
// Add explicit waits
await page.waitForLoadState('networkidle');
await expect(element).toBeVisible({ timeout: 5000 });

// Verify cleanup
test.afterEach(async () => {
  console.log('[CLEANUP] Deleting test data...');
  // ... cleanup code ...
  console.log('[CLEANUP] Done');
});
```

---

## Security Notes

### Service Role Key

**The service_role key has full database access.** It must NEVER appear in client-side code.

**Safe locations:**
- `.env.test.local` (gitignored)
- `e2e/helpers/*` (test helpers only)
- `src/lib/supabase-admin.ts` (server-side only)

**Unsafe locations:**
- `src/app/*` (client-side code)
- `src/components/*` (client-side code)
- Any file imported by client code

**Pre-commit hook:**
```bash
# In scripts/pre-commit-checks.sh:
if grep -r "SUPABASE_SERVICE_ROLE_KEY" src/; then
  echo "ERROR: Service role key found in app code (src/)"
  exit 1
fi
```

---

### RLS Bypass Policies

**All service_role bypass policies use proper role checking:**

```sql
CREATE POLICY "Test data: service_role bypass for profiles"
  ON public.profiles FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');
```

**This ensures:**
- Only service_role key can bypass RLS (not anon key)
- If service_role key leaks to client, policies still block escalation
- Production users hit normal RLS policies (auth.uid() checks)

---

## References

- **Test files:** `e2e/*.spec.ts`
- **Test helpers:** `e2e/helpers/*.ts`
- **Playwright config:** `playwright.config.ts`
- **RLS migration:** `supabase/migrations/20260214_e2e_test_rls_complete_fix.sql`
- **Supabase admin:** `src/lib/supabase-admin.ts`

---

## Next Steps

**After tests pass:**
1. Mark feature as done (update spec: `status: done`)
2. Run `/design-audit` if UI was modified
3. Run `/kdd` to capture knowledge in docs

**Before committing:**
```bash
./scripts/pre-commit-checks.sh  # Verify linting, types, and no service_role key in src/
```

---

## Pattern: Agent Self-Verification

**The goal of E2E tests is to enable agents to verify their own work.**

**Old workflow (broken):**
```
1. Agent writes feature
2. Agent marks "implementation complete ✅"
3. User tests manually → finds bugs
4. Repeat 20+ times
```

**New workflow (with E2E tests):**
```
1. Agent writes E2E test (acceptance criteria)
2. Agent implements feature
3. Agent runs E2E test
4. Test fails → agent sees error → agent fixes → run again
5. Test passes → agent marks "done"
6. User verifies once (spot check)
```

**Critical rule for agents:**
> "Feature is NOT done until E2E test passes. Run test, see failure, fix, repeat."

---

**Run /kdd after:** Capture pattern: "E2E test infrastructure enables agent autonomy" in decisions.md
