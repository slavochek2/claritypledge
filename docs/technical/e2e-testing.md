# E2E Testing with Playwright

**Last Updated:** 2026-02-25
**Status:** Session injection solved via `addInitScript` (see P413). Auth tests now work. See patterns section below for current testing conventions.

---

## Quick Start

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Debug mode (step through tests)
npm run test:e2e:debug

# Headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npm run test:e2e e2e/01-signup-flow.spec.ts
```

### Test Files

- **[e2e/01-signup-flow.spec.ts](../../e2e/01-signup-flow.spec.ts)** - Signup form tests (7 tests: 5 passing, 2 skipped)
- **[e2e/02-auth-callback.spec.ts](../../e2e/02-auth-callback.spec.ts)** - Auth callback tests (4 tests: 2 passing, 2 skipped)
- **[e2e/03-login-flow.spec.ts](../../e2e/03-login-flow.spec.ts)** - Login flow tests (6 tests: 3 passing, 2 skipped, 1 failing)

### Configuration

- **Playwright config:** [playwright.config.ts](../../playwright.config.ts)
- **Test helpers:** [e2e/helpers/test-user.ts](../../e2e/helpers/test-user.ts)
- **Environment:** `.env.test.local` (gitignored)

---

## Executive Summary

We successfully built a comprehensive Playwright E2E test infrastructure with 17 tests covering the complete authentication flow. Of these, **10 tests are passing** and provide valuable regression protection for UI validation and error handling. **6 tests are skipped** due to a browser automation limitation where localStorage session injection doesn't trigger Supabase's `onAuthStateChange` event.

**Key Learning:** localStorage injection doesn't trigger Supabase auth state detection reliably in Playwright's browser context.

**Recommended Path:** Move magic link callback testing to integration tests with mocked Supabase, or try `supabase.auth.setSession()` API.

---

## What Works (10 Passing Tests)

These tests provide regression protection for:

### Signup Form (5 tests)
- Form displays correctly
- Empty form validation
- Form field validation
- Character count display
- Navigation links work

### Auth Callback Error Handling (2 tests)
- Graceful error handling
- Missing token handling

### Login Page (3 tests)
- Page displays correctly
- Non-existent email handling
- Navigation links work

**Value:** These tests WILL catch regressions in UI rendering, form validation, error handling, and navigation.

---

## Known Issue: Session Detection (6 Skipped Tests)

### The Problem

Tests that create a session via Admin API and inject it into localStorage timeout waiting for auth redirect. The page stays on `/` instead of redirecting to `/p/{slug}`.

**Affected Tests:**
- Signup with Admin API (2 tests) - Complete flow + duplicate handling
- Auth callback profile creation (2 tests) - New user + existing user
- Login with Admin API (2 tests) - Login existing user + re-login flow

### Test Pattern That Fails

```typescript
// 1. Create test user
testUser = await createTestUser({ name, email });

// 2. Sign in to get session tokens
const { data } = await supabaseAdmin.auth.signInWithPassword({
  email,
  password: TEST_PASSWORD,
});

// 3. Navigate to page
await page.goto('/');

// 4. Inject session into localStorage
await page.evaluate(({ access_token, refresh_token }) => {
  const session = { access_token, refresh_token, ... };
  localStorage.setItem('sb-...-auth-token', JSON.stringify(session));
}, { access_token, refresh_token });

// 5. Reload page
await page.reload();
await page.waitForLoadState('networkidle');

