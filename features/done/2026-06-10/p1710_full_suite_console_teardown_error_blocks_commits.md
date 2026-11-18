---
status: all-done
type: bug
rank: 352
severity: medium
date_reported: 2026-11-18
created_date: 2026-11-18
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [vitest, pre-commit, flaky, tooling]
disclosure: public
pipeline_ran: [create-bug, fix]
completed_at: 2026-11-18
---

# P1710: Full-suite pre-commit run fails on a console-log teardown error with every test passing

## Summary

The pre-commit full vitest run blocks commits with `EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending`, while every test passes. On 2026-11-18 it blocked 4 of 8 commit attempts in one session, attributed each time to a different file (`src/tests/p1272-reproduce.test.tsx` twice, `src/tests/p1529-feedback-in-room.test.tsx` twice). Supersedes the narrower inbox note INBOX-378.

## Root Cause

Vitest 4.1.11 replaces `console` in each worker with a custom console that forwards every call to the main process over RPC (`onUserConsoleLog`), installed unless `disableConsoleIntercept` is set (`node_modules/vitest/dist/chunks/base.B6Opl8PE.js:52`, `console.3WNpx0tS.js:73`). When app code under test logs asynchronously (for example an error logger in a rejected promise) while the worker is closing, the pending RPC is cut off and vitest reports an unhandled error, which fails the run. Which file is running at that moment varies, so the error moves between files.

## Reproduction Steps

1. Stage any change that triggers the full suite in `./scripts/pre-commit-checks.sh` (for example a file under `tools/kanban/e2e-day/`).
2. `git commit`.
3. Observe: "Tests ✗" with `Test Files 1162 passed`, `Tests 15792 passed`, `Errors 1 error`, the EnvironmentTeardownError above.

**Reproduction rate:** intermittent (4 of 8 attempts on 2026-11-18). Running the named file alone passes with no error.

## Expected Behavior

A full run with every test passing does not fail on console traffic.

## Actual Behavior

The run reports 1 unhandled error and the commit is blocked.

## Affected Files

- `vite.config.ts` — `test` block (no `disableConsoleIntercept`).

## Severity

**Medium** — blocks commits intermittently across all sessions; no product impact.

## Fix Approach

Set `disableConsoleIntercept: true` in the `test` block of `vite.config.ts`. Workers then keep the real console and send no console RPC, so this error class cannot occur. Trade-off: console output is no longer grouped under the test that printed it. No test in `src/` uses `onConsoleLog`, and `vi.spyOn(console, …)` works on the real console.

## Acceptance Criteria

- [x] `vite.config.ts` sets `disableConsoleIntercept: true`, and a check confirms vitest resolves it (the worker's `console` is not vitest's custom console). — probe: worker console === node:console true with the setting, false without it (2026-11-18)
- [x] Tests that spy on `console` still pass. — 37 console-spying files, 882 tests pass
- [x] A full suite run passes with no unhandled errors. — full suite green in the P1710 commit hook (126b7d8b9) and the P1707 round-4 commit
