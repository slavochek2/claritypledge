---
status: week
type: task
rank: 108
workstream: infrastructure
created_date: '2026-11-06'
tags: [analytics, mixpanel, post-deploy]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1645: Prove P1640's numbers on prod data

## Problem

P1640 built the weekly read and its Analytics tab, but its filter and funnels can only be checked against data recorded after the code is live. Until then the tab marks every section "not yet reconciled". Split from P1640 per decisions.md 2026-09-08, because gate 2.5 cannot pass with boxes that need post-deploy data.

> Founder framing, verbatim (from P1640): "I get my insights delivered so I can see patterns and I can learn from them."

## Appetite

Blast radius: low, read-only queries and one label flip. Reversibility: git revert. Decision density: none, but one step needs the founder to open a tagged link.

## Solution

1. Prove `is_automation` on each smoke workflow separately, and that their SDK and CSP checks still fail when Mixpanel is blocked.
2. Define the real-visitor filter: not automation, not internal, outside any crawler pattern the clean window shows. Run it on a known-bad control (Des Moines traffic) and a known-good control (a tagged link the founder opens). Anonymous events carry no `is_internal`, so handle that or state it as a limit.
3. Reconcile RSVP counts with Supabase for at least three events, and several practice journeys with the practice funnel.
4. Record the Mixpanel plan in use in the registry row of `docs/technical/metered-services.md`, and whether the MCP depends on it. The figures stay private.
5. Set `reconciled` to true in `/weekly` step 2.9.0 for each section that passed.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Too few real RSVPs for three events | ACCEPT | Wait; the tab stays labelled until then |

**Non-Goals**
- Do NOT rebuild data from before the tag with a city filter.

## Done-When

- [ ] Both smoke workflows' events carry `is_automation=true`, and blocking Mixpanel still fails their checks
- [ ] The filter separates the known-bad and known-good controls, with query output pasted
- [ ] RSVP counts reconcile with Supabase for at least three events, with any gap explained
- [ ] A signed-in RSVP on prod shows `event_rsvp_completed` with `event_type`
- [ ] The plan in use is recorded, and reconciled sections no longer show the label

## Related

P1640, P1628.
