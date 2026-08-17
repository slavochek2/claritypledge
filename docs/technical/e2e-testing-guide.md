# E2E Testing Guide

Complete guide for writing and running E2E tests for authenticated flows in Clarity Pledge.

---

## Prod Verification

A persistent test account (`e2e-agent@claritypledge.com`) exists on prod for agent-driven verification. This enables Playwright-based prod testing without manual browser interaction.

```bash
VERIFY_PROD=1 PROD_SERVICE_ROLE_KEY="<srk>" npx playwright test e2e/verify-prod-agreements.spec.ts
```

**Pattern:** Sign in as `e2e-agent` via password → inject session into Playwright BrowserContext → navigate `claritypledge.com` → interact → verify DB state → cleanup test data.

**Template:** `e2e/verify-prod-agreements.spec.ts` — copy this pattern for new prod verification tests.

**Guard:** Tests are skipped by default. Set `VERIFY_PROD=1` to enable. Always clean up test data in the test itself.

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

All test helpers live in `e2e/helpers/`. User creation uses the Admin API to create the auth user, then signs in with the user's own JWT to create the profile (satisfies `auth.uid() = id` RLS policy). Avoid service_role bypass for profile creation — PostgREST's `SET LOCAL ROLE` doesn't set the `current_setting('role')` GUC, making those policies unreliable.

### Critical: Never call `signInWithPassword` on `supabaseAdmin`

`supabaseAdmin` is a **module-level singleton**. Calling `supabaseAdmin.auth.signInWithPassword()` mutates its in-memory session to the user's JWT — **all subsequent calls on `supabaseAdmin` then run as that user**, not as service_role. This breaks any helper that runs after it (e.g., `createTestStory` with `visibility: 'private'` fails RLS).

**The pattern for user sign-in inside helpers:**
```typescript
// ❌ WRONG — corrupts supabaseAdmin's session for all subsequent helpers
const { data } = await supabaseAdmin.auth.signInWithPassword({ email, password });

// ✅ CORRECT — use a short-lived temp client from the anon key
const tempSignInClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: signInData } = await tempSignInClient.auth.signInWithPassword({ email, password });
// Then create a userClient with the session token for the actual RLS-gated insert
const userClient = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
```

`supabaseAdmin.auth.signOut()` was thought to restore service_role mode but doesn't reliably do so — the client may fall back to anonymous mode. Use `tempSignInClient` instead.

### Parallel-worker slug uniqueness

When `fullyParallel: true`, multiple Playwright workers may run `beforeAll` at the same millisecond. `generateTestSlug` uses both `Date.now()` **and** a 4-digit random suffix to prevent `profiles_slug_unique` constraint violations:

**Singleton DB state needs a serial suite (P878):** when a suite mutates a row that must be unique DB-wide (e.g. the single `is_admin = true` profile, enforced by a partial unique index), `fullyParallel` runs `beforeAll`/`afterAll` once **per worker** — two workers park/restore the same singleton concurrently and can leave it wrong for everyone (observed: the real admin flag wiped). Pattern: `test.describe.configure({ mode: 'serial' })` inside that describe, plus park-the-existing-value in `beforeAll` and restore in `afterAll`. See `e2e/integration/p878-search-profiles-migration.spec.ts` (admin override suite).

**A deliberately-unscoped shared table (no owner column) needs scoped cleanup and floor assertions, not table wipes and exact counts (P1083):** `npm run test:e2e` (`package.json`) runs the `chromium` and `integration` Playwright projects in the same default invocation, and they run **concurrently** — there is no cross-project serial primitive. A table-wide `delete().not('id', 'is', null)` in one file's `beforeEach`/`afterEach` races any other file (in either project) that reads or writes the same table at the same moment; an exact-count assertion (`toHaveCount(N)`) races the same way even without a wipe, since a sibling test's own insert can land mid-window. This is the identical failure family as the P878 singleton case above, just at the shared-table (not shared-row) scale, and it is not limited to two projects — the same race exists between any two files in the *same* project too, since `fullyParallel` doesn't serialize across files either.

