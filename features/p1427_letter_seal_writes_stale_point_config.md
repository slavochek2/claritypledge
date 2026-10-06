---
status: backlog
type: bug
rank: 317
severity: low
workstream: letters
date_reported: 2026-10-06
created_date: 2026-10-06
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [letters, lost-update, jsonb]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1427: Sealing a letter can write back a stale `point_config` from page load

## Summary

On seal, `src/app/pages/letter-compose-page.tsx` (~line 204) writes
`{ ...existing, order }` where `existing` is the story's `point_config` **as loaded when the
composer opened**. If the author changed `hidden` or `lead_count` elsewhere in the meantime (e.g. the
doc detail page, `src/app/pages/doc-detail-page.tsx` ~line 107, in another tab), the seal restores
the old values, and the sealed snapshot copies them — a point the author hid could reach
recipients. Same bug class as P1425 (stale snapshot written back whole); found by the P1425
bug-class sweep, not by a user report.

## Root Cause

Client-side read-modify-write of a whole jsonb (`point_config`) from a read taken at page load.
UNVERIFIED end to end: the snapshot step's exact copy of `point_config` should be confirmed by
`/reproduce`.

## Invariants

- A writer of a shared JSON column changes only the keys it owns (P1425, generalised): the seal
  owns `order`, never `hidden` / `lead_count`.

## Reproduction Steps

1. Open a doc's letter composer (tab 1).
2. In tab 2, hide a point on the same doc.
3. Seal the letter in tab 1.
4. Observe: `point_config.hidden` is back to the tab-1 value; the hidden point is in the sealed letter.

**Reproduction rate:** 100% when the two-tab sequence is followed.

## Expected Behavior

Sealing writes only `order`; `hidden` / `lead_count` keep their current values.

## Actual Behavior

Sealing restores the page-load `hidden` / `lead_count`.

## Affected Files

- `src/app/pages/letter-compose-page.tsx` — seal handler (~lines 195–210)
- `src/app/pages/doc-detail-page.tsx` — the other writer (~line 107)

## Severity

**Low** — needs two tabs, but the consequence (a hidden point published to recipients) is a
content-exposure one, so worth fixing.

## Fix Approach

Write only `order` atomically (jsonb `||` / `jsonb_set` in an RPC or a single-key update), or
re-read `point_config` immediately before the seal and abort on a change.

## Acceptance Criteria

- [ ] Hiding a point in another tab before sealing keeps it hidden in the sealed letter
- [ ] Seal still persists the chosen `order`
- [ ] Regression test covers the two-writer sequence
