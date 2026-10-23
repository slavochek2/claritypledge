---
status: week
type: task
rank: 62
workstream: infrastructure
created_date: '2026-10-23'
tags: [e2e, supabase, cost]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: low
driver: anomaly
---

# P1550: Prove one full e2e run leaves the e2e test-user count unchanged (P1532 follow-up)

## Problem

P1532 rebuilt e2e user cleanup (one request per 50 users, a worker user pool, a bounded sweeper). Its last acceptance criterion, "one full e2e run leaves the e2e-namespace user count unchanged", was deferred by the founder on 2026-10-23:

> **Founder framing, verbatim:** "do we close it do we need to do it at some point but now or now or later in the evening" ... "ok defer then"

A 3-worker full run on the new TEST project held it at 97-99% CPU while other sessions shared it, and was stopped at 387 of 4151 tests on the founder's request. The run's ledger purge then deleted 612 of 649 recorded users (37 were already gone) in 13 requests, 0 failed, and the count returned to 58. That is partial evidence: the same teardown path, run by hand, not at the end of a complete run. At `PLAYWRIGHT_WORKERS=1` a full run takes about 33 hours.

## Appetite

Blast radius: low (measurement only). Reversibility: n/a. Decision density: one, which is when TEST is quiet enough to run it.

## Solution

Run the full e2e suite once when TEST is not shared (or at `PLAYWRIGHT_WORKERS=1` while it is). Record the e2e-namespace user count before and after, plus the teardown's request log.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Full run overloads shared TEST again | MITIGATE | One worker while other sessions use TEST (founder rule, 2026-10-22) |
| Unrelated UI test failures end the run early | ACCEPT | The count is measured at teardown whatever the pass rate |

**Non-Goals:** Do NOT change cleanup code; that shipped in P1532. Never run the sweeper with `--apply` as a diagnostic.

## Done-When

- [ ] One complete full e2e run ends with the e2e-namespace user count equal to its starting count, within one teardown batch; before and after counts and the teardown request count recorded here.

## Related

- P1532 (parent; AC2 moved here)