Pattern: (1) track and delete only the ids a test itself created, in a **per-test-local** array via `try/finally` — never a shared module-level array plus a generic `afterEach` (that reintroduces the same race once tests in one file run in parallel: one test's cleanup can delete another still-running test's not-yet-used row); (2) assert floors (`toBeGreaterThanOrEqual`), not exact counts, against a table other tests can also be touching; (3) if a floor still isn't enough (a sibling test's own add-then-remove cycle can net-decrease the count mid-window), keep `test.describe.configure({ mode: 'serial' })` for that one file — floor checks tolerate concurrent *additions* from elsewhere, not a full add/remove cycle happening inside your own measurement window. See `e2e/p1083-ready-distribution.spec.ts` and `e2e/integration/p1083-db-schema.spec.ts` (the latter uses id-containment checks instead of counts entirely, which sidesteps the problem rather than mitigating it — prefer that shape when the assertion doesn't actually need a total).

**Never follow a wait with a non-retrying DOM read (P1083):** Playwright's dev webServer runs `npm run dev` (`playwright.config.ts`), so `React.StrictMode` (`src/main.tsx`) is live in every e2e run — a mount effect can fire its data-fetch twice, with the app's own `cancelled`-style guard discarding the first result. "Wait for the relevant network response, then call `.count()`/`.textContent()` once" can resolve on the *discarded* first response and read the DOM before the real state update lands — StrictMode just turns a probabilistic race into a deterministic failure; the same read-after-wait pattern is unsound even without it, since `waitForResponse` resolves before React's re-render commits. Use `expect.poll()` or a web-first auto-retrying assertion (`toBeVisible`, `toHaveCount` with an exact target) instead of any one-shot locator read after a wait.

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

**Auth rate limit & session cache (P893):** Supabase's auth token endpoint is rate-limited per IP. `setTestSession` therefore caches sessions per worker process (keyed by email) — one `signInWithPassword` per user per worker instead of per test — and retries with backoff on rate-limit errors only. Without the cache, multi-file parallel batches fail `beforeAll` hooks with "Request rate limit reached" and whole suites show as "did not run". Nothing to do in new tests — call `setTestSession` per test as usual; the cache is internal. Don't add per-test sign-in loops of your own.

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
// NOTE: story_points.author_id NOT NULL — linkStoryToPoint looks up stories.author_id automatically (P465)
```

> **Profile page tab gotcha (P465):** The profile page defaults to the "Stories" tab. Tests targeting point cards on the "Points" tab must click the tab explicitly before asserting on point card content:
> ```typescript
> await page.getByRole('tab', { name: /points/i }).click();
> await page.waitForLoadState('networkidle');
> // Now safe to assert on point card content
> ```

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

### Test Independence Within a describe Block

In a parallel-mode `describe` block, each `test()` must be self-sufficient given only `beforeAll`/`beforeEach` state. Never write a `test()` that reads a variable mutated by a sibling `test()` — Playwright retries, `--grep` filtering, and shard splits all break ordering assumptions silently.

**Wrong (ordering dependency):**
```typescript
let letterId: string;

test('creates letter', async () => {
  letterId = (await createLetter()).id; // sets shared var
});

test('letter appears in inbox', async () => {
  // fails on isolated retry — letterId is undefined
  expect(inbox).toContain(letterId);
});
```

**Correct: move shared setup into `beforeAll`:**
```typescript
let letterId: string;

test.beforeAll(async () => {
  letterId = (await createLetter()).id;
});

test('letter appears in inbox', async () => {
  expect(inbox).toContain(letterId); // always defined
});
```

**Exception:** `test.describe.configure({ mode: 'serial' })` explicitly allows ordered mutation between tests — use it when setup-verify-teardown must share state across steps.

---

### Testing Conditional Rendering

When testing components with conditional UI (ternaries, if/else blocks), write tests for **both branches** to catch duplicate elements and ensure each path renders correctly.

**Common bug pattern:** Adding conditional logic without removing pre-existing unconditional elements, causing duplicates in one branch.

#### Anti-pattern: Only testing one branch

```typescript
// Only tests the event flow - misses duplicates in non-event flow
test('event waiting room shows partner name', async ({ page }) => {
  await page.goto('/live?returnTo=/events/test&partner=Alice');
  await expect(page.getByText('Waiting for Alice')).toBeVisible();
});
```

#### Good pattern: Test both branches

```typescript
test.describe('waiting room conditional messaging', () => {
  test('event flow shows partner name', async ({ page }) => {
    await page.goto('/live?returnTo=/events/test&partner=Alice');
    await expect(page.getByText('Waiting for Alice')).toBeVisible();
    // Verify no duplicate text
    await expect(page.getByText('Or show them this QR code')).toHaveCount(1);
  });

  test('non-event flow shows generic message', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('Invite Your Partner')).toBeVisible();
    // Also verify no duplicate text
    await expect(page.getByText('Or show them this QR code')).toHaveCount(1);
  });
});
```

#### When to write conditional tests

**Write separate tests when:**
- Different text/elements appear in each branch
- Different user flows are triggered
- Feature behavior changes based on context (event vs non-event, logged in vs out, etc.)

**Don't write separate tests when:**
- Same UI renders in both branches (testing implementation detail, not user-visible behavior)
- Only internal state differs (CSS classes, data attributes that don't affect what user sees)

#### Checklist when adding conditional rendering

Before committing conditional UI changes:

- [ ] Remove any pre-existing unconditional elements that now belong inside the conditional
- [ ] Write one E2E test per visible outcome (not per code path)
- [ ] Verify no duplicate elements appear in either branch using `.toHaveCount(1)`
- [ ] Test the "else" branch - it's easy to forget when focused on the new feature path

---

### Auth Context Helper (`auth-context.ts`) — P496

**Preferred pattern for authenticated E2E tests.** Returns a Playwright `BrowserContext` with Supabase auth pre-injected — no page navigation or `setTestSession` needed.

```typescript
import { test, expect } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';

test('authenticated user can access /live', async ({ browser }) => {
  const { context, user, cleanup } = await getTestAuthContext('host', browser);
  const page = await context.newPage();

  try {
    await page.goto('/live');
    await expect(page).toHaveURL('/live'); // Not redirected to /signup
  } finally {
    await cleanup(); // Deletes test user + closes context
  }
});
```

**Roles:**
- `'host'` — verified user (`is_verified: true`). Can access /live, /agreements, /stories.
- `'guest'` — authenticated but not verified. Triggers verification gates.

**How it works:** Creates a temporary user via Admin API → signs in with password → injects the Supabase session into `BrowserContext.addInitScript` (localStorage key `sb-{ref}-auth-token`). RLS is exercised realistically (user JWT, not service_role).

**When to use which:**
- `getTestAuthContext()` — tests that need a full authenticated browser (page navigation, visual assertions)
- `setTestSession()` — tests that already have a page and just need to inject auth
- `createTestUser()` — tests that only need DB-level user setup (no browser)
- `createAuthClientForUser(email)` — tests that need to call a Supabase RPC as a specific authenticated user (non-browser). See `e2e/p523-point-creation-responses.spec.ts` lines 401–416 for the full implementation (signs in with `test-password-12345`, returns a client with the JWT set in headers).

**Keep `accepted_terms_version` in sync with `CURRENT_TERMS_VERSION`.**
`createTestUser()` sets `accepted_terms_version` on the test profile so the "Updated Terms" modal is skipped in E2E tests. This value is hardcoded in `e2e/helpers/test-user.ts` — when `CURRENT_TERMS_VERSION` in `src/lib/constants.ts` is bumped, the test helper must be updated to match, or every authenticated test will see a blocking terms modal. Symptom: test navigates to a page after `setTestSession()` but all assertions fail because the terms modal covers the content.

**Never use admin-generated magic links to simulate auth in PKCE mode.**
`supabaseAdmin.auth.admin.generateLink({ type: 'magiclink' })` generates a token tied to a different PKCE challenge than the one the browser stored from any prior `signInWithOtp` call. Navigating to the admin link results in "Link Expired or Invalid" — the code exchange fails because `code_verifier` doesn't match.

Use `setTestSession()` instead. It uses password-based auth (no PKCE), injects the session directly into localStorage, and works reliably across all confirm/callback flows.

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

### Playwright Browser Binary Missing

**Symptom:** All tests fail with `Error: browserType.launch: Executable doesn't exist at .../chromium_headless_shell-XXXX/...`

