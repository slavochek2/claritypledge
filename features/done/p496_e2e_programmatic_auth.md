---
status: done
type: task
rank: 1.0
tags: [e2e, auth, testing, infrastructure]
flow: dev
delivery_stage: uat
completed_at: '2026-03-13'
---

# P496: E2E Programmatic Auth Bypass

## Problem Statement

67% of agent "can't verify" failures (173 instances over 2 weeks) trace to agents lacking authenticated browser sessions. The biggest chunk (~30 cases) is single-user authenticated views that agents can't see because headless browsers start fresh sessions. Agents must currently rely on manual browser verification or skip auth-gated pages entirely.

## Scope

1. **Test JWT utility** — generate valid Supabase-compatible JWTs for test users, bypassing Google OAuth entirely. Uses service role key for test user setup.
2. **Playwright auth helper** — `getTestAuthContext(role: 'host' | 'guest')` returns a `BrowserContext` with valid auth tokens injected (localStorage + cookies matching Supabase session format).
3. **RLS compatibility** — test execution uses anon key + user JWT (not service role), so RLS policies are exercised realistically.
4. **Usage documentation** — doc comments and a short README section explaining the pattern for future E2E tests.

## Constraints

- **No production code changes.** All utilities live in `e2e/` directory.
- **Test-only secrets.** Uses existing `SUPABASE_SERVICE_ROLE_KEY` from test project (already in `.env.local`). No new secrets needed.
- **Supabase test project only.** Never generates tokens against prod.

## Acceptance Criteria

- [x] `getTestAuthContext(role: 'host' | 'guest')` returns a Playwright `BrowserContext` with valid auth
- [x] Authenticated pages (`/live`, `/agreements/new`, `/settings`) load correctly in E2E tests using this context
- [x] No production code changes — all test-only utilities in `e2e/` directory
- [x] Full JSDoc + usage example in `e2e/helpers/auth-context.ts` explains the pattern for new E2E tests

## Implementation

- **`e2e/helpers/auth-context.ts`** — `getTestAuthContext(role, browser)` helper
  - Creates a temporary test user via Admin API (no email verification)
  - Signs in with password to get a real user JWT (not service_role — RLS is exercised realistically)
  - Injects session into `BrowserContext` via `addInitScript` on the `sb-{ref}-auth-token` localStorage key
  - `role: 'host'` → verified user (`is_verified: true`)
  - `role: 'guest'` → authenticated but not verified (`is_verified: false`)
  - Returns `{ context, user, cleanup }` — call `cleanup()` in `finally` to delete the test user
- **`e2e/p496-auth-context.spec.ts`** — smoke tests verifying each acceptance criterion

## UAT

Run the smoke tests to verify:
```bash
npx playwright test e2e/p496-auth-context.spec.ts --project=chromium
```

Expected: 5 tests pass — host accesses `/live`, `/agreements/new`, `/settings`; guest session is injected; two contexts have isolated sessions.
