---
status: backlog
type: story
rank: 125474.0
workstream: C1
tags: [points, ux, positions, calibration]
prepped_date: '2026-02-24'
---

# P433: "Correct a Point" UX Path (Draft)

## Concept

Points are immutable by design — once others stake positions on a shared claim, you can't edit it. But a user who wants to fix poor wording or a factual error in a point they extracted has no guided path to do so.

The correct model is:
1. Remove position on the old point
2. File a new story (or reuse existing)
3. Extract a corrected point
4. Stake position on the new point

The old point remains in the discourse; other positions on it are unaffected.

## Why this is not urgent

Before the first workshop, Slava controls all content. Participants won't be correcting points in V1 — they'll be filing their first stories. This becomes relevant once multiple users are extracting points independently.

## What would make this feel smooth

- A "this wording isn't right" affordance on a point the user extracted
- Guided flow: "Want to file a corrected version?" → opens filing chat pre-seeded with the original point text → extraction step produces the corrected point → old position is removed, new one staked
- The old point is not deleted — just orphaned of this user's position

## Open questions before spec-ing

- Does "remove position" exist as a UI action? (May not be implemented yet)
- Should the old point be flagged as "superseded" somehow, or just quietly orphaned?
- Is this only for the point creator, or anyone who staked a position?

## Prerequisites

- P425 (core loop) must ship
- P427 (story edit/delete) useful context
- Run `/create-prd` when ready
