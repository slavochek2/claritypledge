---
status: week
type: bug
rank: 81
workstream: infrastructure
created_date: '2026-10-27'
tags: [e2e, tests, artifacts, p1545]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, fix, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1580: Browser tests for docs, drafts, inbox and sent letters fail on main since P1545

## Problem

> Founder framing, verbatim: *"whatever you do, better act as orchestrator and spin up sub-agents
> for directing them with Sonnet and so on, and then review with Gemini Argon, Opus and if needed,
> Codex"* (asked after: *"do i need to manually test anything to confirm the refactored features
> working or not"*).

**Situation:** P1545 moved Docs and Letters into the Artifacts page (2026-10-23).

**Complication:** Seven e2e specs that cover those screens were never updated. On `main` at
`cb7a52e4f` (control run, 2026-10-27), 24 tests failed across `p551-clarity-docs`, `p660-drafts-tab`,
`p660-inbox-tab`, `p660-letters-nav`, `p699-inbox-progress`, `p720-sent-tab-realtime` and
`p1512-chat-live`. Some assert screens that no longer exist; some time out in `beforeAll` while
creating test users; one helper hits a foreign-key error creating a story snapshot. So nothing
automated walks the Artifacts and letters screens today.

**Question:** Which failures are stale tests, which are test infrastructure, and which (if any) are
real app bugs?

## Appetite

Blast radius: low (test files; app code only if a failure proves a real bug). Reversibility: high.
Decision density: low, except any real app bug found, which is reported, not silently fixed.

## Solution

Classify every failing test as **stale** (asserts the pre-P1545 UI), **infra** (setup/timeout/helper),
or **real bug**. Update stale tests to the current UI while keeping what they protect; fix infra in
the helpers; report real bugs separately with evidence. Each repaired test is mutation-checked:
break the behaviour it guards, see it fail, restore (decisions.md 2026-10-27 [process]).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A test is "fixed" by weakening what it checks | MITIGATE | Each repaired assertion is mutation-checked; deleting a test needs a stated reason |
| A real app bug is papered over as a stale test | MITIGATE | Classification is written per test with evidence before any edit |
| Shared TEST DB flakiness masks results | ACCEPT | Rerun once; a flake is recorded, never retried until green |

Non-goal: redesigning the e2e harness; tests outside these seven specs.

## Done-When

- [x] Every failing test in the seven specs is classified (stale / infra / real bug) with evidence — table in the run report; stale: P1545 UI moves; infra: 30s hook timeouts and the shared-TEST overload; one real bug (received letters never show steps) split out as P1583
- [x] The seven specs pass on the branch (flakes named, not hidden) — self-hosted TEST, 2026-10-28: 58 passed, 2 skipped, 1 flaky (`p1512-chat-live:383` lost-reply retry, unedited, passed on retry), 1 failure that was a selector bug in this branch, since fixed and passing. Control on `main` before this branch: 24 failed
- [x] Each repaired test was seen failing with its guarded behaviour broken — 13 mutation runs (app change, run fails, restore, run passes). The remove-story test first PASSED with the unlink skipped; it now asserts the `doc_stories` row is gone and fails under that mutation. Badge test fails with the Artifacts badge forced to 0
- [x] Real app bugs, if any, are reported to the founder rather than silently fixed — one: received letters never show "N of M steps" (`get_received_letters_page` returns no step fields); reported and filed as P1583, no app code changed here
- [x] Reviewed by Gemini and Codex; findings resolved or recorded — round 1: 2 of 2 (2 fixed, 2 set aside with reasons: the draft-page navigation is the real P1545 path; the sender canary moved to the overview per P1545); round 2: 2 of 2, 3 fixed; round 3 Gemini confirmation clean. Receipt written
