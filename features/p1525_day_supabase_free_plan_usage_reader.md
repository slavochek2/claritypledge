---
status: qa
type: task
rank: 51
workstream: infrastructure
created_date: '2026-10-21'
tags: [day, supabase, quota, monitoring]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1525: /day reads Supabase free-plan usage from the dashboard through Chrome

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

**Part 3, observed in the dashboard 2026-10-21:** both projects (prod and test) sit in one
organisation, so test traffic counts against the same free-plan quota. A second, empty
organisation exists, apparently intended for the test project. The note fires when the test
project is found outside the production organisation. (Corrects an earlier commit that read the
empty organisation's page and inferred the opposite.)

**The dashboard Usage page is readable as text through Claude in Chrome** (signed-in session):
every metric renders as `used / limit`, plus a quota-exceeded banner. That is the only source of
the figures part 1 asks for.

Founder decision 2026-10-21: read the Usage page through Chrome during /day (no proxy, no token). When
Chrome or the Supabase sign-in is unavailable, `cp.quota` is `not-run` and the Day board shows a
"Supabase dashboard" connection whose Fix says to open Chrome and sign in.

**Built:** `scripts/supabase-usage-parse.py` (page text in; `ROW … over|under`, `BANNER:`,
`PROJECTS:`, `USAGE:` out; exit 0/1/2), `day-cp.md` Wave 2q (step `cp.w2q`, attest), `cp.quota`
re-registered to `cp.w2q` with connection `supabase` and severity `high`, and the global dispatcher's
`conn supabase` label and Fix.

**Known limitations:** units are normalised for B/KB/MB/GB/TB only; the parser keys on the
"Usage Summary" heading and the `used / limit` line shape, so a dashboard redesign reads as
`not-run`, never as clean.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Runs only when `/day` runs (2026-08-09 ruling, P1031) | ACCEPT | Stopgap: the figures exist only behind a signed-in browser session, which CI cannot hold |
| Dashboard markup changes | MITIGATE | Missing rows or heading read as `not-run` with the sign-in Fix, never `ok` |
| Reaching for the prod master key to unblock | MITIGATE | Never; scoped read-only tokens only (P1214) |

**Non-Goals:** no writes to Supabase, no plan change, no GitHub Actions workflow.

## Done-When

- [x] The usage endpoint is established, or recorded as not readable with the reason — not readable
      through the public API (its published definition, 2026-10-21); read from the dashboard instead.
- [x] `cp.quota` fires `problem` on the real organisation or at a deliberately low
      `QUOTA_WARN_PCT` (gate 7), and `ok` below it — the real Usage page parses to `problem` (exit 1),
      `--warn-pct 1000` without a banner reads `ok`; 35/35 parser tests, control proven to fail; the
      check, finding and attest were accepted by `day-step.sh` on a scratch ledger.
      `[post-deploy]` confirm on the next full `/day`.
- [x] The note appears when the test and prod projects sit in different organisations — the parser
      lists each organisation's projects (`PROJECTS:`, tested) and Wave 2q step 5 files
      `quota:test-project-in-own-org` when they differ; today both share one organisation, so the
      live path files nothing. `[post-deploy]` observe it if the test project is moved.