// 6. EXPECTED: Redirect to /p/{slug}
// 7. ACTUAL: Stays on / - TIMEOUT!
```

### Root Cause

After storing session in localStorage and reloading, Supabase's client library doesn't:
- Fire `onAuthStateChange` event
- Detect the session from localStorage
- Trigger auth state update in `useAuth` hook

The app's navigation logic depends on auth state, so without detection, no redirect happens.

**Why this happens:**

1. **Timing Issue:** Session injected AFTER page load, client already initialized
2. **No Re-initialization:** `page.reload()` creates new context, but client doesn't re-check localStorage
3. **Missing Trigger:** Manual localStorage injection doesn't fire `onAuthStateChange`
4. **Browser Context Isolation:** Playwright's context may handle localStorage differently

---

## Approaches We Tried (All Failed)

### Attempt 1: `admin.generateLink()` with URL Navigation

```typescript
const { data } = await supabaseAdmin.auth.admin.generateLink({
  type: 'magiclink',
  email,
});
await page.goto(`/auth/callback?token=${token}&type=magiclink`);
```

**Result:** ❌ Tokens expire too quickly (~60 seconds), unreliable

### Attempt 2: `signInWithPassword()` with localStorage Injection

```typescript
const { data } = await supabaseAdmin.auth.signInWithPassword({ email, password });
await page.evaluate(...); // Store tokens in localStorage
```

**Result:** ❌ Session stored correctly but not detected by Supabase client

### Attempt 3: Add `page.reload()` + `waitForLoadState()`

```typescript
await page.reload();
await page.waitForLoadState('networkidle');
```

**Result:** ❌ Still no auth state detection after reload

---

## Future Solutions

### Option 1: `supabase.auth.setSession()` API (Most Promising)

Instead of manual localStorage injection, use Supabase's official session setter:

```typescript
await page.evaluate(async ({ access_token, refresh_token }) => {
  const { supabase } = window; // Access global Supabase instance
  await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
}, { access_token, refresh_token });
```

**Pros:**
- Official API designed for this use case
- Should trigger `onAuthStateChange` event
- No reload needed

**Cons:**
- Requires exposing global `supabase` object (currently not exposed)
- Requires code changes to production app

**Estimated effort:** 1-2 hours
**Success probability:** High (70%)

### Option 2: Integration Tests for AuthCallbackPage (Recommended)

Move magic link testing to integration tests where we can mock Supabase:

```typescript
// src/tests/auth-callback-magic-link.test.tsx
test('should create profile after magic link token verification', async () => {
  // Mock Supabase verifyOtp to return success
  vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
    data: { user: mockUser, session: mockSession },
    error: null,
  });

  // Render AuthCallbackPage with token in URL
  render(<AuthCallbackPage />, {
    initialRoute: '/auth/callback?token=abc&type=magiclink',
  });

  // Verify profile creation API called
  await waitFor(() => {
    expect(mockCreateProfile).toHaveBeenCalledWith({
      name: mockUser.user_metadata.name,
      // ...
    });
  });

  // Verify redirect
  expect(mockNavigate).toHaveBeenCalledWith('/p/test-slug');
});
```

**Pros:**
- Full control over Supabase responses
- Can test edge cases (expired tokens, invalid tokens, etc.)
- Faster than E2E tests
- More reliable (no browser timing issues)
- Tests the actual magic link callback logic
- No production code changes required

**Cons:**
- Not true E2E (doesn't test browser behavior)
- Requires mocking infrastructure

**Estimated effort:** 3-4 hours
**Success probability:** Very High (95%)

---

## Test Infrastructure

### Configuration

**Parallel execution** (3 workers local, 2 CI) — safe because all test data is scoped by unique IDs:

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS) : process.env.CI ? 2 : 3,
  use: {
    baseURL: 'http://localhost:5001',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5001',
    reuseExistingServer: true,
  },
});
```

**Parallelization safety rule:** Tests are parallel-safe when all `supabaseAdmin.from()` calls are scoped by test-specific user IDs or slugs. Tests that query global state (e.g., "list all pledgers") must be marked serial:

```typescript
// e2e/pledgers-page.spec.ts
test.describe.configure({ mode: 'serial' });
```

### Test Helpers

Located in [e2e/helpers/test-user.ts](../../e2e/helpers/test-user.ts):

