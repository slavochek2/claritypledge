---
status: backlog
type: task
rank: 60
severity: low
workstream: infrastructure
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [infrastructure, dev-experience, p806-followup]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P811: Sync prod st-stories to dev for easier manual reproduction of badge bugs

## Summary

Deferred from P806. Manual reproduction of badge-related bugs in dev currently requires hand-creating a story + #understanding point + listener position via DB inserts (P804/P806 canary infra does this in tests). For exploratory debugging where a developer wants to walk through the flow manually with realistic data, having prod-shape stories synced into dev would speed iteration.

Not blocking for any specific bug — P806 was reproduced and verified using synthetic test data.

## Root Cause

N/A — feature/infrastructure request, not a bug.

## Reproduction Steps

N/A

## Expected Behavior

A script that copies a curated set of prod stories with #understanding-tagged points (and the relevant point_positions for a test listener) into the dev DB, suitable for manual exploratory testing of the certification flow.

## Actual Behavior

Manual repro requires either running the canary test setup OR hand-creating data via supabase admin SQL.

## Affected Files

- `scripts/` — new sync script (e.g., `scripts/sync-prod-stories-to-dev.sh`)

## Severity

**Low** — Developer experience improvement; not blocking any user-facing bug.

## Fix Approach

1. Identify a curated set of prod stories with `#understanding`-tagged points
2. Write a script that pulls those + their points + relevant point_positions
3. Inserts them into dev DB scoped to a known test user
4. Document usage in `docs/technical/`

## Acceptance Criteria

- [ ] Script exists and runs end-to-end without errors
- [ ] Idempotent (re-running doesn't duplicate or break existing data)
- [ ] Documentation explains when/how to use it
- [ ] Does not pull any user-identifying prod data (PII filter)
