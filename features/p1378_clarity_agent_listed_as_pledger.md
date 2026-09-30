---
status: week
type: bug
rank: 15
severity: medium
date_reported: 2026-09-30
created_date: 2026-09-30
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [pledgers, agent-accounts, profiles]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1378: "Clarity Agent" is listed as a pledger on /pledgers

## Summary

The system identity "Clarity Agent" (slug `clarity-agent`, profile `10e8f204-447e-45de-b2d0-a27ecd5adff1`) shows up on prod `/pledgers` as if it were a person who signed the pledge. The founder: *"he should never appear"*.

## Root Cause

`get_pledgers_page` (`supabase/migrations/20260902000000_p1229_get_pledgers_page.sql:31-34`) lists profiles where `is_verified = true AND has_pledged = true AND is_test_account = false`.

- `scripts/bootstrap-align-agent.mjs:187-223` creates or adopts the Clarity Agent profile with `is_verified: true`. That is required, because story INSERT RLS needs a verified author.
- It never sets `has_pledged`. The column is `boolean not null default true` (`supabase/migrations/20250101_initial_schema.sql:16`), so the agent counts as a pledger.
- P1104 persona agents (`agent-*`) hit the same default and set it explicitly (`supabase/migrations/20260819120000_p1104_agent_accounts.sql:84`). The P1030 Clarity Agent bootstrap predates P1104 and never got the same treatment.

UNVERIFIED: the prod value of `has_pledged` on this row. The inference comes from the default plus the fact that the row passes the RPC filter. `is_test_account` must also be false or null.

## Invariants

- Clarity Agent stays `is_verified = true`. Story authoring depends on it.
- Display filtering happens at the query level, not in RLS (decisions.md 2026-03-22, P571).

## Reproduction Steps

1. Open https://claritypledge.com/pledgers (anon).
2. Observe "Clarity Agent" in the grid. Or call the RPC: `POST /rest/v1/rpc/get_pledgers_page {"p_limit":500,"p_offset":0}` with the prod anon key. On 2026-09-30 it returned total 16, and Clarity Agent was one of them.

**Reproduction rate:** 100%

## Expected Behavior

No agent or system identity appears on /pledgers, and none is counted in the "N pledgers" total.

## Actual Behavior

Clarity Agent appears as a pledger and is included in the total.

## Affected Files

- `scripts/bootstrap-align-agent.mjs:187-223`: profile create/adopt; `has_pledged` is never set to false
- `supabase/migrations/20260902000000_p1229_get_pledgers_page.sql:31-34`: pledger filter
- Also check the other pledger surfaces that share the filter: featured profiles and the social-proof count (`src/app/components/landing/social-proof.tsx`)

## Severity

**Medium.** A public trust surface shows a bot as a signatory. Nothing is broken functionally.

## Fix Approach

1. Data: set `has_pledged = false` on the Clarity Agent prod row. The row must stay verified. Check whether `guard_profile_trust_columns` pins `has_pledged` and route through the same path P1104 used.
2. Code: make `bootstrap-align-agent.mjs` set `has_pledged: false` on create and on adopt, so a re-bootstrap can't bring the bug back.
3. Optional hardening: have `get_pledgers_page` also exclude `agent_accounts` profile ids. Clarity Agent is not in `agent_accounts` (the test registry holds only `agent-*` personas), so that filter alone would not catch this row.

## Acceptance Criteria

- [ ] Prod /pledgers does not show "Clarity Agent", and the total drops by one
- [ ] The Clarity Agent can still publish a story on prod (its verified status is unchanged)
- [ ] Re-running `bootstrap-align-agent.mjs` in adopt mode leaves `has_pledged = false`
- [ ] Landing social-proof count and featured profiles also exclude it