- **`generateTestEmail()`** - Creates unique test emails
- **`generateTestSlug()`** - Creates unique slugs
- **`createTestUser(options)`** - Creates user + profile via Admin API
- **`createMagicLinkToken(email)`** - Generates magic link tokens
- **`setTestSession(page, email)`** - Injects session (partially working)
- **`deleteTestUser(userId)`** - Cleanup by ID
- **`deleteTestUserByEmail(email)`** - Cleanup by email
- **`cleanupAllTestUsers()`** - Emergency cleanup

Located in [e2e/helpers/test-point.ts](../../e2e/helpers/test-point.ts):

- **`createTestPoint(firstValidatorId, options?)`** - Creates a point via service_role (no RLS restriction on points INSERT)
- **`createTestPosition(pointId, userId, position)`** - Creates/updates a position using the **user's own JWT** (not service_role)
- **`deleteTestPoint(pointId)`** - Deletes point and cascades to positions/history

**Why `createTestPosition` uses user JWT (not service_role):**

The `point_positions` INSERT policy requires `auth.uid() = user_id AND is_verified = true`. Service_role bypass via PostgREST is unreliable — PostgREST uses JWT claims (`auth.role()`), not GUC variables, so the bypass policy only works for tables that check `current_setting('role')`. For `point_positions`, service_role writes silently fail RLS.

Fix pattern: sign in as the user with their credentials, create a client with user JWT:
```typescript
const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
  email: userData.user.email, password: TEST_PASSWORD, // 'test-password-12345'
});
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
await userClient.from('point_positions').upsert({ point_id, user_id, position });
```

This is the same pattern used in `createTestUser` for profile creation.

**Example usage:**

```typescript
import { createTestUser, deleteTestUser } from './helpers/test-user';

test('my test', async ({ page }) => {
  const testUser = await createTestUser({
    name: 'Test User',
    email: `test-${Date.now()}@claritypledge.test`,
  });

  // ... run test ...

  await deleteTestUser(testUser.user.id);
});
```

### Environment Setup

Create `.env.test.local` (gitignored):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Security:** Never commit `.env.test.local` - it contains the service role key which bypasses all RLS.

---

## Lessons Learned

### What Worked

- ✅ Supabase Admin API for test user creation
- ✅ Sequential test execution (`workers: 1`) prevents race conditions
- ✅ Screenshot/video capture invaluable for debugging
- ✅ Comprehensive test helpers reduce boilerplate
- ✅ Using realistic test emails (`@claritypledge.test`) avoids rejections
- ✅ Environment variable management in Playwright

### What Didn't Work

- ❌ Manual localStorage injection doesn't trigger auth events
- ❌ Navigating to `/auth/callback?token=...` (tokens expire too fast)
- ❌ Assuming page reload triggers auth detection
- ❌ Using `@example.com` for test emails (Supabase rejects them)
- ❌ Making the practice room creator also the event host — causes `getByText(name)` strict-mode violation (name appears in organizer card AND rooms list) and `getByRole('link', {name:/keyword/i}).first()` to match the organizer card link instead of the intended button (P406)

### Key Insights

1. **Browser automation has limits:** Some flows are better tested at integration level
2. **Two-layer testing is valuable:** E2E for UI, integration for business logic
3. **Document failed attempts:** Saves future engineers from repeating mistakes
4. **Partial success is still success:** 10 passing tests deliver real value
5. **Infrastructure is reusable:** Framework is ready for future tests
6. **Test data isolation matters:** When a test user plays multiple roles (e.g., creator = event host), their name or link can appear in unexpected UI sections. Playwright's `getByText` strict mode and `getByRole('link')` selectors will match all occurrences — use separate users for each role in a test scene.

### If Starting Over

1. Start with integration tests for auth callback logic (with mocked Supabase)
2. Use E2E only for UI validation (forms, navigation, error messages)
3. Don't try to test magic link tokens in Playwright E2E
4. Try `setSession()` API first before localStorage injection
5. Set realistic expectations about what E2E can test in third-party auth flows

---

## Architecture Context

This E2E testing effort validates the **Reader-Writer authentication pattern** documented in [CLAUDE.md](../../CLAUDE.md):

