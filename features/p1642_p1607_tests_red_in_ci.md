---
status: qa
type: bug
rank: 100
tags: [ci, tests]
disclosure: public
delivery_stage: ship
pipeline_ran: [fix, ship]
workstream: infrastructure
created_date: '2026-11-05'
---

# P1642: Ten P1607 unit tests are red on every CI run of main

## Problem

`npm test -- --run` on GitHub Actions fails 10 tests on every recent `main` run: 5 in `src/tests/p1607-e2e-loadtest-switch.test.ts`, 2 in `p1607-e2e-server-wide-detector.test.ts`, 3 in `p1607-e2e-serverwide-plan.test.ts`. They pass on a developer machine. The three files start the REAL `playwright.config.ts` in child processes and rely on the gitignored `.env.test.local` for the database settings. CI has no such file, so the child either has no `VITE_SUPABASE_URL` and is refused as "not the self-hosted TEST server" (loadtest-switch), or lists specs that import `e2e/helpers/supabase-admin.ts`, which throws at load without `SUPABASE_SERVICE_ROLE_KEY` (detector, plan), so `--list` exits 1 with an error per spec. The "No saved auth state" line in the plan test's message is a notice on stderr, not the cause.

## Solution

Give the tests a hermetic database environment instead of the developer's: one helper holds placeholder values (self-hosted-shaped URL, anon key, service key, `SELFHOSTED_TEST_ORIGIN`), and the child processes of the three files receive it. No assertion changes. Every failing control keeps failing for the reason its own regex names, which the fix is checked against.

## Risks / Non-Goals

- Not changing `playwright.config.ts`, `e2e/helpers/supabase-admin.ts` or any guard: the products are right to refuse a missing database.
- Placeholder values are not credentials and reach no network: `--list` loads the specs but runs none.
- The tests stop reading the real `.env.test.local`, so they no longer notice a bad real TEST config. That was never their job.

## Done-When

- [x] The three files pass in a clean clone with no env files and `CI=true`, run with `npx vitest run --maxWorkers=2` (red before, green after, exit codes shown).
- [x] The same three files pass in the normal worktree, where the env files exist.
- [x] The failing controls in `p1607-e2e-loadtest-switch.test.ts` still fail for the reason they name, shown by their child stderr, and each goes red when the guard it tests is removed.
- [x] No assertion in the three files is weakened.