**Cause:** Playwright updated its required browser build number; the local cache doesn't have it yet.

**Fix:**
```bash
npx playwright install chromium
```

Safe to re-run — idempotent. This is now automated via `postinstall` in `package.json` — running `npm install` will install/update the binary automatically.

---

### RLS Errors

**Symptom:** Tests fail with "new row violates row-level security policy"

**Cause:** RLS bypass policies not applied

**Fix:**
```bash
supabase db push
```

Apply `20260214_e2e_test_rls_complete_fix.sql` migration.

---

### Slug Collision (profiles_slug_unique)

**Symptom:** Intermittent test failure — `duplicate key value violates unique constraint "profiles_slug_unique"`

**Cause:** `generateTestSlug` used `Date.now()` alone. Playwright workers creating multiple users with the same `name` option within the same millisecond produce identical slugs.

**Fix (already applied):** `generateTestSlug` now appends `Math.floor(Math.random() * 10000)` — same pattern as `generateTestEmail`. If you see this again, check whether a new helper function generates slugs without the random suffix.

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

### Orphaned e2e-test profiles causing beforeAll timeout (P699)

**Symptom:** `beforeAll` takes 30s+ and times out. Tests were passing previously. No schema changes.

**Cause:** Failed previous runs left orphaned `e2e-test-*@gmail.com` profiles in the test DB. The `profiles_slug_unique` constraint or trigger overhead on thousands of orphaned rows can cause insert/delete operations in `beforeAll` to time out.

**Diagnosis:** Run via Supabase Management API:
```sql
SELECT COUNT(*) FROM auth.users WHERE email LIKE 'e2e-test-%@gmail.com';
```
If count is in the hundreds or thousands — orphaned data is the cause.

**Fix:** Clean up via Management API (sandbox cannot reach test DB REST directly):
```sql
DO $$
BEGIN
  SET session_replication_role = replica;
  DELETE FROM auth.users WHERE email LIKE 'e2e-test-%@gmail.com';
  SET session_replication_role = DEFAULT;
END$$;
```
`session_replication_role = replica` bypasses triggers that block cascaded deletes.

**Prevention:** Ensure `afterAll` in every spec file deletes created `auth.users` rows — not just `profiles` rows. The trigger cascade only runs top-down from `auth.users`.

---

### Unique Constraint on letter_deliveries (P651)

**Symptom:** `beforeAll` silently fails — insert returns null, all tests in the describe block fail with "Auth delivery creation failed" or similar.

**Cause:** `idx_letter_deliveries_unique_email` enforces `UNIQUE(letter_id, receiver_email)`. Creating multiple deliveries for the same letter with the same email violates this.

**Fix:** Use a separate test user (distinct email) for each delivery on the same letter. Don't reuse `receiver.email` for both anonymous and authenticated test paths.

---

### Compose Page Auto-Skips Receiver Modal for Public Docs

**Symptom:** Tests timeout looking for "Specific people" or other receiver modal UI on `/letter/:docId/compose`.

**Cause:** `letter-compose-page.tsx` auto-detects public docs and skips the modal, jumping directly to the prediction walk phase.

**Fix:** Use `visibility: 'private'` in test doc setup if the test needs to interact with the receiver modal.

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
2. Run `/finish` if UI was modified
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

---

## Tests Must Create Their Own Auth — Never Rely on the Ambient storageState

`playwright.config.ts` loads `.private/test-auth/local.json` into every context when it exists.
That file is **gitignored and produced by a manual headed login** (`npm run test:save-auth`), so it
is absent in CI by construction and absent on any machine where nobody ran the step. A test that
depends on it can only pass on one laptop, within the token's lifetime.

Use `createTestUser()` + `setTestSession(page, email)` per spec instead — the decision to prefer
this over a shared `globalSetup`/`storageState` is [decisions.md](../decisions.md) 2026-04-19.

The failure is silent and misleading: with no session the auth gate redirects to signup, so
assertions fail against the *wrong page* rather than reporting an auth problem. P1043 found
`e2e/a11y/p160-accessibility.spec.ts` failing 12/13 this way — the h1 assertion read
`Create Account` instead of `Clarity Session`, which looks like stale copy and is not.

The storageState file remains legitimate for **manual visual QA** (`/verify`, screenshot work) —
just never as a precondition for an automated spec.

---

## Negative RLS Tests — Pair the Cases, Don't Trust the Error Code

