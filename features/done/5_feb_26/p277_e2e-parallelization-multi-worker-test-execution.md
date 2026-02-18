---
status: done
delivery_stage: implementation
type: task
rank: 277.0
workstream: foundation
tags: [e2e, testing, performance, playwright, ci]
---

# P277: E2E Parallelization — Enable Multi-Worker Test Execution

## Summary

The full E2E suite runs with `workers: 1` (sequential), taking approximately 43 minutes. Enabling 3 parallel workers could cut that to ~12-15 minutes (3x speedup). The primary blocker is test data isolation: parallel workers must not read or corrupt each other's DB state.

This task covers auditing tests for shared global state reads, fixing any found cases, enabling workers, and verifying the result is a stable suite.

---

## Current State

`playwright.config.ts` line 55:
```ts
fullyParallel: false,
workers: 1,
```

Test users are created with unique emails (`e2e-test-{timestamp}-{random}@gmail.com`) and slugs, so user-level data is already isolated. Clarity sessions are scoped by a 6-character `code` (random per test). The `supabaseAdmin` client is shared across tests within a worker, but its auth state is not mutated (this was fixed previously).

### File inventory (38 spec files as of this writing)

| Category | Files | Parallel-safe? |
|---|---|---|
| Two-party live session tests (`creator-detects-joiner`, `partner-left-meeting`, `speak-freely-button`, `new-meeting-after-partner-left`) | 4 | Yes — each test creates its own `browser.newContext()` and cleans up its own session code |
| Single-user UI tests (`landing-no-horizontal-scroll`, `manifesto-navigation`, etc.) | ~15 | Yes — read-only, no DB mutation |
| Auth flow tests (`01-signup-flow`, `02-auth-callback`, `03-login-flow`) | 3 | Yes — each test creates and deletes its own user |
| Profile/point/story tests (`p268-position-display-integrity`, `point-position-persistence`, etc.) | ~10 | Likely yes — scoped by test-specific IDs |
| Pledgers page tests | 1 | **Risk** — see below |
| Integration tests (separate project) | 2 | N/A (separate CI step) |

---

## Risk Analysis

### High risk: `pledgers-page.spec.ts` — global empty-state test

The "Empty state shows when no profiles exist" test deletes all its own users, then navigates to `/pledgers` and asserts `No Verified Pledgers Yet`. This assertion is global: if any other test worker has created users that are visible to the pledgers query, this test will see them and fail.

This is the clearest parallelization blocker in the suite.

**Fix options (in order of preference):**

1. **Separate test file / serial group.** Mark the describe block with `test.describe.configure({ mode: 'serial' })` and add `@serial` to the test file metadata so Playwright runs it in its own worker in isolation.
2. **Move to a separate project.** Add a `serial-tests` project in `playwright.config.ts` that runs with `workers: 1`, and move `pledgers-page.spec.ts` into it.
3. **Redesign the empty-state test.** Instead of relying on the global pledgers table being empty, check that the test's 25 users are gone and the "Showing N of M" text reflects the correct count delta. Harder to get right without knowing the total count of real profiles.

**Recommended:** Option 1 (serial group). Least invasive, zero redesign.

### Medium risk: `beforeAll` in `point-position-persistence.spec.ts`

The `beforeAll` in this file only logs a console message (reminder to apply a migration). No DB interaction. Safe for parallelization as-is.

### Low risk: `listUsers()` in `deleteTestUserByEmail` helper

`supabaseAdmin.auth.admin.listUsers()` fetches ALL auth users without filtering. This is only called by `deleteTestUserByEmail()`, which is not used in any spec file (only used internally if someone calls the email-based cleanup). Not a correctness risk; slightly slow if called, but correctness is fine since the email is then matched.

### No risk found: all `select('*')` calls are scoped

- `point-position-persistence.spec.ts` line 87: `.eq('point_id', testPointId).eq('user_id', ...)` — fully scoped
- `p154-position-persistence-profile.spec.ts`: similar pattern, scoped by test-specific IDs
- `live-content-picker.spec.ts`: entire describe block is `test.describe.skip(...)` — never runs

---

## Implementation Plan

### Phase 1: Audit and fix (before enabling workers)

