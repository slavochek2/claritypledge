---
paths:
  - "e2e/**/*.ts"
  - "src/tests/**/*.ts"
  - "src/tests/**/*.tsx"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Test Rules

Tests are executable specifications. Modifying a test to make it pass = changing the spec.

- If tests fail, fix the code (not the test)
- Never use `.only()` — breaks CI, other tests stop running
- Never delete failing tests to make the suite green
- Never change assertions to match buggy output
- Never enable skipped tests without understanding why they were skipped
- If you believe a test is genuinely wrong, explain why and ask before changing it

## E2E Tests (Playwright)

- Location: `e2e/*.spec.ts`
- Run: `npm run test:e2e`
- Full guide: [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md)

## Unit Tests (Vitest)

- Location: `src/tests/` or colocated with components
- Run: `npm test`

## Auth E2E Coverage Rule

When a feature has UAT scenarios that require authenticated users (redirect, nav changes, role-based UI, session-dependent behavior), the E2E spec MUST include tests using `setTestSession()` from `e2e/helpers/test-user.ts`.

Auth-dependent UATs must NOT be left as "manual testing only" unless they require infrastructure that doesn't exist (e.g., two-party /live session fixtures).

Available auth helpers:
- `createTestUser()` — creates auth user + profile
- `setTestSession(page, email)` — injects browser session (call before navigation)
- `deleteTestUser(userId)` — cleanup
- `generateMagicLinkUrl(email)` — for token exchange flows

## Two-Party /live Test Helpers

Available in `e2e/helpers/test-realtime.ts` and `e2e/helpers/test-session.ts`:

- `waitForUIUpdate(page, locator, timeoutMs?)` — waits for a DOM element via the app's own delivery (Realtime + drift polling). Use instead of `page.reload()`.
- `advanceSessionState(sessionCode, overrides)` — writes `live_state` directly to DB. Use to skip multi-step UI flows without reload chains.
- `createTwoPartySessionRealistic(browser)` — session with proper join-flow timing: host subscribes first, guest joins later. Includes auth guard + terms dialog dismissal.
- `createTwoPartySession(browser)` — simultaneous setup (both users pre-inserted). Now includes auth guard + terms dialog dismissal. Use when subscription timing isn't under test.

## Two-Party Test Rule

Never use `page.reload()` to sync state in two-party /live tests. Use `waitForUIUpdate()` — if state doesn't arrive via the app's own delivery mechanisms, the test must fail.

`postgres_changes` Realtime events DO propagate between Playwright's isolated browser contexts (each opens its own WebSocket). The app's 1s drift polling provides a reliable fallback. There is no need for `page.reload()` as a sync mechanism.

Full guide: [e2e-testing-guide.md](docs/technical/e2e-testing-guide.md) (Two-Party Sessions section).

## Smoke Checks — No Standalone Files

Smoke assertions (page loads, no console errors, critical elements visible) belong in the **first `test()` block of the feature's E2E file** (`e2e/pN-*.spec.ts`), not in a separate `e2e/pN-smoke.spec.ts`.

**Why:** A dedicated smoke file duplicates the feature file's setup, adds a second Playwright worker boot for trivial assertions, and fragments context — reviewers must open two files to understand coverage.

**How:** Name the first test `'smoke: page loads and has no console errors'` inside the feature spec. Gate the rest of the file on this passing.

**Allowed standalone smoke files (non-P-number only):**
1. `e2e/auth-smoke.spec.ts` — cross-feature auth gate (login, redirect, session cookie)
2. `e2e/a11y/*.spec.ts` — accessibility sweeps that span multiple routes
3. `e2e/performance-smoke.spec.ts` — LCP/CLS budget checks not tied to one feature
4. `e2e/api-contracts.spec.ts` — edge function response-shape checks that predate features

## Count-Query Mock Fidelity

When mocking a Supabase count query that conditionally applies `.not()` (or any filter):
- `.not()` must return a **separate builder** that resolves to a **different count** than the unfiltered builder
- Returning `this` from `.not()` makes every chain resolve the same value — the test only proves the method was called, not that the filter changed the outcome

```typescript
// ✅ Correct — filter effect is provable
const filteredBuilder = makeQueryBuilder({ count: 0, error: null });
deliveriesBuilder['not'] = vi.fn().mockReturnValue(filteredBuilder);
// now: without fix → count: 1; with fix → .not() called → count: 0

// ❌ Wrong — test is call-shape only
deliveriesBuilder['not'] = vi.fn().mockReturnValue(deliveriesBuilder); // same count either way
```

This applies to any conditional filter in a count function (`.not`, `.in`, `.neq`, `.filter`).

## Subagent Scope Constraint

When a subagent is spawned to write tests, it MUST NOT modify source files.

**Permitted writes:**
- `e2e/**/*.ts`
- `src/tests/**/*.ts`, `src/tests/**/*.tsx`
- `src/**/*.test.ts`, `src/**/*.test.tsx`
- `tools/*/server/__tests__/**/*`, `tools/*/**/*.test.ts` (tool-local test suites)

**Prohibited — even "while you're in there":**
- `src/app/**/*` — application source
- `src/components/**/*` — UI components
- `tools/*/src/lib/types.ts` — type definitions
- Any `*.tsx` / `*.ts` file not matching the permitted patterns above

**Why:** A test-writing subagent rewrote `tools/kanban/src/lib/types.ts` and modified `App.tsx` and `CardDialog.tsx` unprompted. The changes were silent scope creep, caught only by checking `git diff` before committing, and had to be reverted.

**Prompt template for test subagents:**
```
Your task: [specific test task].
Write only to [test file paths]. Do NOT modify src/, lib/types.ts, or any non-test file.
If you believe a source change is required, report it and stop — do not make it.
```
