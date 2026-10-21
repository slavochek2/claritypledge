---
status: qa
type: task
rank: 50
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

# P1524: /day warns early on Supabase free-plan usage and a slow test database

## Problem

**Situation:** The organisation's Supabase free plan went over quota this cycle (cached egress,
egress, logs) and the test database stopped responding once (P1522). Nobody saw it coming: the
first signal was Supabase's own restriction notice.
**Complication:** P1522 cut the measured causes, but nothing watches the numbers. The next overrun
will again be found by the restriction email, not by `/day`.
**Question:** What does `/day` read each morning so an overrun is seen at 70%, not at 100%?

> Founder framing, verbatim: "/day should check Supabase daily and warn early: (1) the
> organisation's usage against the free-plan limits (cached egress, egress, logs, MAU), warning
> at 70%; (2) the test database's response time (a simple REST query, warning at over 2s);
> (3) a note when the test project is in its own organisation. Read-only."

## Appetite

Blast radius: one skill (`day-cp.md`) and its check registry. Reversibility: git revert.
Decision density: one founder action (a new token, below), no product calls.

## Solution

Two new checks in the Wave 2 Supabase body (`cp.w2`), in the existing `CHECK` pattern, both
registered in `scripts/day-cp-checks.tsv`:

- **`cp.testdb` (part 2, buildable now).** An anon REST GET on the **test** project
  (`/rest/v1/events?select=id&limit=1`, `.env.local` URL and anon key), three samples,
  median. `ok` under 2s, `problem` over 2s or a non-200, `not-run` when the env is missing.
  The threshold is an env override (`TESTDB_WARN_MS`) so the failure path can be shown.
- **`cp.quota` (parts 1 and 3, blocked on a token).** The organisation's usage against
  free-plan limits, warning at 70% (`QUOTA_WARN_PCT`), and a note when the test project sits
  in its own organisation. Until a token with `organizations_read` exists, it records
  `not-run` naming the missing permission, never silence and never `ok`.

**Why it is blocked (measured 2026-10-21, status codes only):**

| token | `/v1/organizations` |
|---|---|
| keychain management token | 401 (revoked or expired, as P1522 recorded) |
| prod-scoped access token | 403 `Missing required permission(s): organizations_read` |
| scoped read-only token (P1214) | 403 `organizations_read`; `/v1/projects` 403 `projects_read` |

[FOUNDER DECISION: create a Supabase access token with read-only `organizations_read` and
`projects_read`, stored as `SUPABASE_ORG_READ_TOKEN` in `.env.local` (routine half, like the
P1214 read-only token). Rotation stays with P1148.]

**UNVERIFIED:** that the Management API exposes organisation usage (cached egress, egress, logs,
MAU) at all. A web search found the documented `usage.api-counts` endpoints (project request
counts) and the dashboard usage page, but no documented organisation-usage endpoint. Part 1's
first step, once the token exists, is to establish the endpoint and its response shape against
the live API. If none exists, part 1 falls back to request counts plus MAU from `auth.users`,
and the spec records that the egress figures are not readable.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A recurring check inside a skill only runs when `/day` runs (2026-08-09 ruling, P1031) | ACCEPT | Stopgap, as with RLS drift (2026-08-12): the org token is local-only. End state: a scheduled workflow once a scoped token may live in CI |
| One slow sample warns on a cold start | MITIGATE | Median of three samples, 10s timeout each |
| `cp.quota` reads `not-run` every day until the token exists | ACCEPT | That is the true state: the quota is unwatched. It must not read clean |
| Using the prod master key or the platform token to unblock part 1 | MITIGATE | Never. Read-only reports run on scoped credentials (P1214) |

**Non-Goals**
- Do NOT write to either database or to any Supabase setting.
- Do NOT add a GitHub Actions workflow in this spec.
- Do NOT upgrade the plan or change any quota.

## Done-When

- [x] `cp.testdb` reports `ok` with the median in ms — verified 2026-10-21 by running the exact
      lines extracted from `day-cp.md` Wave 2 against the real test project (`ok … 238 ms`).
      `[post-deploy]` confirm on the next full `/day`.
- [x] `cp.testdb` fires `problem` on the real test project with `TESTDB_WARN_MS=1` (gate 7), and
      `not-run` with the URL unset — exits 1 (`255 ms … over 1 ms`), 1 on an unroutable host and on
      HTTP 404, 2 with `TESTDB_ENV_FILE=/dev/null`.
- [x] `cp.quota` records `not-run` naming `organizations_read` while no token exists.
- [x] Both checks are in `scripts/day-cp-checks.tsv`, and `day-step.sh check-sync` passes (`SYNC OK`).

Parts 1 and 3 (organisation usage, own-organisation note) moved to
[P1525](p1525_day_supabase_free_plan_usage_reader.md), blocked on the org-read token.

## Related

- [P1522](done/2026-06-10/p1522_supabase_egress_polling_and_e2e_users.md): the overrun this watches for.
- [P1148](p1148_credential_rotation_system.md): owns rotation of the dead management token.
- Rulings: decisions.md 2026-08-09 (P1031), 2026-08-12 (RLS into `/day`), P1214 (scoped read-only credentials).
