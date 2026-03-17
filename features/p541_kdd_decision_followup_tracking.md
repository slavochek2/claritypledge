---
status: today
type: task
rank: 0.875
workstream: foundation
created_date: 2026-03-17T00:00:00.000Z
tags:
  - process
  - kdd
  - skills
locked_at: '2026-03-17T08:27:44.802Z'
---

# P541 — /kdd Decision Follow-up Tracking

## Goal

The `/kdd` skill captures decisions into `docs/decisions.md` but has no mechanism to convert actionable decisions into trackable work. Decisions documented with "Status: proposed" or follow-up language are written once and forgotten — there is no prompt to file a spec, no periodic review, and no visibility on the kanban.

Audit of `docs/decisions.md` found 6-7 decisions with untracked follow-up work. Example: the decision to make `/ux` build `/tree` preview pages (commit 8a944cb, 2026-03-16) was documented with "Status: proposed — implement via /claude-md gate" but never implemented and no spec was filed.

## Steps

### 1. Add follow-up scan to `/kdd` (after step 4 "Update docs")

After writing decisions to `docs/decisions.md`, scan each newly added decision's "Consequences" field for actionable language:

- `Status: proposed`
- `needed`
- `follow-up`
- `future spec`
- `TODO`

For each flagged decision, prompt the user:

> Decision '{title}' has follow-up work: "{matched text}". Create a spec? (y/n)

If yes, run `/quick-feature` to create a skeleton spec. The new spec should include a `source_decision:` line in its body referencing the decision title and date, linking it back to the originating decision.

### 2. Add stale-decision check to `/day` (or `/status`)

Add a step that runs the equivalent of `grep "Status: proposed" docs/decisions.md` and reports any unimplemented decisions older than 7 days. Output format:

> Untracked decisions (proposed, no linked spec):
> - "{title}" ({date}) — {matched consequence text}

This surfaces forgotten decisions during daily planning without requiring manual review.

## Done When

- [ ] `/kdd` detects actionable language in new decisions' Consequences and prompts user to create a spec
- [ ] Accepting the prompt runs `/quick-feature` and creates a skeleton spec linked to the decision
- [ ] Declining the prompt skips without error and `/kdd` completes normally
- [ ] `/status` (or `/day`) reports decisions with "Status: proposed" that have no linked spec
- [ ] At least one existing stale decision from `docs/decisions.md` is surfaced correctly by the check
