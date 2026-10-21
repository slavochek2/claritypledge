---
status: blocked
type: task
rank: 51
workstream: infrastructure
created_date: '2026-10-21'
tags: [day, supabase, quota, monitoring]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1525: /day reads Supabase free-plan usage (blocked on an org-read token)

## Problem

Split from [P1524](p1524_day_supabase_quota_and_test_db_health.md), which shipped the test
database check and wired `cp.quota` to report `not-run` until this lands. The two remaining asks:

> Founder framing, verbatim: "(1) the organisation's usage against the free-plan limits (cached
> egress, egress, logs, MAU), warning at 70% ... (3) a note when the test project is in its own
> organisation. Read-only."

Every Supabase token on this machine is refused for organisation reads (measured 2026-10-21: 401,
403 `organizations_read`, 403 `organizations_read`/`projects_read`; P1524 Solution).

## Appetite

One check block in `day-cp.md`, one helper script. Git revert. One founder action (below).

## Solution

**Measured 2026-10-21 — the public Management API cannot read organisation usage.** Its published
definition (`https://api.supabase.com/api/v1-json`) has no endpoint returning egress, cached
egress, log volume or MAU against plan limits. The only usage endpoints are per-project request
counts (`/v1/projects/{ref}/analytics/endpoints/usage.api-counts`, `usage.api-requests-count`).
The scoped-token form confirms it: its organisation permissions are Organizations, Projects,
Members, Settings and Webhooks, with no usage or billing scope. A token alone does not unblock
part 1.

**Part 3 is answered by observation:** the test project's organisation is "claritypledge-test",
separate from the production organisation (dashboard, 2026-10-21). Each organisation therefore
carries its own free-plan quota.

[FOUNDER DECISION: which signal stands in for the dashboard's usage figures — see the options
in the 2026-10-21 session: (a) request counts plus MAU as a proxy, (b) Supabase's own
usage-limit emails, read by /day, (c) accept the dashboard as the only source and drop part 1.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Runs only when `/day` runs (2026-08-09 ruling, P1031) | ACCEPT | Same stopgap as P1524; the token is local-only |
| Reaching for the prod master key to unblock | MITIGATE | Never; scoped read-only tokens only (P1214) |

**Non-Goals:** no writes to Supabase, no plan change, no GitHub Actions workflow.

## Done-When

- [ ] The usage endpoint is established, or recorded as not readable with the reason.
- [ ] `cp.quota` fires `problem` on the real organisation or at a deliberately low
      `QUOTA_WARN_PCT` (gate 7), and `ok` below it.
- [ ] The note appears when the test and prod projects sit in different organisations.