A "role X cannot do Y" test that asserts only `expect(error).not.toBeNull()` proves nothing as soon
as the policy has more than one condition — the insert may be rejected by a completely different
term than the one the test claims to cover, and it stays green either way.

**Rule:** construct two cases that differ in *exactly* the term under test, and satisfy every other
condition on both paths. For a policy of the form `author_id = auth.uid() AND EXISTS (caller owns
the parent row)`, both the positive and negative case supply the caller's own `author_id`, so
ownership is the only variable:

```typescript
// positive: owner + own author_id -> succeeds
await ownerClient.from('story_points').insert({ story_id, point_id, author_id: ownerId });
// negative: non-owner + own author_id -> 42501, and ownership is the ONLY difference
await otherClient.from('story_points').insert({ story_id, point_id, author_id: otherId });
```

**Two traps this avoids:**

1. **Omitting a required column.** The row then fails for a constraint reason before the predicate
   under test is reached. A test written this way can never pass in the positive case and passes
   for the wrong reason in the negative case.
2. **Reading the SQLSTATE as proof.** When RLS is active, a `WITH CHECK` violation preempts column
   constraints — a missing NOT NULL column surfaces as `42501` (permission), not `23502`
   (not-null). So the code alone cannot tell you which conjunct fired. A `supabaseAdmin` probe run
   with RLS bypassed reports a *different* code than the application actually sees; don't design
   the assertion around it.

Prefer this to dropping the policy as a negative control — the test DB is shared with concurrent
sessions, and a dropped policy is a live hole for its duration.

Worked example: `e2e/integration/p425-stories-rls.spec.ts`. Rationale:
[decisions.md](../decisions.md) 2026-08-11 [technical].

---

## Integration Tests (P270 — DB Migration Layer)

**Location:** `e2e/integration/*.spec.ts`

**Purpose:** Verify database migrations were applied and new columns/tables are accessible. Catches the class of bug where code references a column that doesn't exist in the schema cache.

**When required:** Any feature that adds a migration file (`supabase/migrations/*.sql`) MUST have an integration test. This is mandatory — not optional.

**Two-Client Pattern (mandatory):**

```typescript
// 1. Schema check — uses supabaseAdmin (bypasses RLS, proves column EXISTS)
const { error } = await supabaseAdmin
  .from('your_table')
  .select('your_new_column')
  .limit(1);
expect(error).toBeNull(); // Fails immediately if migration wasn't applied

// 2. RLS check — uses user-scoped JWT (proves users can actually READ/WRITE)
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${userToken}` } }
});
const { error: rls } = await userClient.from('your_table').insert({ your_new_column: value });
expect(rls).toBeNull(); // Fails if RLS blocks user access
```

**Why two clients:**
- `supabaseAdmin` (service_role) bypasses all RLS — proves the column exists but not that users can access it
- User-scoped client (anon key + JWT) respects RLS — proves the policy is correct

**Template:** `e2e/integration/migration-template.spec.ts`

**File naming:** `e2e/integration/p{N}-{feature}-migration.spec.ts`

**Root cause this prevents:** P160 — `is_private` column referenced in code but migration not applied to production. 44 automated tests all mocked the DB; none caught the missing column.

**Note:** `e2e/integration/migration-template.spec.ts` is intentionally skipped (`test.describe.skip`) — it's a copy-paste template with placeholder `example_column`. Copy it and rename for each new migration.

**NOT NULL additions and test helper sync:** When a migration adds a NOT NULL column to any table that `e2e/helpers/` inserts into, update the relevant helpers in the same commit as the migration — the integration test will surface the missing column at insert time, but the fix must land together, not as a follow-up. If the column can be derived from related data, centralize the lookup in the helper rather than pushing the column to every callsite. See `e2e/helpers/test-story.ts` `linkStoryToPoint` for the pattern (P465).

**Always check errors after every insert in `beforeAll`:** Supabase client inserts never throw — a missing NOT NULL column produces a silent failure (insert returns null, error object is ignored). Every `.insert()` in a `beforeAll` block must destructure `{ error }` and throw on it:
```typescript
const { error: snapshotError } = await supabaseAdmin.from('letter_story_snapshots').insert({ ... });
if (snapshotError) throw new Error(`Snapshot creation failed: ${snapshotError.message}`);
```
Without this, all tests in the describe block fail with misleading "undefined" errors that trace back to data that was never created. This was the root cause of the P714 integration test false positives (all valid positions returning false because the snapshot row was never inserted).

---

## Known Pre-Existing Failures

As of the test suite analysis (P276–P278), 79 tests fail — all pre-existing, not regressions. Categories:

### 1. Two-Party Live Session Tests (~30 tests)

**Files:** `speak-freely-button.spec.ts`, `partner-left-meeting.spec.ts`, `new-meeting-after-partner-left.spec.ts`, `live-meeting-mic-permission.spec.ts`

**Root cause:** `browser.newContext()` creates isolated browser environments with separate WebSocket connections. Supabase Realtime subscriptions live inside each context — so context B's DB writes never trigger context A's Realtime listener. The DB IS updated correctly, but the Realtime event never arrives.

**Symptom:** Tests hang for the full 30s timeout waiting for the other party to appear.

**Remediation plan:** P276 — replace Realtime-dependent UI waits with `waitForDBPresence()` helper that polls `supabaseAdmin` directly from the Node.js test runner (bypasses browser context isolation entirely).

**Do not:** Delete or skip these tests — they cover real user flows.

### 2. Mic Permission Headless (~6 tests)

**Files:** `live-page-layout.spec.ts`, parts of `p160-private-session.spec.ts`

**Root cause:** Headless Chromium blocks `getUserMedia()` without the `--use-fake-ui-for-media-stream` flag. Tests that hit the mic permission dialog hang until timeout.

**Remediation plan:** P278 — add `launchOptions.args: ['--use-fake-ui-for-media-stream']` to playwright.config.ts chromium project.

### 3. Flaky (~2–4 tests)

**Files:** `manual-points.spec.ts` (2 tests), `pledgers-page.spec.ts`, `story-detail-page-loads.spec.ts`

**Root cause:** Race conditions — `waitForLoadState('networkidle')` doesn't wait for React state updates; some tests rely on async auto-focus. Remediation: anchor to specific element visibility before asserting.

**Remediation plan:** P278.

### Suite Health Baseline

- **118 passing** / **79 failing** / **2 flaky** / **14 skipped** — 43 min total (workers: 1)
- All 79 failures are in the categories above
- Profile tests (p151, p152, p152-smoke): 19/19 pass

---

## Two-Party /live Session Tests

### How cross-context delivery works in Playwright

ClarityPledge uses Supabase `postgres_changes` (DB-level, WAL-based) for Realtime subscriptions. These **DO propagate** between Playwright's isolated browser contexts — each context opens its own independent WebSocket to Supabase, and both receive DB change events. Context isolation is browser state (cookies, localStorage), not network.

The app also runs 1-second drift polling as a fallback. Between Realtime and drift polling, state written by one context reliably reaches the other without `page.reload()`.

> **Note:** Supabase `presence` and `broadcast` are connection-scoped and would NOT propagate. But ClarityPledge does not use those for state sync.

### Session fixtures

**`createTwoPartySession(browser, options?)`** — standard setup. Both users pre-inserted in DB, both pages navigate simultaneously. Includes auth guard (fails fast if redirected to Google OAuth) and terms dialog dismissal. Use when subscription timing isn't under test.

**`createTwoPartySessionRealistic(browser, options?)`** — realistic join flow. Host-only session created in DB, host navigates first, guest joins later. Exercises real subscription establishment timing and `hasJoinerRef` guard path. Use for tests that verify delivery timing or late-join behavior.

Both return `TwoPartySession` with `host.page`, `guest.page`, `sessionCode`, `cleanup()`.

**URL-param / precondition parity rule:** Before treating a canary as green, confirm the fixture construction includes the same URL params, session fields, and auth state as the real user flow for the feature under test. A fixture that omits `?returnTo=` when the real flow always carries it will produce a false green — the code branches are different. If the real flow and the test fixture diverge on any input that affects code paths, parametrize the fixture or create a second fixture. Document the divergence with an inline comment. Reference: `e2e/p779-reproduce.spec.ts` uses `createLetterSessionFixture` (not `createTwoPartySessionRealistic`) because letter-sourced sessions always carry `returnTo`.

```typescript
import { createTwoPartySession } from './helpers/test-session';