- **Reader:** [useAuth.ts](../../src/auth/useAuth.ts) - Read-only hook that observes auth state
- **Writer:** [AuthCallbackPage.tsx](../../src/auth/AuthCallbackPage.tsx) - Handles profile creation after magic link verification

The E2E tests that DO work validate:
- Form UIs render correctly (Reader pattern)
- Error handling works (both Reader and Writer)
- Navigation reflects auth state (Reader pattern)

The E2E tests that DON'T work target:
- Session injection → auth state detection → redirect (full auth flow)

This is precisely where integration tests would excel, as they can mock the session creation and focus on testing the Writer's profile creation logic.

---

## Test Results

```bash
Running 17 tests using 1 worker

✅ 10 passed
⏭️  6 skipped (session detection issue)
❌ 1 failed (email validation focus timing)

Time: ~4 minutes (with retries)
```

**Breakdown by file:**
- `01-signup-flow.spec.ts`: 5 passing, 2 skipped
- `02-auth-callback.spec.ts`: 2 passing, 2 skipped
- `03-login-flow.spec.ts`: 3 passing, 2 skipped, 1 failing

---

## Debugging Failed Tests

### View Screenshots

```bash
test-results/<test-name>/test-failed-1.png
```

### View Videos

```bash
test-results/<test-name>/video.webm
```

### View Trace (for retry failures)

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Common Issues

**Email Domain Rejected**
- Problem: Supabase rejects `@example.com`
- Solution: Use `@claritypledge.test` or similar

**Test User Not Cleaned Up**
- Problem: Previous test left data
- Solution: Run `cleanupAllTestUsers()` helper

**Dev Server Not Starting**
- Problem: Port 5173 already in use
- Solution: Kill existing process or change port

---

## Files Created/Modified

### Created
- [playwright.config.ts](../../playwright.config.ts)
- [src/lib/supabase-admin.ts](../../src/lib/supabase-admin.ts)
- [e2e/helpers/test-user.ts](../../e2e/helpers/test-user.ts)
- [e2e/01-signup-flow.spec.ts](../../e2e/01-signup-flow.spec.ts)
- [e2e/02-auth-callback.spec.ts](../../e2e/02-auth-callback.spec.ts)
- [e2e/03-login-flow.spec.ts](../../e2e/03-login-flow.spec.ts)
- `.env.test.local` (gitignored)

### Updated
- [package.json](../../package.json) - Added Playwright dependencies + scripts
- [simple-navigation.tsx](../../src/app/components/layout/simple-navigation.tsx) - Fixed menu blinking

### Deleted
- `src/tests/auth-navigation.test.tsx`
- `src/tests/navigation-loading-states.test.tsx`

---

## Recommended Next Steps

### Immediate (Completed)
1. ✅ Skip 6 failing auth flow tests
2. ✅ Consolidate E2E documentation
3. ✅ Commit as WIP with known issue documented

### Short-term (1-2 hours)
1. Try `supabase.auth.setSession()` API approach
   - Expose Supabase instance globally in dev builds
   - Update `setTestSession()` helper to use API
   - Unskip 6 tests and verify they pass

### Long-term (3-4 hours)
1. Add integration tests for [AuthCallbackPage.tsx](../../src/auth/AuthCallbackPage.tsx)
   - Test token verification logic
   - Test profile creation for new users
   - Test existing user redirect (no duplicate profiles)
   - Test error cases (expired tokens, invalid tokens)
2. Keep E2E tests for UI validation only
3. Accept that magic link E2E testing has limitations in browser automation

---

## Test Helper Patterns & Gotchas

### Never call `signInWithPassword` on the shared `supabaseAdmin` singleton

`supabaseAdmin` is a shared instance using the service_role key. Calling `auth.signInWithPassword()` on it sets a user JWT in its in-memory auth state — subsequent `supabaseAdmin.from()` calls then use the user JWT instead of service_role, silently breaking cleanup DELETEs in `afterAll`.

**Wrong:**
```typescript
const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({ email, password });
```

