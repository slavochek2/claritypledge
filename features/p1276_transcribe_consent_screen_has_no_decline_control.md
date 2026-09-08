---
status: week
type: bug
rank: 1000081
severity: medium
workstream: transcription
date_reported: '2026-09-08'
created_date: '2026-09-08'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [transcribe, consent, ux, test-divergence]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1276: The `/transcribe` consent screen has no way to decline

## Summary

`e2e/p1149-consent-gate.spec.ts:52` asserts that a "leave" control on the `/transcribe` consent
screen navigates the user away without joining. No such control exists in the UI, so the test has
been failing on `main` — and a consent screen with no decline affordance is the more interesting
half of the finding.

## Root Cause

The consent screen (`transcribe-room-page.tsx`, the `transcribe-consent-screen` branch) renders
exactly two buttons: the recording-consent toggle and the join button. There is no decline, leave,
or cancel control. The test waits 30s for `getByRole('button', { name: /leave/i })` and times out.

Whether the control was removed or never built is not established here — `git log` on the page
would settle it, and that belongs in the fix, not in this report.

## Reproduction Steps

1. `npx playwright test e2e/p1149-consent-gate.spec.ts --project=chromium`
2. Observe: `declining leaves the room — navigates away without joining` times out on
   `locator.click` waiting for a `/leave/i` button. The other 2 tests in the file pass.

**Reproduction rate:** 100%. Confirmed on `main` (1 failed, 2 passed) and on
`feature/p1275-transcribe-room-create-rls` (identical) — this is pre-existing and unrelated to
P1275, which is how it was found.

## Expected Behavior

[FOUNDER DECISION: which of these is right.] Two coherent outcomes, and they are not equivalent:

- **The screen should have a decline control.** A consent gate whose only affordances are "agree"
  and "agree and continue" is a consent gate in name. The user's only current exit is browser
  navigation. If this is the answer, the fix is a UI change and the test already encodes it.
- **The test is stale.** If declining was deliberately reduced to "navigate away", the test should
  be rewritten to assert that invariant instead — and the reasoning recorded, because the next
  person to read the test will ask the same question.

## Actual Behavior

The test times out after 30s. A user on the consent screen who does not want to be recorded has no
in-page way to say so.

## Affected Files

- `src/app/pages/transcribe-room-page.tsx` — the `transcribe-consent-screen` branch; two buttons,
  neither of them a decline
- `e2e/p1149-consent-gate.spec.ts:51-59` — the failing test

## Severity

**Medium** — no data loss and no security exposure, and the user can still leave via browser
navigation. Rated medium rather than low because it sits on a consent surface and because a
permanently red test in the suite erodes the signal of every other test in it.

## Fix Approach

Settle the founder decision above first; the two branches lead to different files. Do not "fix" it
by deleting or loosening the assertion — that is the one move that resolves the red without
answering the question.

## Acceptance Criteria

- [ ] `e2e/p1149-consent-gate.spec.ts` passes in full (3/3)
- [ ] Either a decline control exists on the consent screen and leaves without joining, or the test
      asserts the actual intended decline path and the spec records why it changed
- [ ] `__getUserMediaCalls` is still 0 on the decline path — declining must not open the microphone
- [ ] No console errors during the decline flow
