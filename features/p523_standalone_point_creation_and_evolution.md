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

# P523: Standalone Point Creation & Point Evolution ("Inspired By")

**Supersedes:** P433 (Correct a Point — draft, never implemented)
**Related:** P99 (Story After Position — draft, design questions)

---

## Problem Statement

**Current state:** Points can only be created by story authors, inline on their story detail page. There is no standalone "create a point" action. Point editing doesn't exist — points are immutable by design (once others stake positions, changing the statement would invalidate their positions).

**Pain points:**
- **No way to create a point without first creating a story.** Users who want to stake a claim and invite positions must first write a story, even when the point stands alone. The founder himself had to run raw SQL to evolve a point.
- **No guided path for point evolution.** When thinking evolves (through a /live session, new information, or changed confidence), the user's only option is to abandon their position on the old point and manually create an entirely new one — with no visible link between old and new.
- **Evolution is invisible.** When someone creates a refined version of a point, there's no connection between the original and the refinement. Other position-holders on the original never learn a refinement exists. New visitors can't see the thinking evolved.
- **In-session friction.** During a /live session with co-founders, if the conversation surfaces a better formulation of a point, there's no way to capture "this point evolved into that point" without leaving the session context.

**Who's affected:**
- **Point creators** — anyone whose thinking evolves (the founder is the first confirmed user with this need)
- **Position-holders on original points** — they should know a refinement exists so they can decide whether to engage with it
- **New visitors** — they should see both the original and its refinements to understand how thinking evolved

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge's core value proposition is calibrated communication — making thinking visible and verifiable. Point evolution is how calibrated thinking actually works: you hold a position, encounter new evidence or perspectives, and your view evolves. Currently the product captures a snapshot but not the evolution. This is a gap in the core loop.

**Why now:** The founder has this need today and had to use raw SQL. As more users create points (especially in co-founder sessions), this will block the explain-back flow: participants can't capture refined points that emerge from conversation.

**Impact if not solved:** Points remain frozen snapshots. The product implies "take a position once, forever" rather than "take a position, evolve it through calibrated conversation." This contradicts the core philosophy — understanding changes minds, and changed minds should be visible.

---

## Business Requirements

**Must-haves:**
1. Any authenticated user can create a point without creating a story first
2. When creating a point, user can optionally link it to an existing point as "inspired by"
3. The original point shows that refinements exist (backlink) so position-holders can discover them
4. The refined point shows what it was inspired by (forward link) so visitors see the lineage
5. Creating an "inspired by" point does NOT move, copy, or affect the user's position or story on the original — those are separate actions
6. Points remain immutable once created — evolution happens through new linked points, not edits

**Success conditions:**
- A user can go from "I want to refine this point" to "new point exists, linked to original" in under 60 seconds
- Position-holders on the original can see "1 refinement exists" without being pushed to move
- The evolution chain is navigable: original → refinement → refinement of refinement

**Constraints:**
- Points are public (no visibility column) — this doesn't change
- No notifications required in V1 (discovery via backlink on the point page is sufficient)
- No forced migration of positions — users choose whether to engage with a refinement
- No limit on how many "inspired by" children a point can have (multiple people might refine the same point differently — divergence is valid)

---

## User Stories

**As a user who wants to make a standalone claim:**
- I want to create a point without writing a story first, so I can stake a position on a claim and invite others to engage with it directly

**As a user whose thinking evolved:**
- I want to create a new point "inspired by" an existing one, so the evolution of my thinking is visible and linked
- I want my position on the original point to remain unchanged, so I don't lose my history (I'll move it manually if I choose to)

**As a position-holder on an original point:**
- I want to see that refinements of this point exist, so I can decide whether to explore them on my own terms
- I want to NOT be notified or prompted to move — just the quiet indicator that refinements exist

**As a new visitor browsing points:**
- I want to see "inspired by [original point]" on a refinement, so I understand the lineage
- I want to navigate between original and refinement easily, so I can follow how thinking evolved

**As a user viewing a point with refinements:**
- I want to see how many refinements exist and navigate to them, so I can explore the discourse tree

---

## Jobs to Be Done

**When I have a clear claim but no story to tell:**
- I want to create a point directly, so I can invite positions without the overhead of a story (motivation: lower friction for participation)

**When a /live session surfaces a better formulation:**
- I want to capture the evolved point and link it to the original, so the session's output is preserved in the discourse (motivation: not losing session insights)

**When I revisit my old positions and my thinking has changed:**
- I want to create a refined point and link it, so my intellectual journey is visible (motivation: showing I'm someone whose views evolve through evidence)

**When I see a point I mostly agree with but the wording is off:**
- I want to create my version and link it, so others can see both formulations and choose which resonates (motivation: contributing to discourse without overwriting someone else's claim)

---

## Outcomes (Success Metrics)

**Unblock metric:**
- The founder can create and evolve points from the UI (no more raw SQL) — binary pass/fail

**Usage metrics (observe after shipping, no targets yet):**
- How many standalone points are created (vs. story-linked points)?
- How many "inspired by" links are created?
- Do position-holders on originals navigate to refinements?

**Quality signals:**
- Points created standalone are roughly the same quality as story-extracted points (no flood of low-quality content)
- Evolution chains stay short (1-2 levels) — if they go deeper, might indicate the feature is being misused or there's a UX problem

---

## Acceptance Criteria

- [ ] Authenticated user can create a point from a dedicated entry point (not tied to story creation)
- [ ] Point creation form includes: statement text field + position selection (same as current inline form)
- [ ] Point creation form includes optional "inspired by" field to link to an existing point
- [ ] "Inspired by" linking is by selecting/searching existing points (not free text)
- [ ] Created point appears in the points feed and on the user's profile
- [ ] Point detail page shows "Inspired by: [original point]" with link when applicable
- [ ] Original point detail page shows "N refinements" indicator with navigation to children
- [ ] Creating an "inspired by" point does not affect positions or stories on the original
- [ ] A point can have multiple "inspired by" children (divergent evolution is valid)
- [ ] An "inspired by" point can itself be the parent of further refinements (chains work)
- [ ] Points created standalone (without "inspired by") work identically to current points

---

## Open Questions (for UX/Architect phases)

1. **Entry points:** Where does "Create a point" live? Top-level nav? Feed? Point detail page ("Create refinement")? Multiple entry points?
2. **"Inspired by" selection UX:** Search by text? Recent points? Only points the user has positioned on? How to handle hundreds of points?
3. **Backlink display:** How prominent is "N refinements" on the original? Badge? Section? Link in footer?
4. **Feed behavior:** Do refinements appear as new items in the feed, or are they grouped with the original?
5. **Story linking (post-creation):** After creating a standalone point, should the user be prompted to link or write a story? Or is that a separate action?
6. **Quality concern:** Without AI extraction or story context, will standalone points be lower quality? Is that acceptable? Should there be a soft guidance ("A good point is a falsifiable claim...")?

---

## Next Steps

1. **Review this PRD** — approve or request changes
2. **Run `/challenge-prd`** — recommended, this is a novel interaction pattern
3. **Run `/ux`** — design the creation flow, entry points, "inspired by" selection, backlink display
4. **Run `/architect`** — design `inspired_by_point_id` column, RLS, service layer changes
5. **Run `/generate-tests`** → **`/dev`** → ship