test('two users in a live session', async ({ browser }) => {
  const session = await createTwoPartySession(browser, {
    hostName: 'Alice',
    guestName: 'Bob',
  });

  try {
    // Both pages are authenticated, navigated, terms dismissed
    await expect(session.host.page.getByText('Speak')).toBeVisible();
  } finally {
    await session.cleanup();
  }
});
```

### Asserting cross-context state delivery

**Primary pattern — `waitForUIUpdate()`:**

```typescript
import { waitForUIUpdate } from './helpers/test-realtime';

// Wait for the guest's page to show a UI change caused by the host's action.
// No page.reload(). If state doesn't arrive via Realtime + drift polling, the test fails.
await waitForUIUpdate(
  guest.page,
  guest.page.getByText('understand you'),
  20000, // must exceed drift polling interval (1s)
);
```

### State advancement (skip multi-step flows)

When a test needs to reach a specific session state without clicking through the full UI flow:

```typescript
import { advanceSessionState, postRoundIdleState, checkerSubmittedState } from './helpers/test-realtime';

// Skip an entire round — 1 DB write, then wait for UI update (no reload)
await advanceSessionState(session.sessionCode, postRoundIdleState());
await waitForUIUpdate(host.page, host.page.getByText('Speak'), 20000);

// Skip to "checker submitted, waiting for responder"
await advanceSessionState(session.sessionCode, checkerSubmittedState('Alice', 7));
await waitForUIUpdate(guest.page, guest.page.getByText('understand you'), 20000);
```

#### Settle-wait guard before `advanceSessionState`

**Always wait for both pages to show session UI before calling `advanceSessionState()`.** If the DB write lands before the guest's component tree is initialized, the Realtime event triggers a state update against an un-mounted tree — crashing the guest page into a React error boundary.

```typescript
// ✅ REQUIRED: settle both pages before advancing state
const { host, guest, sessionCode: code } = session;

await expect(
  host.page.locator(`text=/${code}|Speak|Waiting|End Session/i`).first()
).toBeVisible({ timeout: 10_000 });
await expect(
  guest.page.locator(`text=/${code}|Speak|Waiting|End Session/i`).first()
).toBeVisible({ timeout: 10_000 });