**Task 1.1 — Fix `pledgers-page.spec.ts` empty-state test**

Add `test.describe.configure({ mode: 'serial' })` at the top of the pledgers describe block. This ensures the describe block runs sequentially within a single worker without blocking other spec files from running in parallel workers.

```ts
test.describe('Pledgers Page', () => {
  test.describe.configure({ mode: 'serial' });
  // ... existing tests unchanged
```

**Task 1.2 — Verify no other tests read unscoped global data**

Grep patterns to confirm clean:
```bash
# Look for unscoped table reads (no .eq() filter following .select())
grep -n "supabaseAdmin.from" e2e/**/*.spec.ts
# Look for listUsers() calls in spec files
grep -rn "listUsers" e2e/
```

Based on the audit above, no other spec files read global/unscoped DB state.

### Phase 2: Enable workers

**Task 2.1 — Update `playwright.config.ts`**

```ts
// Before:
fullyParallel: false,
workers: 1,

// After:
fullyParallel: true,
workers: process.env.CI ? 2 : 3,
```

Note: `fullyParallel: true` allows tests within the same file to run in parallel across workers. For files with `describe.configure({ mode: 'serial' })`, Playwright still runs those sequentially within a single worker.

**Task 2.2 — Add `PLAYWRIGHT_WORKERS` env var override (optional)**

```ts
workers: process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS)
  : process.env.CI ? 2 : 3,
```

This satisfies the acceptance criterion "configurable via env var."

### Phase 3: Validate

**Task 3.1 — Run parallel suite locally**

```bash
npm run test:e2e
```

Accept criteria: no new failures compared to the last serial run.

**Task 3.2 — Run suite 3 times consecutively**

Flakiness that only appears under parallelization shows up within 3 runs. If any test fails intermittently, investigate before declaring done.

**Task 3.3 — Measure actual runtime**

Time the run before and after. Target: <20 min from 43 min baseline.

### Phase 4 (optional): CI sharding

For GitHub Actions or similar CI, add matrix sharding to split the suite across parallel CI jobs:

```yaml
# .github/workflows/e2e.yml (example)
strategy:
  matrix:
    shard: [1, 2, 3]
steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/3
```

This is independent of local worker count. Not blocking for the core task.

---

## Acceptance Criteria

- [x] `pledgers-page.spec.ts` empty-state test is marked `mode: 'serial'` and no longer breaks when run in parallel
- [x] No other global/unscoped DB reads found in the spec files (or all found cases are fixed)
- [x] `playwright.config.ts` sets `fullyParallel: true` and `workers: process.env.CI ? 2 : 3`
- [x] Worker count is overridable via `PLAYWRIGHT_WORKERS` env var
- [ ] Full suite passes with 0 new failures across 3 consecutive parallel runs
- [ ] Suite runtime drops below 20 minutes locally with 3 workers

---

## Files to Change

| File | Change |
|---|---|
| `playwright.config.ts` | Enable `fullyParallel: true`, set `workers` by env/CI |
| `e2e/pledgers-page.spec.ts` | Add `test.describe.configure({ mode: 'serial' })` |

No other spec files need changes based on the current audit.

---

## Technical Notes

**Why `fullyParallel: true` matters.** Without it, files run in parallel but tests within a single file are sequential. With it, tests within a file can also be distributed across workers — increasing utilization. Files with `describe.configure({ mode: 'serial' })` are exempt.

**Worker count rationale.** 3 workers locally matches a typical 4-core developer machine (leaves 1 core for the dev server and OS). 2 workers in CI is conservative — most CI runners have 2 CPU cores, and running the dev server alongside takes one. Adjust based on observed CI runner specs.

**Two-party live session tests.** These are already parallel-safe: each test creates two `browser.newContext()` instances and cleans up its own session code in `finally {}`. Running multiple such tests in parallel just means multiple independent live sessions exist simultaneously in the test DB — which is fine, since each session is scoped by its unique 6-character code.

**`supabaseAdmin` client sharing.** The admin client is a module-level singleton. Multiple tests within the same worker share it. This is safe: the client makes individual HTTP requests to Supabase and does not maintain any per-test mutable state. The previous auth state bug (where `signInWithPassword` in a helper would affect a shared client's session) has already been resolved.
