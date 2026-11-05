---
status: week
type: bug
rank: 100.0
workstream: infrastructure
created_date: '2026-11-05'
tags: [day, kanban, monitoring]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
---

# P1629: Day page loses the subscription projection, and the Supabase card can be empty after a passing read

## Problem

> Founder, verbatim: "I don't see visual projection for my subscriptions when it is supposed to go down. I saw it before all the time. And Superbase didn't check."

**Projection.** `quotaHistory` (`tools/kanban/src/lib/day.ts`) keeps a reading only if its time is within 7 days before the current reset. On the 2026-11-05 run both subscriptions had one reading, so the chart drew no projection. Claude's 2026-11-04 reading carried the same `resets_at` as today's but was taken 41 minutes before `resets_at - 7 days`, so it was dropped.

**Supabase.** In the same report, `cp.quota` carries agent-reported figures while `monitoring.supabase.collected` is false with no organisations. `/tmp/day-supabase-usage.txt` was still dated 2026-11-04, so that run did not refresh it. Why it did not is unknown (hypothesis, not cause).

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

- [ ] A fixture of the 2026-11-04 and 2026-11-05 readings draws a Claude projection, and the test fails with the fix reverted
- [ ] A reading from the previous reset window is still excluded
- [ ] A run that does not refresh the usage file shows the Supabase check as not run, and the card says not collected
- [ ] A normal run shows matching figures in the check and the card
- [ ] Verified in a browser on the Day page at desktop, 375px and 320px

## Related

P1399, P1525, P1578, P1628.
