---
status: all-done
type: bug
rank: 100.0
workstream: infrastructure
created_date: '2026-11-05'
tags: [day, kanban, monitoring]
disclosure: public
pipeline_ran: [create-spec, reproduce, fix]
reproduce_artifact:
  test_file: tools/kanban/server/__tests__/day-p1629.test.ts
  root_cause: "quotaHistory filters on started_at against resets_at - 7d, dropping a same-window reading; cp.quota can be recorded by hand (agent-reported) without the parser output, and nothing reconciles the check with monitoring.supabase"
  confidence: high
  surfaces_in_scope: [quotaHistory, day-render cp.quota, day.md usage file freshness, day-cp.md w2q]
  surfaces_deferred: []
  reproduced_at: 2026-11-05
drafted_by: opus
exec_model: sonnet
exec_effort: high
completed_at: 2026-11-05
---

# P1629: Day page loses the subscription projection, and the Supabase card can be empty after a passing read

## Problem

> Founder, verbatim: "I don't see visual projection for my subscriptions when it is supposed to go down. I saw it before all the time. And Superbase didn't check."

**Projection.** `quotaHistory` (`tools/kanban/src/lib/day.ts`) keeps a reading only if its time is within 7 days before the current reset. On the 2026-11-05 run both subscriptions had one reading, so the chart drew no projection. Claude's 2026-11-04 reading carried the same `resets_at` as today's but was taken 41 minutes before `resets_at - 7 days`, so it was dropped.

**Supabase.** In the same report, `cp.quota` carries agent-reported figures while `monitoring.supabase.collected` is false with no organisations. `/tmp/day-supabase-usage.txt` was still dated 2026-11-04, so that run did not refresh it. Why it did not is unknown (hypothesis, not cause).

## Root Cause

**Projection (confirmed).** Reports: 2026-11-04T02:19:41Z Claude 100, 2026-11-05T06:12:06Z Claude 82, both `resets_at` 2026-11-11T03:00:00Z. The window opens at 2026-11-04T03:00:00Z, so the first is dropped. Codex really did reset between the runs, so its single point is the accepted case.

**Supabase (confirmed from the report).** The 2026-11-05 `cp.quota` detail starts `agent-reported:`, written by `day-step.sh` for a check recorded by hand. The agent read the figures and skipped the parser append in `day-cp.md` Wave 2q, so `/tmp/day-supabase-usage.txt` stayed at 2026-11-04 09:23 and the 6-hour reader in `day.md` returned nothing. The check says it ran and the card says not read, and no code compares them. A second run within 6 hours would also read an earlier pass's file as its own.

## Appetite

Blast radius: one page and one `/day` step. Reversibility: git revert. Decision density: zero.

## Solution

1. A reading belongs to the current window if it carries the same `resets_at` as the current reading, whatever its timestamp.
2. Reproduce the Supabase gap first: find why the run recorded the check without writing fresh parser output. Make the check and the card agree, so a check cannot report figures while the card has none. Reject a usage file older than the run instead of reading stale data.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| With one real reading after a reset there is still no projection | ACCEPT | One point has no pace; the page already says so |
| A stale usage file is read as today's | MITIGATE | Solution 2 |

**Non-Goals:** Do NOT change the projection formula. Do NOT add a Supabase API reader; a prior ruling keeps this on the dashboard reader (P1525).

## Acceptance Criteria

- [x] A fixture of the 2026-11-04 and 2026-11-05 readings draws a Claude projection, and the test fails with the fix reverted
- [x] A reading from the previous reset window is still excluded
- [x] A run that does not refresh the usage file shows the Supabase check as not run, and the card says not collected
- [x] A normal run shows matching figures in the check and the card
- [x] Verified in a browser on the Day page at desktop, 375px and 320px

## Resolution

A reading with the same `resets_at`, within 60 seconds because Codex reports one window a second apart, counts whatever its time. `day-render.ts` marks `cp.quota` not run when monitoring has no usable Supabase figures. `day.md` rejects a usage file older than this pass. Evidence: 9 P1629 tests, two mutation controls went red, and the real 2026-11-05 report shows Claude's projection and "not read today" at desktop, 375px and 320px. Codex's single reading after its reset stays the accepted no-projection case.

## Related

P1399, P1525, P1578, P1628.
