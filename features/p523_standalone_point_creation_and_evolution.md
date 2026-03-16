---
status: today
type: story
rank: 0.75
tags:
  - points
  - creation
  - evolution
  - ux
delivery_stage: 1-prd-review
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T14:22:58.149Z'
---

# P523: Point Creation from Point Detail + "Inspired By" Link

**Supersedes:** P433 (Correct a Point — draft, never implemented)
**Related:** P99 (Story After Position — draft, design questions)

---

## Challenge Resolution (2026-03-16)

Original PRD was broader (standalone creation + full evolution chains). `/challenge-prd` returned CHALLENGE with 4 BLOCKs:
1. Strategic misalignment with C1 ("build nothing new")
2. Zero external demand (n=1, founder SQL incident)
3. Problem misidentification (real pain = evolving locked points, not standalone creation)
4. Core UX undefined (standalone points in feed contradict philosophy)

**Resolution:** Narrowed scope after founder confirmed event/workshop participants already self-serve and have wanted to reformulate points. Entry point is the point detail page, not a standalone creation page. "Inspired by" is a single nullable FK — no chain navigation UI, no feed changes.

---

## Problem Statement

**Current state:** Points can only be created by story authors inline on their story detail page. When a user (event participant, workshop attendee, co-founder in a /live session) sees a point they mostly agree with but would word differently, they have no way to create their version. The founder had to run raw SQL to evolve a point.

**Pain points:**
- **No "I'd word this differently" action on points.** Users who disagree with wording but agree with the spirit have no guided path to propose an alternative formulation.
- **Evolution is invisible.** When someone creates a refined version manually (new story → new point), there's no link between old and new. The discourse looks fragmented.
- **In-session friction.** During events and /live sessions, when conversation surfaces a better formulation, there's no way to capture the evolution.

**Who's affected:**
- **Event/workshop participants** — they self-serve on the platform and encounter points they'd reformulate
- **Co-founders in /live sessions** — better formulations emerge through conversation
- **The founder** — needs to evolve points without SQL

---

## Intention (Why This Matters)

**Strategic importance:** Calibrated thinking means views evolve through evidence and conversation. The product should capture this evolution, not just snapshots.

**Why now:** Event participants already self-serve. The need to reformulate points has been observed in events and sessions. Currently blocked by UI.

**Impact if not solved:** Points look frozen. Users who'd contribute refined formulations can't. The platform misses the discourse evolution that makes calibration visible.

---

## Business Requirements

**Must-haves:**
1. Any authenticated user can create a new point from the point detail page ("Suggest a different version")
2. The new point form is pre-filled with the original text for editing
3. The new point is linked to the original via `inspired_by_point_id` (nullable FK)
4. The original point shows "N alternative versions" with navigation to children
5. The new point shows "Inspired by: [original]" with link back
6. Creating a linked point does NOT affect positions or stories on the original
7. Points remain immutable — evolution happens through new linked points, not edits

**Out of scope (deferred):**
- Standalone point creation page (no entry point outside point detail page)
- Chain navigation UI (if A inspires B inspires C — no tree view, just direct parent/child links)
- Feed changes (new points appear in feed same as any point — no grouping with parent)
- Notifications to position-holders on original
- Link types (child, answer, opposed) — single unlabeled link only (see P535)
- Short IDs for points/stories (@point_id referencing) (see P536)

**Success conditions:**
- User can go from "I'd word this differently" to "new linked point exists" in under 60 seconds
- Position-holders on original can see alternative versions exist (quiet indicator)

**Constraints:**
- Entry point: point detail page only (not nav, not feed, not standalone page)
- Points are public — no visibility changes
- No forced migration of positions

---

## User Stories

**As a user who'd word a point differently:**
- I want to create my version from the point detail page, so I can contribute a better formulation without overwriting the original

**As a user whose thinking evolved in a session:**
- I want to capture the evolved formulation and link it, so the conversation's output is visible in the discourse

**As a position-holder on the original:**
- I want to see that alternative versions exist, so I can explore them on my own terms

**As a visitor viewing a linked point:**
- I want to see "Inspired by: [original]" with a link, so I understand the lineage

---

## Jobs to Be Done

**When I see a point I mostly agree with but the wording is off:**
- I want to create my version from this page, so others can see both formulations and choose which resonates

**When a /live session or event surfaces a better formulation:**
- I want to capture it linked to the original, so the evolution is preserved

---

## Outcomes (Success Metrics)

**Unblock metric:**
- Users (including founder) can create and link points from the UI — binary pass/fail

**Usage metrics (observe, no targets):**
- How many "inspired by" points are created?
- Do position-holders on originals navigate to alternative versions?

---

## Acceptance Criteria

- [ ] Point detail page shows "Suggest a different version" button for authenticated users
- [ ] Button opens creation form pre-filled with original point text
- [ ] Form includes: editable statement text + position selection
- [ ] Submitting creates a new point with `inspired_by_point_id` set to the original
- [ ] New point appears in feed and on user's profile (same as any point)
- [ ] New point detail page shows "Inspired by: [original point text]" with link
- [ ] Original point detail page shows "N alternative versions" with links to children
- [ ] Creating a linked point does not affect positions or stories on the original
- [ ] A point can have multiple children (divergent alternatives valid)
- [ ] Works for any authenticated user, not just the original point's author

---

## Next Steps

1. **Run `/ux`** — design button placement, form layout, backlink display
2. **Run `/architect`** — design `inspired_by_point_id` column, RLS, service changes
3. **Run `/dev`** → ship