**Correct — use a fresh client:**
```typescript
const freshAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data: signIn } = await freshAdmin.auth.signInWithPassword({ email, password });
```

See `e2e/helpers/test-calibration.ts` `createListenerClient()` for the established pattern.

### Don't manually update trigger-maintained counts

Columns like `verification_session_count` on `profiles` are maintained by DB triggers. If you insert rows and then read + increment the count manually, you'll double-count. Either rely on the trigger entirely, or SET the column to an exact value (not `current + N`).

---

## Conclusion

**Total time invested:** ~6 hours
**Value delivered:** High (infrastructure + 10 tests + knowledge + bug fix)
**Remaining work:** 1-4 hours (try `setSession` or add integration tests)

While we didn't achieve 17/17 passing tests, we:
- ✅ Built robust E2E infrastructure (reusable for future features)
- ✅ Prevented UI regressions (10 passing tests provide real value)
- ✅ Learned localStorage injection limitations in browser automation
- ✅ Documented clear path forward (`setSession` API or integration tests)
- ✅ Saved future engineers from repeating failed attempts
- ✅ Fixed menu blinking issue (bonus!)

**Recommendation:** Try Option 1 (setSession API) first (1-2 hours). If unsuccessful, pivot to Option 2 (integration tests) which has higher success probability and arguably better long-term value.

---

## Current Patterns (Feb 2026)

### Session Injection — Solved

Use `addInitScript` to inject the session before any page navigation. This fires synchronously before the page's JS runs, so Supabase auth state is available immediately:

```typescript
await page.addInitScript((session) => {
  const key = `sb-${PROJECT_REF}-auth-token`;
  localStorage.setItem(key, JSON.stringify(session));
}, sessionData);
await page.goto('/story/123');
```

Helper: `e2e/helpers/test-user.ts` → `setTestSession(page, email)` — handles session creation and injection in one call.

### Disabled-Button Tooltip Hover

Shadcn buttons apply `pointer-events: none` when `disabled`. Playwright's `.hover()` still moves the mouse but Radix UI tooltips may not trigger reliably. Use `page.mouse.move()` to the element's coordinates instead:

```typescript
const btn = page.getByRole('button', { name: /save story/i });
const bbox = await btn.boundingBox();
if (bbox) {
  await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
}
await expect(page.getByText(/can't be empty/i)).toBeVisible({ timeout: 5000 });
```

### Route Interception for Async UI State (aria-busy, loading spinners)

To assert UI state that only exists while a network request is in flight, intercept and pause the request:

```typescript
let resolveRoute: (() => void) | null = null;
const routeHandler = async (route: Route) => {
  if (route.request().method() === 'PATCH') {
    await new Promise<void>(resolve => { resolveRoute = resolve; });
    await route.continue();
  } else {
    await route.continue();
  }
};
await page.route('**/rest/v1/stories*', routeHandler);

await page.getByRole('button', { name: /save/i }).click();
await expect(page.getByRole('button', { name: /save/i }))
  .toHaveAttribute('aria-busy', 'true', { timeout: 2000 });

resolveRoute?.();
await page.unroute('**/rest/v1/stories*', routeHandler); // unroute before next save
```

**Important:** call `page.unroute()` before any subsequent request to the same URL to avoid re-intercepting cleanup calls.

### Console Error Listener Timing

Register the listener **before** `page.goto()` — errors thrown during page load are missed if the listener is set up after navigation:

```typescript
// ✅ correct
const errors: string[] = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.goto('/story/123');
await page.waitForLoadState('networkidle');
expect(errors).toHaveLength(0);

// ❌ wrong — always passes
await page.goto('/story/123');
await page.waitForLoadState('networkidle');
const errors: string[] = [];
page.on('console', msg => { ... });
```

### Rate Limiting — Run E2E with --workers=2

Supabase rate-limits `createTestUser` calls under parallel load. Run P4xx feature tests with `--workers=2` to avoid 429 errors in `beforeAll`.