// THEN advance state — both pages are ready
await advanceSessionState(code, postRoundIdleState());
await waitForUIUpdate(host.page, host.page.getByText('Speak'), 20_000);
```

This pattern is identical to the guard in `e2e/p666-two-party-infra-proof.spec.ts`. Use that file as the canonical reference. Skipping the guard produces a React error boundary crash at SETUP, not an assertion failure — the test gives no signal about the bug under test.

**Available presets:**
- `speakerInitiatedState(name)` — after speaker clicks Speak
- `postRoundIdleState()` — after full round, back to idle
- `checkerSubmittedState(name, rating)` — mid-round, waiting for responder

**Custom overrides:** Pass any `Record<string, unknown>` to `advanceSessionState()` to set arbitrary `live_state` fields. The helper does read-modify-write, so it's safe to call multiple times.

### DB polling helpers (synchronization, not delivery)

The DB polling helpers (`waitForDBPresence`, `waitForDBStateKey`, `waitForDBColumnSet`) are useful for **test synchronization** — confirming a DB write landed before asserting UI. They run in Node.js (Playwright's runner) and are not affected by browser context isolation.

**Durability between two-party clicks (P891):** `live_state` updates are last-write-wins. In multi-step two-party flows, confirm each phase write is durable (`waitForDBStateKey` after the click) BEFORE the partner's next click — otherwise a stale write from the other client silently reverts the phase and the test stalls at an earlier screen (symptom: failure screenshot shows a screen "before" the step that just succeeded). See `e2e/p562-free-mode.spec.ts` `reachUnlockedViaExplainBack` for the canonical shape.

**Don't poll for ephemeral state the app races to clear (P912):** If the app's normal happy path writes value S and then immediately overwrites or clears it, polling for S will flake — especially under parallel-suite CPU load, which widens the gap between two concurrent writes and makes the "skipped-both-true" interleaving more likely. Instead, assert the **durable post-transition state**: `ratingPhase === 'idle'`, buttons not visible, `currentRound` incremented. If the intermediate value is mechanistically important (e.g., verifying a JSONB key persisted before a partner's reset), poll for it with `waitForLiveStateKey` BEFORE the next click that clears it — not simultaneously with a second field that the reset also clears. The canonical example: `celebrationAcknowledgedByCreator` is testable between the creator's click and the joiner's click; `celebrationAcknowledgedByCreator === true AND ...Joiner === true` simultaneously is not (under sequential resolution the app resets both atomically, skipping the both-true window entirely).

```typescript
import { waitForDBPresence } from './helpers/test-realtime';

// Wait for joiner to appear in DB, then assert UI
await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode);
await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
```

### Banned: `page.reload()` for state sync

**Never use `page.reload()` to synchronize state between two browser contexts.**

`page.reload()` fetches the entire session from DB, bypassing both Realtime delivery AND drift detection. Tests pass, but the feature may be broken for real users.

**Incident (P617):** `ratingInitiatedBy` was missing from drift detection's field list. All Playwright tests passed because `page.reload()` loaded the field directly from DB, skipping both broken delivery paths. The bug was only caught during manual UAT after 5 implementation sessions.

```typescript
// ❌ BANNED — masks delivery bugs:
await advanceSessionState(code, { ratingInitiatedBy: 'Alice' });
await guest.page.reload();
await expect(guest.page.locator('[class*="opacity-50"]')).toBeVisible();

// ✅ CORRECT — catches delivery bugs:
await advanceSessionState(code, { ratingInitiatedBy: 'Alice' });
await waitForUIUpdate(guest.page, guest.page.locator('[class*="opacity-50"]'), 20000);
```

### Drift detection completeness

A unit test at `src/tests/drift-detection-completeness.test.ts` verifies that drift polling checks all UI-affecting fields from `LiveSessionState`. When a new field is added to the type but not to drift detection, the test fails — preventing silent delivery gaps.

### Seeding the ActiveSessionBanner (P888 pattern)

To test the banner (or rejoin prompts) on any non-`/live` page, two things must exist — the hook validates localStorage against the DB:

1. **A real session row** — `createTestSessionInDB(hostProfileId, guestName)` from `e2e/helpers/test-session.ts` (DB-only fixture, returns `cleanup()`).
2. **The restored-session pointer** — seed `cp_active_session` via `page.context().addInitScript` BEFORE navigating:

```typescript
await page.context().addInitScript(
  ({ code }) => {
    localStorage.setItem('cp_active_session', JSON.stringify({
      code,
      partnerName: 'Partner Name',
      role: 'creator',
      timestamp: new Date().toISOString(), // REQUIRED — shape validation rejects entries without it
    }));
  },
  { code: session.sessionCode }
);
```

**Gotchas:** the field is `timestamp` (ISO string) per `StoredActiveSession` — a stale `savedAt` field silently fails `getActiveSessionFromStorage` shape validation (banner never renders, no error). The stale name spread beyond comments: it was LIVE seed code in `e2e/p769-session-end-terminal-authority.spec.ts` (3 sites, 2 tests red on main) and `e2e/p511-session-resilience.spec.ts:351` — tracked as P899. Never copy the seed shape from a sibling test; grep the interface definition. `useActiveSession` calls `getActiveSessionByCode` on mount, so an ended/expired/missing DB session also keeps the banner hidden. Banner locator: `getByRole('status', { name: 'Active session notification' })`. Composes with `setTestSession` (both use `addInitScript`; order doesn't matter as long as both precede the `goto` under test). Working example: `e2e/p888-letter-results-nav.spec.ts` p888-7.

---

## Production Smoke Testing

A lightweight smoke test runs against the live production DB to verify core flows post-deploy.

```bash
node scripts/prod-smoke-test.mjs
```

**What it tests:** auth sign-in, profile read, story INSERT → SELECT → DELETE, public profile anon access.

**When to run:** after any deployment that touches stories, auth, or RLS policies.

**Test agent:** `test-agent@claritypledge.com` — a dedicated service account used only by this script.
Credentials are in `.env.local`. Details in `.private/docs/testing.md`.

The integration tests in `e2e/integration/` run against the **test** Supabase project.
The smoke test runs against **production**. They complement each other.

---

## AI Streaming Tests (P425+)

Tests that call the Gemini edge function have special setup requirements.

### Gating with VITE_STORY_GUIDE_EDGE_FN_URL

AI tests are skipped if the env var is not set:

```typescript
test.skip(
  !process.env.VITE_STORY_GUIDE_EDGE_FN_URL,
  'Skipping AI test — VITE_STORY_GUIDE_EDGE_FN_URL not set'
);
```

Add `VITE_STORY_GUIDE_EDGE_FN_URL` to **both**:
- `.env.test.local` — so Playwright reads it at startup
- `playwright.config.ts` `webServer.env` block — so Vite dev server gets it baked in

### Acknowledge the AI disclosure banner

The `/chat` page shows a one-time disclosure banner on first visit. It blocks the send button until acknowledged. Tests must dismiss it before sending:

```typescript
async function acknowledgeDisclosure(page: Page) {
  const ackBtn = page.getByRole('button', { name: 'Acknowledge' });
  if (await ackBtn.isVisible()) {
    await ackBtn.click();
  }
}
// Call after page.waitForLoadState('networkidle')
```

### Timeouts

AI streaming can take 10–30s per round-trip. Use:
- `{ timeout: 60000 }` on assertions that wait for AI responses
- Global test timeout: 90000ms (set in `playwright.config.ts`)
- Describe-level: `test.describe.configure({ timeout: 120000 })` for multi-turn loops

### Gemini model fragility

`gemini-2.0-flash` was deprecated and returns 404 for new users. Current model: `gemini-2.5-flash` (set in `supabase/functions/story-guide-chat/index.ts`). If tests start returning 404/500 from the edge function, check for a new deprecation first.

### Structured AI output detection

The frontend detects the polish phase by regex: `/^here'?s? (?:is )?the polished version/i`. The system prompt must explicitly instruct the AI to use this exact prefix — without it the AI invents its own phrasing and detection fails. Same pattern applies to any future state transitions that rely on parsing AI output.

