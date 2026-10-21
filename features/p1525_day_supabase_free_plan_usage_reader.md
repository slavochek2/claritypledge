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

[FOUNDER DECISION: create a Supabase access token with read-only `organizations_read` and
`projects_read`, stored as `SUPABASE_ORG_READ_TOKEN` in `.env.local`.]

Once it exists: establish against the live API which endpoint returns organisation usage and its
shape (**UNVERIFIED** that one exists; no documented org-usage endpoint was found). Replace the
`cp.quota` placeholder with a reader that reports `problem` at 70% of any free-plan limit
(`QUOTA_WARN_PCT`), and adds the note when the test and prod projects sit in different
organisations. If usage is not readable, fall back to request counts plus MAU from `auth.users`
and say which figures are missing.

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
