---
status: week
type: bug
rank: 13
severity: medium
workstream: testing
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [e2e, test-helpers, cleanup]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1345: deleteTestUser swallows a failed profile delete, so test users pile up unseen

## Summary

INBOX-58. `e2e/helpers/test-user.ts` `deleteTestUser` handles a failed profile delete with
`console.warn` and continues (lines ~451-453). The two dependent-record pre-cleans before it
(`story_verifications`, `stories`) do not check their errors at all. P1292's trigger defect
stranded 38 "Feed Author" users on the test project for two days. Nobody noticed, and they
now break eight hashtag-feed tests.

## Root Cause

Verified by reading the code, 2026-09-22. The comment "Continue anyway - user might not have
profile" is wrong: a PostgREST `delete().eq()` that matches no row returns no error. An error
therefore means a real failure, such as an FK violation, RLS, or a trigger error.

## Invariants

- A missing profile is not an error (a no-match delete is a no-op, not a failure).
- A 404 on auth delete is still idempotent success. Non-404 auth-delete failures stay non-blocking,
  a deliberate choice recorded in the existing comment and outside this bug's scope.

## Reproduction Steps

1. Make the profile delete fail, for example with a dependent row whose FK has no ON DELETE action
   (INBOX-59: `story_verifications_speaker_id_fkey`, when the pre-clean is skipped) or with a mocked error.
2. Call `deleteTestUser(id)`.
3. Observe: it resolves normally, the user and profile remain, and only a warning is logged.

## Expected Behavior

`deleteTestUser` rejects with an error naming the user id and the failing step, so the test that
owns the user fails and the leak is visible.

## Actual Behavior

It resolves and the user is stranded without anyone noticing.

## Affected Files

- `e2e/helpers/test-user.ts` — `deleteTestUser`.

## Severity

**Medium.** Test-data rot causes unrelated failures later. There is no prod impact.

## Fix Approach

Check the error from both pre-cleans and from the profile delete. Throw
`Error('[TEST HELPER] deleteTestUser(<id>) failed at <step>: <message>')`. Leave the auth-delete
handling as it is. Known trade-off: a throw inside a `finally` replaces the test's own error in the
report. It was accepted because a silent leak is the worse failure (INBOX-58). Existing stranded
test users are **not** deleted by this fix, since a DB delete needs founder approval.

## Acceptance Criteria

- [ ] A unit test with a mocked admin client shows `deleteTestUser` rejects when the profile delete returns an error, and when either pre-clean does.
- [ ] The same test shows it resolves when every delete returns no error, and when the auth delete returns 404.
- [ ] A real e2e spec that creates and deletes a user still passes against the test project.
