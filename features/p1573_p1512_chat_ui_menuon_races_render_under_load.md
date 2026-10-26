---
status: week
type: bug
rank: 76
severity: low
workstream: infra
date_reported: 2026-10-24
created_date: 2026-10-26
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [tests, flaky, pre-commit]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1573: P1512 chat-UI `menuOn` races the render under full-suite load

## Summary

`src/tests/p1512-chat-ui.test.tsx:3360` ("F7: Reply and Clarify are never pending together") failed at `menuOn` (line 231, `getElementError`) during the full pre-commit suite twice: once on 2026-10-24 (INBOX-223) and again on 2026-10-26, blocking an unrelated P1565 commit. Run on its own, the file passes 210/210. This is a sibling of P1570, but it is not a timeout: `menuOn` uses a **synchronous** query, which the global `testTimeout` (P1570) does not cover.

## Root Cause

Hypothesis, unconfirmed: `menuOn = (text) => fireEvent.contextMenu(screen.getByText(...))` queries synchronously. The test awaits only `findByTestId('clarify-pending')`. Under load, the message row `'a note to self'` may not have rendered yet when that testid appears, so `getByText` throws.

## Reproduction Steps

1. Run `npm test` (full suite) or `./scripts/pre-commit-checks.sh` with a build-affecting file staged.
2. Observe, intermittently: `p1512-chat-ui.test.tsx` fails in `menuOn` with "Unable to find an element with the text".
3. `npx vitest run src/tests/p1512-chat-ui.test.tsx` passes 210/210.

**Reproduction rate:** intermittent (2 seen, 2026-10-24 and 2026-10-26).

## Expected Behavior

The test waits for the message it right-clicks, and passes under load as reliably as it does alone. It still fails if the message really is missing.

## Actual Behavior

Pre-commit blocks unrelated commits at random.

## Affected Files

- `src/tests/p1512-chat-ui.test.tsx:231`: `menuOn` (synchronous `getByText`); used across the file

## Severity

**Low**: no user impact, but it erodes trust in the commit gate.

## Fix Approach

Make `menuOn` async: `await screen.findByText(...)` before `fireEvent.contextMenu`, and update every call site to `await menuOn(...)`. Check the file's other synchronous `getBy*` queries that run right after an async render, using the same lens. Never weaken an assertion. Prove it with the P1570 stress method (CPU burners plus parallel runs): it fails before and passes after.

## Acceptance Criteria

- [ ] A stress reproduction that fails before the fix is recorded (command plus output), or an honest statement that it couldn't be reproduced, with the attempts made
- [ ] The same stress command passes after the fix, 5 rounds in a row
- [ ] Control: removing the message's text (or the context-menu handler) still fails the test
- [ ] INBOX-223 in `docs/process-learnings.md` is marked resolved, pointing to P1573