### not.toBeVisible() on a missing element passes silently — always prove context first

`not.toBeVisible()` passes if the element doesn't exist at all. A locator that matches zero elements is a silent no-op, not a test failure. This is the vacuous-pass trap: your canary appears green before the fix is applied.

**Rule:** before any `not.toBeVisible()` or `not.toHaveText()` assertion, first assert that the surrounding container IS visible:

```typescript
// Wrong — if beliefRow doesn't exist yet, the next line silently passes
await expect(page.getByText('Pending...')).not.toBeVisible();

// Correct — prove the phase rendered, THEN assert the element is absent
await expect(page.getByText("P705 Sender's belief")).toBeVisible({ timeout: 10_000 });
await expect(page.getByText('Pending...')).not.toBeVisible();
```

**Secondary rule:** before writing any `getByText` locator, grep the component source for the exact rendered string. `"Pending"` and `"Pending..."` are different strings — `exact: true` requires the full element text to match.

```bash
grep -n "Pending" src/app/components/partners/live-mode-view.tsx
# → line 2375: Pending...
```

### Playwright strict mode with `or()` locators

`locator.or(otherLocator)` throws "strict mode violation" if both branches resolve to different elements simultaneously. Prefer `data-testid` over text-based fallbacks. Remove `or()` once `data-testid` is confirmed working.

### Strict mode — `getByText` on heading text that also appears in a label

`page.getByText('Save your responses')` matches both `<h3>Save your responses</h3>` AND a `<label>` whose full text contains the string as a substring (e.g., a consent label that says "...to save your responses"). Use `getByRole('heading', { name: 'Save your responses' })` to target the heading unambiguously.

**Rule:** for any text that could plausibly appear in both a heading and a label/paragraph, prefer `getByRole('heading', ...)` over `getByText(...)`.

### Form submit with disabled submit button — trigger via `page.evaluate()`

When `canSubmit` gates on field validity (e.g., `isValidEmail(email)`), the submit button is disabled for invalid inputs. Clicking it does nothing — even with `{ force: true }` the native `disabled` attribute prevents the form submit event. To test validation error messages:

```typescript
// Dispatch native submit event — React's onSubmit fires, validateFields() runs
await page.evaluate(() => {
  const form = document.querySelector('form');
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
```

React 17+ attaches listeners at the root element — native events bubble through and trigger React's `onSubmit` handler. `e.preventDefault()` in the handler still fires, so the page won't reload.

---

## Letter Reading Flow Patterns (P684+)

### FK setup for one-to-many letter tests

Three FK constraints that silently cause `beforeAll` failure if wrong values are passed:

| Field | Table | Constraint | Wrong pattern | Correct pattern |
|-------|-------|-----------|---------------|-----------------|
| `source_doc_id` | `clarity_letters` | `REFERENCES clarity_docs(id)` | `sender.user.id` | Insert into `clarity_docs`, use returned `id` |
| `version_id` | `letter_story_snapshots` | `REFERENCES story_versions(id)` | `story.id` | Query `story_versions` for `story_id`, use returned `id` |
| `version_id` | `story_verifications` | `REFERENCES story_versions(id)` | `story.id` | Same — query `story_versions` |

Also: `createTestStorySnapshot` defaults `point_config` to `{}`. `snapshotToStoryWithPoints` reads `point_config.storyTitle` and `point_config.storyText` to populate the story for display — if not passed, the rendered story has undefined title/text and `LiveStoryCardExpanded` shows nothing. Always pass `pointConfig`:

```typescript
await createTestStorySnapshot(letter.id, storyId, version.id, {
  position: 0,
  pointConfig: {
    storyTitle: 'My test story',
    storyText: 'The story body text that the reader will see.',
    points: [],
  },
});
```

### Navigating to the end-of-letter signup form

