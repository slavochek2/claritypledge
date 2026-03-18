---
status: today
type: story
rank: 0.063
tags:
  - points
  - references
  - discourse
  - ux
delivery_stage: 1-prd-review
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T14:22:58.149Z'
---

# P523: Point-to-Point References & Standalone Point Creation

**Supersedes:** P433 (Correct a Point — draft), P535 (Point Link Types — absorbed, deferred as V2)
**Related:** P536 (Short IDs — separate, backlog)

---

## Design History

**V1 (2026-03-15):** "Inspired By" single FK parent-child model. Challenged: too restrictive.
**V2 (2026-03-16):** Narrowed to "Suggest a different version" button. Challenged: still too narrow.
**V3 (2026-03-17):** Generic N:N point references. Challenged: no user demand evidence, C1 tension.
**V4 (2026-03-18):** Resolved challenge BLOCKs. Added standalone point creation, clarified three distinct actions, resolved auth and directionality questions.

Key decisions from discovery (V1-V4):
1. Every response is a point (not a comment) — people can agree/disagree with it
2. References are bi-directional and passive ("N related points")
3. Unlabeled links in V1. Direction inferred from positions when available, "related" when not
4. Point-to-point only (stories already link via `story_points`)
5. Verified users only (matches existing point creation auth)
6. "False premise" is a referenced counter-point, not a position value — no scale change
7. Standalone point creation is a prerequisite (currently only possible via story-author flow)

---

## Problem Statement

**Current state:** Points can only be created by story authors inline on their story detail page. Points exist as isolated claims with no connections to each other. When session participants reformulate, contradict, or build on points — the new point has no visible relationship to the original.

**Pain points:**
- **No standalone point creation.** Users must create a story first to create a point. No "Create Point" equivalent of "Create Story" in the nav/feed.
- **No way to say "this responds to that."** Points from the same discourse float separately.
- **Contradictions and evolution are invisible.** Related points look unrelated.
- **The founder needs SQL** to create or evolve points outside the story-author flow.

**Who's affected:**
- **Session participants** — the founder captures their claims as points during sessions, needs them connected
- **Event/workshop participants** — self-serve, encounter points they'd respond to
- **The founder** — needs to create and link points from the UI
- **Visitors** — see isolated claims without discourse context

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge measures asymmetric conversion — do opponents convert after understanding? For that to work, opposing and related points must be visibly connected. Currently the product shows individual claims but not the discourse between them.

**Why now:** Sessions are running. Points emerge from conversations. The founder captures them via SQL. Participants want their claims captured and connected. This is blocking the session output loop.

---

## Business Requirements

**Must-haves:**

### Standalone Point Creation
1. Verified users can create a point independently (not tied to story creation)
2. Entry points: point detail page ("Respond to this point"), plus at least one top-level entry (nav, feed, or profile)
3. When creating a point, user takes a position on it (same as existing AddPointForm)

### Point References
4. Any verified user can create a reference (link) between two existing points
5. When creating a new point, user can optionally reference existing point(s) as context
6. References are bi-directional — both points show the connection ("N related points")
7. Creating a reference does NOT affect positions or stories on either point
8. References are unlabeled in V1 (no type taxonomy)
9. N:N — a point can have multiple references (both as source and target)
10. Duplicate references prevented (same pair cannot be linked twice)

### Directionality (derived, not user-input)
11. When a user has positions on both referenced points, the system infers direction (same-sign = aligned, opposite-sign = tension)
12. When positions don't exist on both, display as "related" (no direction)
13. Visual treatment of direction deferred to /ux

**Out of scope (deferred):**
- Link type labels (refines, contradicts, extends) — V2 after 10+ links show clustering
- Story-to-story or story-to-point references (existing `story_points` handles this)
- Notifications when someone references your point
- Feed grouping by reference clusters
- Position scale changes (no "false premise" position — handled via referenced counter-points)

**Success conditions:**
- Create a standalone point in under 30 seconds
- Create a reference between two points in under 30 seconds
- Both points show the reference (bi-directional, passive)
- Discourse structure is browsable — visitors can follow reference links

**Constraints:**
- Verified users only (matches existing point creation auth)
- Points remain immutable — references are metadata alongside, not modifications
- No forced position changes on either point

---

## User Stories

**As a facilitator capturing session output:**
- I want to create points directly (without stories), so I can capture claims as they emerge in conversation
- I want to link a new point to an existing one, so the discourse relationship is visible

**As a session participant:**
- I want my claim captured as a point that others can engage with (agree, disagree, reference)
- I want to see how my point relates to others in the discourse

**As a user responding to a point:**
- I want to create a new point from the point detail page referencing the original, so my response is connected
- I want to create a counter-point and have the system show the tension (inferred from my positions)

**As a user who sees two related points:**
- I want to link them, so visitors can see the relationship (without creating a new point)

**As a visitor browsing points:**
- I want to see "N related points" and navigate between them
- I want to understand whether related points agree or challenge each other (when derivable from positions)

---

## Jobs to Be Done

**When I'm facilitating a session and a participant makes a claim:**
- I want to capture it as a point directly, linked to the point we were discussing (motivation: preserving session discourse)

**When I see a point I'd word differently:**
- I want to create my version and link it (motivation: contributing without overwriting)

**When a session surfaces a contradiction:**
- I want both sides as linked points (motivation: making disagreement visible and falsifiable)

**When I'm curating discourse and find related points:**
- I want to link existing points together (motivation: organizing the discourse graph)

---

## Outcomes (Success Metrics)

**Unblock metric:**
- Founder can create points and references from the UI — binary pass/fail

**Usage metrics (observe, no targets):**
- Standalone points created vs story-linked points
- References created per point
- Click-through rate on "N related points"
- Direction inference accuracy (do inferred directions match actual relationship?)

---

## Acceptance Criteria

### Standalone Point Creation
- [ ] Verified user can create a point from a dedicated entry point (not tied to story creation)
- [ ] Point creation available from: (a) point detail page, (b) at least one top-level location
- [ ] Form includes: statement text + position selection (matches existing AddPointForm)
- [ ] Created point appears in feed and on user's profile

### Point References
- [ ] Verified user can create a reference between two existing points from point detail page
- [ ] When creating a new point, user can optionally select existing point(s) to reference
- [ ] Both source and target point detail pages show "N related points" with navigation
- [ ] "N related points" is clickable → shows list of linked points (truncated statements, navigable)
- [ ] Creating a reference does not affect positions, stories, or any data on either point
- [ ] A point can have multiple references (N:N)
- [ ] Duplicate references prevented
- [ ] Any verified user can create references (not limited to point authors)
- [ ] References are unlabeled — no type selection required

### Directionality
- [ ] When user has positions on both linked points: system infers aligned vs tension from position signs
- [ ] When positions don't exist on both: shown as "related" (no direction indicator)
- [ ] Direction is display-only — not stored, derived at render time

---

## Next Steps

1. **Run `/ux`** — design all three flows (standalone creation, create-with-reference, link-existing), "N related points" display, directionality indicator, entry points
2. **Run `/architect`** — design `point_references` junction table, standalone point creation service, RLS
3. **Run `/generate-tests`** → **`/spec-review`** → **`/dev`** → **`/verify`**