For 0-point stories, the reading flow is: `story-rate` → `story-revealed` → signup form. Tests that assert on the signup form must handle the `story-revealed` phase (shows `JourneyToUnderstanding` + "Continue" button) between submitting the rating and the form appearing:

```typescript
async function openLetterAndRate(page, letterId) {
  await page.goto(`/letter/${letterId}`);
  await page.waitForLoadState('networkidle');

  const openBtn = page.getByRole('button', { name: /open.*letter/i });
  if (await openBtn.isVisible({ timeout: 8000 })) {
    await openBtn.click();
    await page.waitForLoadState('networkidle');
  }

  // Rating drawer is a dialog (0-point story → immediately in story-rate phase)
  await expect(page.getByRole('dialog').filter({ hasText: 'Rate this story' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Rate 7' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();

  // story-revealed phase: JourneyToUnderstanding + "Continue" button
  const continueBtn = page.getByRole('button', { name: /^continue$/i });
  if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.click();
  }

  // Signup form heading (use getByRole to avoid strict mode violation)
  await expect(page.getByRole('heading', { name: 'Save your responses' })).toBeVisible({ timeout: 10000 });
}
```

**Why `ComprehensionRatingCard` requires two clicks:** clicking a rating button SELECTs it (highlights it) — `onSelect` is called only when the "Submit" button is clicked. Single-click assertions on a rating button check selection state, not submission.

### `LiveStoryCardExpanded` renders `story.content`, not `story.title`

Test assertions for visible story text must use `story.content`, not `story.title`. Asserting on the title will always miss — the title is not rendered inside `LiveStoryCardExpanded`.

---

## Kanban Server Testing (tools/kanban)

The kanban tool has its own test suite separate from the main app's Playwright E2E tests. It uses Vitest + supertest-style in-process server testing (no supertest package — raw `fetch` against a bound port).

### Pattern: export app, NODE_ENV guard

```typescript
// api.ts — key exports for test access
export { app };

// Guard to prevent listen() on import in tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Kanban API on ${PORT}`));
}
```

### Pattern: in-process server lifecycle

```typescript
let server: ReturnType<typeof app.listen>;
let API_BASE_URL: string;

beforeAll(async () => {
  server = app.listen(0); // port 0 = OS assigns free port
  const port = (server.address() as AddressInfo).port;
  API_BASE_URL = `http://localhost:${port}`;
});

afterAll(() => server.close());
```

This avoids `supertest` and lets tests use `fetch()` directly against a real HTTP server.

### Pattern: unique worktree paths per test (cache isolation)

The kanban server caches features by worktree path. Tests that need isolation should use a unique tmpdir per describe block:

```typescript
function useTestWorktree() {
  let wt: { path: string; branch: string };
  beforeEach(async () => {
    const tmpDir = join(tmpdir(), `kanban-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(tmpDir, 'features'), { recursive: true });
    wt = { path: tmpDir, branch: 'test' };
  });
  afterEach(async () => rm(wt.path, { recursive: true, force: true }));
  return { getWt: () => wt };
}
```

For milestone tests — fixtures must live in `docs/milestones/` (hardcoded in server) and need `?refresh=true` for cache busting:

```typescript
const res = await fetch(`${API_BASE_URL}/api/milestones?refresh=true`);
```

### Pattern: raw strings for path traversal security tests

`path.join()` normalizes `..` segments eagerly. Security tests must use raw string concatenation to preserve the attack vector:

```typescript
// WRONG — path.join normalizes the '..' away before it reaches the server
const evil = path.join(mainWt.path, 'features', '..', '.env.local');

// CORRECT — server's path.resolve() is the first thing that normalizes it
const evil = mainWt.path + '/features/../.env.local';
```

### Running kanban tests

```bash
cd tools/kanban
npm test               # Vitest unit + integration
npm run test:e2e       # Playwright (requires kanban server on port 9050)
```

### Kanban Playwright config

Separate `playwright.config.ts` in `tools/kanban/` targeting port 9050 with `reuseExistingServer: true`. The root `playwright.config.ts` (app, port 5000) and the kanban config are independent.

---

## Off-screen Elements Break Playwright Strict Mode

**Problem:** Components rendered off-screen for export (e.g. `position: absolute; left: -9999px`) stay in the DOM and are matched by `getByText()` or `getByRole()` locators — triggering "strict mode violation: resolved to 2 elements". P686: `ExportBadgeCertificate` was always rendered hidden for html2canvas access, creating a second "CLARITY BADGE" heading.

**Fix:** Lazy-render export components behind a state flag — only mount them when the export is actually triggered:
```tsx
{showExportComponent && <ExportBadgeCertificate ... />}
```

**Rule:** Never keep an off-screen/hidden element mounted full-time if it duplicates visible text or role selectors. Use conditional rendering or portals with `visibility: hidden` + `aria-hidden="true"` if the element must stay in the DOM.

---

## `data-*` Attributes for Stateful UI Indicators

**Problem:** CSS Tailwind ring classes and `class*=` selectors are fragile — a class rename breaks every test that targets it. P686: pledge ring was only identifiable via `class*="ring-"`, which didn't survive refactoring.

**Pattern:** Add `data-*` attributes to stateful UI indicators so tests can query them semantically:
```tsx
// In GravatarAvatar
<div {...(ringVisible ? { 'data-pledger': 'true' } : {})}>

// In BadgeCheckmark
<div aria-label={`Has Clarity Badge — ${count} of 9 points verified`}>
```

**Rule:** Any component that indicates user state (badge earned, pledge taken, verification level) must carry a `data-*` or `aria-label` attribute that tests can rely on. CSS class names are not test contracts.
